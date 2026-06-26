<?php

declare(strict_types=1);

function new_school_upsert_user_account(string $fullName, string $email, string $password, string $role): array
{
    $pdo = db();
    $stmt = $pdo->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
    $stmt->execute([$email]);
    $existing = $stmt->fetch();
    $passwordHash = password_hash($password, PASSWORD_DEFAULT);

    if ($existing) {
        if (in_array((string) $existing['role'], ['admin', 'super_admin', 'editor'], true)) {
            json(['error' => 'That email is already reserved for an administrator account.'], 409);
        }

        $existingApproval = (string) ($existing['approval_status'] ?? 'pending');
        $nextApproval = $existingApproval === 'approved' ? 'approved' : 'pending';

        $update = $pdo->prepare(
            'UPDATE users
             SET full_name = ?,
                 password_hash = ?,
                 role = ?,
                 approval_status = ?,
                 approval_note = CASE WHEN ? = "approved" THEN approval_note ELSE NULL END,
                 approval_reviewed_by_user_id = CASE WHEN ? = "approved" THEN approval_reviewed_by_user_id ELSE NULL END,
                 approval_reviewed_at = CASE WHEN ? = "approved" THEN approval_reviewed_at ELSE NULL END,
                 email_verified_at = COALESCE(email_verified_at, NOW()),
                 email_verification_otp_hash = NULL,
                 email_verification_otp_expires_at = NULL,
                 email_verification_otp_sent_at = NULL,
                 email_verification_otp_attempts = 0
             WHERE id = ?'
        );
        $update->execute([$fullName, $passwordHash, $role, $nextApproval, $nextApproval, $nextApproval, $nextApproval, $existing['id']]);

        $fresh = $pdo->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
        $fresh->execute([(int) $existing['id']]);
        $user = $fresh->fetch();
        if (!$user) {
            json(['error' => 'Unable to load the saved account.'], 500);
        }
        return $user;
    }

    $insert = $pdo->prepare(
        'INSERT INTO users (
            full_name,
            email,
            password_hash,
            role,
            approval_status,
            approval_note,
            approval_reviewed_by_user_id,
            approval_reviewed_at,
            email_verified_at,
            email_verification_otp_hash,
            email_verification_otp_expires_at,
            email_verification_otp_sent_at,
            email_verification_otp_attempts
         ) VALUES (?, ?, ?, ?, "pending", NULL, NULL, NULL, NOW(), NULL, NULL, NULL, 0)'
    );
    $insert->execute([$fullName, $email, $passwordHash, $role]);

    $fresh = $pdo->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
    $fresh->execute([(int) $pdo->lastInsertId()]);
    $user = $fresh->fetch();
    if (!$user) {
        json(['error' => 'Unable to create the account.'], 500);
    }
    return $user;
}

/** Word count of a free-text field. */
function new_school_count_words(string $text): int
{
    preg_match_all('/\S+/u', trim($text), $m);
    return count($m[0] ?? []);
}

/** Validate a long-answer field is between $min and $max words (sends 422 + exits on failure). */
function new_school_assert_words(string $text, string $label, int $min = 50, int $max = 500): void
{
    $n = new_school_count_words($text);
    if ($n < $min) { json(['error' => "$label needs at least $min words (you wrote $n)."], 422); }
    if ($n > $max) { json(['error' => "$label must be $max words or fewer (you wrote $n)."], 422); }
}

/** Validate a short field meets a character minimum (a single letter is never valid). */
function new_school_assert_min_chars(string $text, string $label, int $min = 3): void
{
    if (mb_strlen(trim($text)) < $min) { json(['error' => "$label must be at least $min characters."], 422); }
}

/* ---- Records CRUD helpers (role-scoped: admin / school / teacher / student / parent) ---- */
function ns_manage_require_user(): array
{
    $user = require_login();
    if (!in_array($user['role'], ['student', 'parent', 'school', 'teacher', 'admin', 'super_admin', 'editor'], true)) {
        json(['error' => 'This action requires a New School account.'], 403);
    }
    return $user;
}

/**
 * Resolve the access scope for the signed-in user. Returns:
 *   ['kind' => 'admin']                                       full access
 *   ['kind' => 'school',  'school_id'  => int]                this school only
 *   ['kind' => 'teacher', 'teacher_id' => int, 'school_id'=>int]  this teacher's class
 *   ['kind' => 'student', 'student_id' => int]                this student only
 *   ['kind' => 'parent',  'student_id' => int]                the linked student only
 */
function ns_manage_scope(array $user): array
{
    $role = (string) $user['role'];
    if (in_array($role, ['admin', 'super_admin', 'editor'], true)) {
        return ['kind' => 'admin'];
    }
    if ($role === 'school') {
        $school = new_school_fetch_school_by_user_id((int) $user['id']);
        if (!$school) {
            json(['error' => 'No school is linked to this account.'], 403);
        }
        return ['kind' => 'school', 'school_id' => (int) $school['id']];
    }
    if ($role === 'teacher') {
        $teacher = new_school_fetch_teacher_by_user_id((int) $user['id']);
        if (!$teacher) {
            json(['error' => 'No teacher profile is linked to this account.'], 403);
        }
        return ['kind' => 'teacher', 'teacher_id' => (int) $teacher['id'], 'school_id' => (int) $teacher['school_id']];
    }
    if ($role === 'student') {
        $student = new_school_fetch_student_by_user_id((int) $user['id']);
        if (!$student) {
            json(['error' => 'No student profile is linked to this account.'], 403);
        }
        return ['kind' => 'student', 'student_id' => (int) $student['id']];
    }
    if ($role === 'parent') {
        $parent = new_school_fetch_parent_by_user_id((int) $user['id']);
        if (!$parent) {
            json(['error' => 'No parent profile is linked to this account.'], 403);
        }
        return ['kind' => 'parent', 'student_id' => (int) $parent['student_id']];
    }
    json(['error' => 'This action is not allowed for your account.'], 403);
}

function ns_manage_assert_student(array $student, array $scope): void
{
    switch ($scope['kind']) {
        case 'admin':
            return;
        case 'school':
            if ((int) ($student['school_id'] ?? 0) === (int) $scope['school_id']) return;
            break;
        case 'teacher':
            if ((int) ($student['teacher_id'] ?? 0) === (int) $scope['teacher_id']) return;
            break;
        case 'student':
        case 'parent':
            if ((int) ($student['id'] ?? 0) === (int) $scope['student_id']) return;
            break;
    }
    json(['error' => 'This record is outside your access.'], 403);
}

// Whether the scope may create/delete a whole record of the given entity.
function ns_manage_can_write_entity(array $scope, string $entity, string $op): bool
{
    $kind = $scope['kind'];
    if ($kind === 'admin') return true;
    if ($kind === 'school') {
        // principal manages roster + participation approvals only; submission/interview
        // CONTENT is admin-only (data isolation).
        return in_array($entity, ['student', 'teacher', 'approval'], true);
    }
    if ($kind === 'teacher') {
        // teacher is read-only; participation approve/deny is a dedicated route, not a manage write.
        return false;
    }
    if ($kind === 'student' || $kind === 'parent') {
        // self-service: own interviews + submission only (no create/delete of people/approvals)
        return in_array($entity, ['interview', 'submission'], true);
    }
    return false;
}

function ns_manage_random_password(): string
{
    return 'Ns!' . bin2hex(random_bytes(6)) . 'A1';
}

function ns_manage_bool(array $body, string $key): int
{
    $v = $body[$key] ?? false;
    return ($v === true || $v === 1 || $v === '1' || $v === 'true' || $v === 'yes') ? 1 : 0;
}

/**
 * School leaderboard ranked by number of students joined, with day-over-day
 * rank movement. A daily snapshot is stored so movement can be compared to the
 * previous day. Returns rows: school_id, school_name, status, student_count,
 * rank, previous_rank, movement (+ = climbed, - = dropped, 0 = no prior/new).
 */
function new_school_school_rankings(): array
{
    $pdo = db();
    $rows = $pdo->query(
        'SELECT s.id, s.school_name, s.status, COUNT(st.id) AS student_count
         FROM new_school_schools s
         LEFT JOIN new_school_students st ON st.school_id = s.id
         GROUP BY s.id, s.school_name, s.status
         ORDER BY student_count DESC, s.created_at ASC, s.id ASC'
    )->fetchAll();

    $today = date('Y-m-d');
    $ranked = [];
    $rank = 0;
    foreach ($rows as $r) {
        $rank++;
        $ranked[] = [
            'school_id' => (int) $r['id'],
            'school_name' => (string) $r['school_name'],
            'status' => (string) $r['status'],
            'student_count' => (int) $r['student_count'],
            'rank' => $rank,
        ];
    }

    // Persist today's snapshot (idempotent) for day-over-day movement.
    $ins = $pdo->prepare(
        'INSERT INTO new_school_school_rank_snapshots (school_id, rank_position, student_count, snapshot_date)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE rank_position = VALUES(rank_position), student_count = VALUES(student_count)'
    );
    foreach ($ranked as $r) {
        $ins->execute([$r['school_id'], $r['rank'], $r['student_count'], $today]);
    }

    // Compare against the most recent snapshot from a previous day.
    $prevStmt = $pdo->prepare(
        'SELECT rank_position FROM new_school_school_rank_snapshots
         WHERE school_id = ? AND snapshot_date < ? ORDER BY snapshot_date DESC LIMIT 1'
    );
    foreach ($ranked as &$row) {
        $prevStmt->execute([$row['school_id'], $today]);
        $prev = $prevStmt->fetchColumn();
        if ($prev === false) {
            $row['previous_rank'] = null;
            $row['movement'] = 0;
        } else {
            $row['previous_rank'] = (int) $prev;
            $row['movement'] = (int) $prev - $row['rank']; // + climbed, - dropped
        }
    }
    unset($row);

    return $ranked;
}

function new_school_build_student_context(array $student): array
{
    $refreshed = new_school_refresh_student_status((int) $student['id']);
    if ($refreshed) {
        $student = $refreshed;
    }

    $studentId = (int) $student['id'];
    $interviews = new_school_fetch_student_interviews($studentId);
    $interviewCount = count($interviews);
    $submission = new_school_fetch_submission_by_student_id($studentId);
    $winner = new_school_fetch_winner_by_student_id($studentId);
    $scholarship = new_school_scholarship_fetch($studentId);
    $school = !empty($student['school_id'])
        ? new_school_fetch_school_by_id((int) $student['school_id'])
        : new_school_fetch_school_by_name((string) ($student['school_name'] ?? ''));
    $teacher = !empty($student['teacher_id'])
        ? new_school_fetch_teacher_by_id((int) $student['teacher_id'])
        : null;
    $schoolStudents = $school ? new_school_rank_students(new_school_fetch_students_for_school($school)) : [];
    $teacherStudents = $teacher ? new_school_rank_students(new_school_fetch_students_for_teacher($teacher)) : [];
    $schoolTeachers = $school ? new_school_rank_teachers(new_school_fetch_teachers_for_school((int) $school['id']), $schoolStudents) : [];

    return [
        'student' => $student,
        'school' => $school,
        'teacher' => $teacher,
        'parent' => new_school_fetch_parent_by_student_id($studentId),
        'interview_count' => $interviewCount,
        'interviews' => $interviews,
        'approvals' => new_school_fetch_student_approvals($studentId),
        'submission' => $submission,
        'winner' => $winner,
        'scholarship' => [
            'completed' => $scholarship !== null && !empty($scholarship['completed']),
            'answers' => $scholarship['answers'] ?? [],
            'word_limit' => NS_SCHOLARSHIP_WORD_LIMIT,
        ],
        'notifications' => new_school_fetch_notifications_for_scope([$studentId], ['student', 'parent'], 12),
        'status_tracker' => new_school_status_tracker($student, $interviewCount),
        'submission_locked' => new_school_submission_is_locked($student, $interviewCount),
        'can_submit' => !new_school_submission_is_locked($student, $interviewCount),
        'performance_score' => new_school_student_performance_score(array_merge($student, [
            'interview_count' => $interviewCount,
            'submission_score' => $submission['score'] ?? null,
            'has_submission' => $submission ? 1 : 0,
        ])),
        'student_points' => new_school_points_total('student', $studentId),
        'rankings' => [
            'school' => [
                'position' => new_school_find_student_rank_position($schoolStudents, $studentId),
                'total' => count($schoolStudents),
                'leaderboard' => array_slice($schoolStudents, 0, 10),
                'teachers' => array_slice($schoolTeachers, 0, 10),
            ],
            'teacher' => [
                'position' => new_school_find_student_rank_position($teacherStudents, $studentId),
                'total' => count($teacherStudents),
                'leaderboard' => array_slice($teacherStudents, 0, 10),
            ],
        ],
    ];
}

function new_school_student_status_summary(array $students): array
{
    $summary = [
        'students_total' => count($students),
        'parent_pending' => 0,
        'parent_approved' => 0,
        'school_pending' => 0,
        'school_approved' => 0,
        'teacher_pending' => 0,
        'teacher_approved' => 0,
        'eligible_to_submit' => 0,
        'submitted' => 0,
        'interviews_total' => 0,
    ];

    foreach ($students as $student) {
        $interviews = (int) ($student['interview_count'] ?? 0);
        $summary['interviews_total'] += $interviews;

        if (($student['parent_consent_status'] ?? '') === 'approved') {
            $summary['parent_approved']++;
        } else {
            $summary['parent_pending']++;
        }

        if (($student['school_approval_status'] ?? '') === 'approved') {
            $summary['school_approved']++;
        } else {
            $summary['school_pending']++;
        }

        if (($student['teacher_approval_status'] ?? '') === 'approved') {
            $summary['teacher_approved']++;
        } else {
            $summary['teacher_pending']++;
        }

        if (
            $interviews >= 10
            && ($student['parent_consent_status'] ?? '') === 'approved'
            && ($student['school_approval_status'] ?? '') === 'approved'
            && ($student['teacher_approval_status'] ?? '') === 'approved'
        ) {
            $summary['eligible_to_submit']++;
        }

        if ((int) ($student['has_submission'] ?? 0) > 0 || in_array((string) ($student['submission_status'] ?? ''), ['submitted', 'complete'], true)) {
            $summary['submitted']++;
        }
    }

    return $summary;
}

function new_school_rows_to_csv(array $rows): string
{
    if ($rows === []) {
        return '';
    }

    $headers = array_keys($rows[0]);
    $handle = fopen('php://temp', 'r+');
    if ($handle === false) {
        return '';
    }

    fputcsv($handle, $headers);
    foreach ($rows as $row) {
        $line = [];
        foreach ($headers as $header) {
            $value = $row[$header] ?? '';
            if (is_array($value)) {
                $value = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            }
            $line[] = (string) $value;
        }
        fputcsv($handle, $line);
    }

    rewind($handle);
    $csv = stream_get_contents($handle);
    fclose($handle);

    return is_string($csv) ? $csv : '';
}

function new_school_handle_route(string $method, string $route): bool
{
    $body = body();
    $user = current_user();
    $key = $method . ' ' . $route;

    switch (true) {
        case $key === 'GET new-school/school-rankings': {
            require_login();
            json(['schools' => new_school_school_rankings()]);
        }

        case $key === 'GET new-school/overview': {
            $payload = [
                'challenge' => [
                    'title' => 'WHAT PROBLEM WILL YOU SOLVE?',
                    'subtitle' => 'Join New York\'s Largest Student Problem-Solving Movement',
                    'lead' => 'Students interview 10 local businesses, identify a community problem, develop a solution, and compete for scholarships, school grants, and statewide recognition.',
                    'registration_open' => '2026-06-27',
                    'winners_announced' => '2026-12-21',
                    'school_grant_amount' => 25000,
                    'student_scholarship_max_amount' => 10000,
                    'educator_award_label' => 'Educator Recognition Award',
                    'age_range' => '11-19',
                    'grade_range' => '6-12',
                    'deadline' => '2026-08-25',
                    'website' => 'FrantzCoutard.com',
                ],
                'summary' => [
                    'students' => 0,
                    'parents' => 0,
                    'schools' => 0,
                    'teachers' => 0,
                    'businesses' => 0,
                    'submissions' => 0,
                    'winners' => 0,
                ],
                'leaderboards' => [
                    'schools' => [],
                    'teachers' => [],
                    'students' => [],
                ],
                'schools' => [],
                'teachers' => [],
                'winners' => [],
                'workflow' => [
                    ['step' => 1, 'title' => 'Register', 'detail' => 'Students ages 11-19 create a challenge profile on the site.'],
                    ['step' => 2, 'title' => 'Interview 10 Local Businesses', 'detail' => 'Students meet with businesses to learn real community challenges.'],
                    ['step' => 3, 'title' => 'Identify A Community Problem', 'detail' => 'Interview notes become a clear problem statement to solve.'],
                    ['step' => 4, 'title' => 'Develop A Solution', 'detail' => 'Students build a practical plan that can make a measurable difference.'],
                    ['step' => 5, 'title' => 'Submit Your Project', 'detail' => 'The final video and written summary are uploaded for review.'],
                    ['step' => 6, 'title' => 'Compete For Scholarships & School Grants', 'detail' => 'Admin review publishes awards and recognition.'],
                ],
                'rules' => [
                    'Students must be ages 11-19.',
                    'Parent or guardian consent is required.',
                    'School and teacher approval must be complete before final submission.',
                    'A student must log 10 business interviews.',
                    'Every approval stores time, name, and digital signature.',
                ],
                'prizes' => [
                    ['place' => 'First', 'amount' => 2500, 'label' => 'Scholarship Award'],
                    ['place' => 'Second', 'amount' => 1500, 'label' => 'Scholarship Award'],
                    ['place' => 'Third', 'amount' => 1000, 'label' => 'Scholarship Award'],
                ],
                'submission_requirements' => [
                    'Video length up to 1 minute and 30 seconds',
                    'One-page written summary',
                    'Business name, owner name, address, phone, date of visit',
                    'Challenge identified, proposed solution, and expected impact',
                ],
                'user' => $user,
            ];

            try {
                $payload['schools'] = array_map(
                    static fn(array $school): array => [
                        'id' => (int) $school['id'],
                        'school_name' => (string) $school['school_name'],
                        'school_district' => (string) $school['school_district'],
                        'status' => (string) $school['status'],
                    ],
                    new_school_fetch_all_schools(true)
                );

                $payload['teachers'] = array_map(
                    static fn(array $teacher): array => [
                        'id' => (int) $teacher['id'],
                        'school_id' => (int) ($teacher['school_id'] ?? 0),
                        'teacher_full_name' => (string) $teacher['teacher_full_name'],
                        'school_name' => (string) ($teacher['linked_school_name'] ?? ''),
                        'status' => (string) $teacher['status'],
                    ],
                    new_school_fetch_all_teachers(true)
                );

                $payload['winners'] = db()->query(
                    'SELECT w.id, w.place, w.scholarship_amount, w.announced_at, w.published_at,
                            s.full_name AS student_name, s.grade_level, sc.school_name, sub.score, sub.rank_position
                     FROM new_school_winners w
                     INNER JOIN new_school_students s ON s.id = w.student_id
                     INNER JOIN new_school_submissions sub ON sub.id = w.submission_id
                     LEFT JOIN new_school_schools sc ON sc.id = s.school_id
                     ORDER BY w.created_at DESC'
                )->fetchAll();

                $payload['summary'] = new_school_public_summary();
                $payload['leaderboards'] = new_school_public_leaderboards();
            } catch (Throwable $e) {
                if (app_debug()) {
                    error_log('new-school overview fallback: ' . $e->getMessage());
                    $payload['warning'] = 'Overview data is using fallback content because the database is temporarily unavailable.';
                }
            }

            json($payload);
        }

        case $key === 'GET new-school/dashboard': {
            $user = require_login();
            new_school_parents_ensure_link_columns();

            if ($user['role'] === 'student') {
                $student = new_school_fetch_student_by_user_id((int) $user['id']);
                if (!$student) {
                    json(['error' => 'Student profile not found.'], 404);
                }
                json(array_merge([
                    'role' => 'student',
                    'user' => $user,
                ], new_school_build_student_context($student)));
            }

            if ($user['role'] === 'parent') {
                $parent = new_school_fetch_parent_by_user_id((int) $user['id']);
                if (!$parent) {
                    json(['error' => 'Parent profile not found.'], 404);
                }
                $student = new_school_fetch_student_by_id((int) $parent['student_id']);
                if (!$student) {
                    json(['error' => 'Student profile not found.'], 404);
                }
                json([
                    'role' => 'parent',
                    'user' => $user,
                    'parent' => $parent,
                    'student_context' => new_school_build_student_context($student),
                ]);
            }

            if ($user['role'] === 'school') {
                $school = new_school_fetch_school_by_user_id((int) $user['id']);
                if (!$school) {
                    json(['error' => 'School profile not found.'], 404);
                }
                $students = new_school_rank_students(new_school_fetch_students_for_school($school));
                $teachers = new_school_rank_teachers(new_school_fetch_teachers_for_school((int) $school['id']), $students);
                $studentIds = array_map(static fn(array $row): int => (int) $row['id'], $students);
                json(new_school_redact_dashboard([
                    'role' => 'school',
                    'user' => $user,
                    'school' => $school,
                    'teachers' => $teachers,
                    'summary' => new_school_student_status_summary($students),
                    'students' => $students,
                    'businesses' => new_school_fetch_businesses_by_student_ids($studentIds),
                    'approvals' => new_school_fetch_approvals_by_student_ids($studentIds),
                    'submissions' => new_school_fetch_submissions_by_student_ids($studentIds),
                    'winners' => new_school_fetch_winners_by_student_ids($studentIds),
                    'notifications' => new_school_fetch_notifications_for_scope($studentIds, ['school'], 12),
                    'leaderboards' => new_school_public_leaderboards(),
                    'rankings' => [
                        'students' => $students,
                        'teachers' => $teachers,
                    ],
                ], ['kind' => 'school']));
            }

            if ($user['role'] === 'teacher') {
                $teacher = new_school_fetch_teacher_by_user_id((int) $user['id']);
                if (!$teacher) {
                    json(['error' => 'Teacher profile not found.'], 404);
                }
                $students = new_school_rank_students(new_school_fetch_students_for_teacher($teacher));
                $school = new_school_fetch_school_by_id((int) $teacher['school_id']);
                $schoolTeachers = $school ? new_school_rank_teachers(new_school_fetch_teachers_for_school((int) $school['id']), $students) : [];
                $studentIds = array_map(static fn(array $row): int => (int) $row['id'], $students);
                json(new_school_redact_dashboard([
                    'role' => 'teacher',
                    'user' => $user,
                    'teacher' => $teacher,
                    'teacher_points' => new_school_points_total('teacher', (int) $teacher['id']),
                    'school' => $school,
                    'summary' => new_school_student_status_summary($students),
                    'students' => $students,
                    'businesses' => new_school_fetch_businesses_by_student_ids($studentIds),
                    'approvals' => new_school_fetch_approvals_by_student_ids($studentIds),
                    'parents' => new_school_fetch_parents_by_student_ids($studentIds),
                    'submissions' => new_school_fetch_submissions_by_student_ids($studentIds),
                    'winners' => new_school_fetch_winners_by_student_ids($studentIds),
                    'notifications' => new_school_fetch_notifications_for_scope($studentIds, ['teacher'], 12),
                    'leaderboards' => new_school_public_leaderboards(),
                    'rankings' => [
                        'students' => $students,
                        'teachers' => array_slice($schoolTeachers, 0, 10),
                    ],
                ], ['kind' => 'teacher']));
            }

            if (in_array($user['role'], ['admin', 'super_admin', 'editor'], true)) {
                json([
                    'role' => 'admin',
                    'user' => $user,
                    'summary' => new_school_public_summary(),
                    'leaderboards' => new_school_public_leaderboards(),
                ]);
            }

            json(['error' => 'Unsupported account role for this dashboard.'], 403);
        }

        case $key === 'POST new-school/profile/photo': {
            // Any logged-in user sets/clears their own profile photo (stored on users.avatar_url).
            $user = require_login();
            $avatarUrl = trim((string) field($body, 'avatar_url'));
            if ($avatarUrl !== '' && !preg_match('#^(/api/uploads/|https?://)#i', $avatarUrl)) {
                json(['error' => 'Invalid photo URL.'], 422);
            }
            if (mb_strlen($avatarUrl) > 255) {
                json(['error' => 'Photo URL is too long.'], 422);
            }
            db()->prepare('UPDATE users SET avatar_url = ?, updated_at = NOW() WHERE id = ?')
                ->execute([$avatarUrl !== '' ? $avatarUrl : null, (int) $user['id']]);
            json(['success' => true, 'avatar_url' => $avatarUrl !== '' ? $avatarUrl : null]);
        }

        case preg_match('#^GET new-school/parent/([a-f0-9]+)$#i', $key, $m) === 1: {
            $student = new_school_fetch_student_by_token($m[1]);
            if (!$student) {
                json(['error' => 'Invalid parent consent link.'], 404);
            }
            $school = !empty($student['school_id'])
                ? new_school_fetch_school_by_id((int) $student['school_id'])
                : new_school_fetch_school_by_name((string) ($student['school_name'] ?? ''));
            $teacher = !empty($student['teacher_id'])
                ? new_school_fetch_teacher_by_id((int) $student['teacher_id'])
                : null;
            // This endpoint is reached unauthenticated (the parent opens it from a QR
            // link before logging in), so expose only the fields the consent form needs
            // — never the student's DOB / home address / phone or any digital signature.
            $existingParent = new_school_fetch_parent_by_student_id((int) $student['id']);
            json([
                'token' => $m[1],
                'student' => [
                    'id' => (int) $student['id'],
                    'full_name' => (string) $student['full_name'],
                    'participant_id' => (string) $student['participant_id'],
                    'qr_url' => (string) ($student['qr_url'] ?? ''),
                    'school_id' => (int) ($student['school_id'] ?? 0),
                    'teacher_id' => (int) ($student['teacher_id'] ?? 0),
                    'school_name' => (string) $student['school_name'],
                    'grade_level' => (string) $student['grade_level'],
                    'parent_consent_status' => (string) $student['parent_consent_status'],
                ],
                'school' => $school ? [
                    'id' => (int) $school['id'],
                    'school_name' => (string) $school['school_name'],
                    'school_district' => (string) $school['school_district'],
                    'status' => (string) $school['status'],
                ] : null,
                'teacher' => $teacher ? [
                    'id' => (int) $teacher['id'],
                    'teacher_full_name' => (string) $teacher['teacher_full_name'],
                    'school_id' => (int) ($teacher['school_id'] ?? 0),
                    'status' => (string) $teacher['status'],
                ] : null,
                'parent' => $existingParent ? [
                    'id' => (int) $existingParent['id'],
                    'parent_full_name' => (string) ($existingParent['parent_full_name'] ?? ''),
                    'relationship' => (string) ($existingParent['relationship'] ?? ''),
                    'link_status' => (string) ($existingParent['link_status'] ?? ''),
                ] : null,
                'status_tracker' => new_school_status_tracker($student, new_school_student_interview_count((int) $student['id'])),
            ]);
        }

        case preg_match('#^GET new-school/student/([0-9]{8})$#', $key, $m) === 1: {
            $student = new_school_fetch_student_by_participant_id($m[1]);
            if (!$student) {
                json(['error' => 'Student not found.'], 404);
            }

            $school = !empty($student['school_id'])
                ? new_school_fetch_school_by_id((int) $student['school_id'])
                : new_school_fetch_school_by_name((string) ($student['school_name'] ?? ''));
            $teacher = !empty($student['teacher_id'])
                ? new_school_fetch_teacher_by_id((int) $student['teacher_id'])
                : null;

            json([
                'student' => [
                    'id' => (int) $student['id'],
                    'full_name' => (string) $student['full_name'],
                    'participant_id' => (string) $student['participant_id'],
                    'school_id' => (int) ($student['school_id'] ?? 0),
                    'teacher_id' => (int) ($student['teacher_id'] ?? 0),
                    'school_name' => (string) $student['school_name'],
                    'grade_level' => (string) $student['grade_level'],
                    'parent_consent_status' => (string) $student['parent_consent_status'],
                    'school_approval_status' => (string) $student['school_approval_status'],
                    'teacher_approval_status' => (string) $student['teacher_approval_status'],
                ],
                'school' => $school ? [
                    'id' => (int) $school['id'],
                    'school_name' => (string) $school['school_name'],
                    'school_district' => (string) $school['school_district'],
                    'status' => (string) $school['status'],
                ] : null,
                'teacher' => $teacher ? [
                    'id' => (int) $teacher['id'],
                    'teacher_full_name' => (string) $teacher['teacher_full_name'],
                    'status' => (string) $teacher['status'],
                    'school_id' => (int) ($teacher['school_id'] ?? 0),
                ] : null,
            ]);
        }

        case $method === 'POST' && preg_match('#^new-school/notifications/(\d+)/read$#', $route, $m) === 1: {
            $user = require_login();
            $notificationId = (int) $m[1];
            $notification = new_school_fetch_notification_by_id($notificationId);
            if (!$notification) {
                json(['error' => 'Notification not found.'], 404);
            }
            if (!new_school_notification_can_access($user, $notification)) {
                json(['error' => 'You cannot update this notification.'], 403);
            }

            $pdo = db();
            $update = $pdo->prepare(
                'UPDATE new_school_notifications
                 SET is_read = 1,
                     read_at = COALESCE(read_at, NOW()),
                     updated_at = NOW()
                 WHERE id = ?'
            );
            $update->execute([$notificationId]);

            json([
                'message' => 'Notification marked as read.',
                'notification' => new_school_fetch_notification_by_id($notificationId),
            ]);
        }

        case $key === 'POST new-school/student/register': {
            $fullName = require_name_field(field($body, 'full_name'), 'Student full name', 3);
            $username = field($body, 'student_username');
            $email = require_email(field($body, 'email'));
            $password = field($body, 'password');
            $age = (int) ($body['age'] ?? 0);
            $dob = field($body, 'date_of_birth');
            $phone = field($body, 'phone_number');
            $homeAddress = field($body, 'home_address');
            $zipCode = field($body, 'zip_code');
            $schoolName = field($body, 'school_name');
            $gradeLevel = field($body, 'grade_level');
            $parentName = field($body, 'parent_name');
            $parentPhone = field($body, 'parent_phone');
            $parentEmail = require_email(field($body, 'parent_email'));

            $schoolId = (int) ($body['school_id'] ?? 0);
            $teacherId = (int) ($body['teacher_id'] ?? 0);

            if ($username === '') json(['error' => 'Student username is required.'], 422);
            if (!preg_match('/^[A-Za-z0-9._-]{3,30}$/', $username)) json(['error' => 'Student username must be 3 to 30 characters and use only letters, numbers, dots, dashes, or underscores.'], 422);
            if ($password === '' || strlen($password) < 6) json(['error' => 'Password must be at least 6 characters.'], 422);
            if ($age < 11 || $age > 19) json(['error' => 'Students must be ages 11 to 19.'], 422);
            if ($dob === '') json(['error' => 'Date of birth is required.'], 422);
            if ($phone === '' || $homeAddress === '' || $gradeLevel === '' || ($schoolId <= 0 && $schoolName === '')) {
                json(['error' => 'Student contact and school details are required.'], 422);
            }
            if ($parentName === '' || $parentPhone === '' || $parentEmail === '') {
                json(['error' => 'Parent contact details are required.'], 422);
            }
            $phone = require_phone($phone, 'Student phone number');
            $parentName = require_name_field($parentName, 'Parent / Guardian name', 3);
            $parentPhone = require_phone($parentPhone, 'Parent phone number');

            $dateOfBirth = date_create($dob);
            if (!$dateOfBirth) {
                json(['error' => 'Date of birth is invalid.'], 422);
            }
            $today = new DateTime('today');
            if ($dateOfBirth > $today) {
                json(['error' => 'Date of birth cannot be in the future.'], 422);
            }
            $derivedAge = (int) $dateOfBirth->diff($today)->y;
            if ($derivedAge < 11 || $derivedAge > 19) {
                json(['error' => 'Date of birth does not match an eligible age (11-19).'], 422);
            }

            $pdo = db();
            $registerMode = field($body, 'register_mode');
            if ($registerMode === 'trendcatch_edu') {
                // TrendCatch EDU intake: the student's school isn't listed yet. Create/find an
                // unclaimed EDU-managed school and let them join it pending admin review.
                $school = new_school_find_or_create_edu_school($schoolName, field($body, 'edu_school_email'), field($body, 'school_website'));
                if (!$school) {
                    json(['error' => 'Enter your school name to register under TrendCatch EDU.'], 422);
                }
                new_school_add_notification(
                    null, 'admin', 'trendcatch_edu_intake', 'New TrendCatch EDU registration',
                    $fullName . ' registered under TrendCatch EDU for "' . $school['school_name'] . '".',
                    ['school_id' => (int) $school['id'], 'school_name' => $school['school_name'], 'role' => 'student']
                );
            } else {
                $school = $schoolId > 0
                    ? new_school_fetch_school_by_id($schoolId)
                    : ($schoolName !== '' ? new_school_fetch_school_by_name($schoolName) : null);
                if (!$school) {
                    json(['error' => 'Choose a school from the approved school list.'], 422);
                }
                if ((string) ($school['status'] ?? '') !== 'approved') {
                    json(['error' => 'This school must be approved before students can register under it.'], 422);
                }
            }
            $schoolId = (int) $school['id']; // resolve to the real id (school may have been matched/created by name)

            // Teacher is optional at registration; the school/teacher can assign one later.
            $teacher = $teacherId > 0 ? new_school_fetch_teacher_by_id($teacherId) : null;
            if ($teacherId > 0) {
                if (!$teacher) {
                    json(['error' => 'Choose a valid teacher from this school.'], 422);
                }
                if ((int) ($teacher['school_id'] ?? 0) !== (int) $school['id']) {
                    json(['error' => 'The selected teacher does not belong to the chosen school.'], 422);
                }
                if ((string) ($teacher['status'] ?? '') === 'rejected') {
                    json(['error' => 'The selected teacher has been rejected. Choose another teacher.'], 422);
                }
            }
            $teacherId = $teacher ? (int) $teacher['id'] : null;

            $checkUsername = $pdo->prepare('SELECT user_id FROM new_school_students WHERE student_username = ? LIMIT 1');
            $checkUsername->execute([$username]);
            $usernameTaken = $checkUsername->fetchColumn();

            $currentUser = $pdo->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
            $currentUser->execute([$email]);
            $existingUser = $currentUser->fetch();
            if ($usernameTaken && (!$existingUser || (int) $existingUser['id'] !== (int) $usernameTaken)) {
                json(['error' => 'That student username is already in use.'], 409);
            }

            $user = new_school_upsert_user_account($fullName, $email, $password, 'student');
            $studentStmt = $pdo->prepare('SELECT * FROM new_school_students WHERE user_id = ? LIMIT 1');
            $studentStmt->execute([(int) $user['id']]);
            $existingStudent = $studentStmt->fetch();

            $participantId = $existingStudent ? (string) $existingStudent['participant_id'] : new_school_generate_participant_id();
            $qrToken = $existingStudent ? (string) $existingStudent['qr_token'] : new_school_generate_qr_token();
            $qrUrl = $existingStudent ? (string) $existingStudent['qr_url'] : new_school_qr_url($qrToken);

            if ($existingStudent) {
                $update = $pdo->prepare(
                    'UPDATE new_school_students
                     SET school_id = ?,
                         teacher_id = ?,
                         full_name = ?,
                         student_username = ?,
                         age = ?,
                         date_of_birth = ?,
                         email = ?,
                         phone_number = ?,
                         home_address = ?,
                         zip_code = ?,
                         school_name = ?,
                         grade_level = ?,
                         parent_name = ?,
                         parent_phone = ?,
                         parent_email = ?,
                         updated_at = NOW()
                     WHERE id = ?'
                );
                $update->execute([
                    $schoolId,
                    $teacherId,
                    $fullName,
                    $username,
                    $age,
                    $dateOfBirth->format('Y-m-d'),
                    $email,
                    $phone,
                    $homeAddress,
                    $zipCode,
                    $schoolName,
                    $gradeLevel,
                    $parentName,
                    $parentPhone,
                    $parentEmail,
                    (int) $existingStudent['id'],
                ]);
                $studentId = (int) $existingStudent['id'];
            } else {
                $insert = $pdo->prepare(
                    'INSERT INTO new_school_students (
                        user_id, school_id, teacher_id, participant_id, qr_token, qr_url,
                        full_name, student_username, age, date_of_birth, email, phone_number,
                        home_address, zip_code, school_name, grade_level, parent_name, parent_phone, parent_email,
                        parent_consent_status, school_approval_status, teacher_approval_status, submission_status, overall_status
                     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "pending", "pending", "pending", "locked", "student_registered")'
                );
                $insert->execute([
                    (int) $user['id'],
                    $schoolId,
                    $teacherId,
                    $participantId,
                    $qrToken,
                    $qrUrl,
                    $fullName,
                    $username,
                    $age,
                    $dateOfBirth->format('Y-m-d'),
                    $email,
                    $phone,
                    $homeAddress,
                    $zipCode,
                    $schoolName,
                    $gradeLevel,
                    $parentName,
                    $parentPhone,
                    $parentEmail,
                ]);
                $studentId = (int) $pdo->lastInsertId();
            }

            $student = new_school_refresh_student_status($studentId);
            if (!$student) {
                json(['error' => 'Student registration failed.'], 500);
            }

            $studentSchool = $school ? (string) $school['school_name'] : $schoolName;
            new_school_add_notification(
                $studentId,
                'student',
                'registration',
                'Student registration complete',
                'Your challenge profile is ready. Use the QR link to open the parent consent flow.',
                ['participant_id' => $participantId, 'school_name' => $studentSchool, 'qr_url' => $qrUrl]
            );
            new_school_add_notification(
                $studentId,
                'parent',
                'registration',
                'Parent consent link ready',
                'The QR consent link is ready for ' . $fullName . '.',
                ['participant_id' => $participantId, 'school_name' => $studentSchool, 'qr_url' => $qrUrl]
            );
            if ($teacher) {
                new_school_add_notification(
                    $studentId,
                    'teacher',
                    'registration',
                    'New student assigned',
                    $fullName . ' has been assigned to ' . $teacher['teacher_full_name'] . ' at ' . $studentSchool . '.',
                    ['participant_id' => $participantId, 'school_name' => $studentSchool, 'teacher_name' => (string) $teacher['teacher_full_name']]
                );
            }
            new_school_add_notification(
                $studentId,
                'admin',
                'registration',
                'New student registered',
                $fullName . ' registered for the New School challenge.',
                ['participant_id' => $participantId, 'school_name' => $studentSchool]
            );

            record_registration_terms((int) $user['id'], $fullName, $email, 'student', field($body, 'terms_signature'), $body);

            json([
                'message' => 'Student registration submitted for admin approval.',
                'user' => login_user($user),
                'student' => $student,
                'qr_token' => $qrToken,
                'qr_url' => $qrUrl,
                'participant_id' => $participantId,
                'status_tracker' => new_school_status_tracker($student, new_school_student_interview_count($studentId)),
            ], $existingStudent ? 200 : 201);
        }

        case $key === 'POST new-school/parent/consent': {
            $token = field($body, 'token') ?: field($body, 'qr_token');
            $participantId = field($body, 'participant_id');
            $schoolId = (int) ($body['school_id'] ?? 0);
            $teacherId = (int) ($body['teacher_id'] ?? 0);
            $parentFullName = require_name_field(field($body, 'parent_full_name'), 'Parent full name', 3);
            $relationship = field($body, 'relationship_to_student');
            $phone = field($body, 'phone_number');
            $email = require_email(field($body, 'email'));
            $homeAddress = field($body, 'home_address');
            $zipCode = field($body, 'zip_code');
            $governmentIdUrl = field($body, 'government_id_url');
            $consentChecked = !empty($body['consent_checked']);
            $signature = field($body, 'digital_signature');
            $password = field($body, 'password');

            if ($token !== '') {
                $student = new_school_fetch_student_by_token($token);
            } elseif ($participantId !== '') {
                $student = new_school_fetch_student_by_participant_id($participantId);
            } else {
                json(['error' => 'Student unique platform ID or QR token is required.'], 422);
            }
            if (!$student) json(['error' => 'Student not found.'], 404);
            if ($relationship === '' || $phone === '' || $homeAddress === '' || $signature === '') {
                json(['error' => 'Parent consent form is incomplete.'], 422);
            }
            $phone = require_phone($phone, 'Phone number');
            $signature = require_name_field($signature, 'Digital signature', 3);
            if (!$consentChecked) {
                json(['error' => 'Consent must be confirmed.'], 422);
            }
            if ($password === '' || strlen($password) < 6) {
                json(['error' => 'Parent account password must be at least 6 characters.'], 422);
            }

            if ($schoolId > 0) {
                $school = new_school_fetch_school_by_id($schoolId);
                if (!$school) {
                    json(['error' => 'Selected school was not found.'], 404);
                }
                if ((int) ($student['school_id'] ?? 0) > 0 && (int) $student['school_id'] !== $schoolId) {
                    json(['error' => 'The selected school does not match this student.'], 422);
                }
                if ((int) ($student['school_id'] ?? 0) === 0 && strcasecmp((string) $student['school_name'], (string) $school['school_name']) !== 0) {
                    json(['error' => 'The selected school does not match this student.'], 422);
                }
            } else {
                $school = !empty($student['school_id'])
                    ? new_school_fetch_school_by_id((int) $student['school_id'])
                    : new_school_fetch_school_by_name((string) ($student['school_name'] ?? ''));
            }

            if ($teacherId > 0) {
                $teacher = new_school_fetch_teacher_by_id($teacherId);
                if (!$teacher) {
                    json(['error' => 'Selected teacher was not found.'], 404);
                }
                if ($school && (int) $teacher['school_id'] !== (int) $school['id']) {
                    json(['error' => 'The selected teacher does not belong to the chosen school.'], 422);
                }
                if ((int) ($student['teacher_id'] ?? 0) > 0 && (int) $student['teacher_id'] !== $teacherId) {
                    json(['error' => 'The selected teacher does not match this student.'], 422);
                }
            } else {
                $teacher = !empty($student['teacher_id']) ? new_school_fetch_teacher_by_id((int) $student['teacher_id']) : null;
            }

            $user = new_school_upsert_user_account($parentFullName, $email, $password, 'parent');
            $pdo = db();
            new_school_parents_ensure_link_columns();
            $studentId = (int) $student['id'];
            $existing = $pdo->prepare('SELECT * FROM new_school_parents WHERE student_id = ? LIMIT 1');
            $existing->execute([$studentId]);
            $existingParent = $existing->fetch();

            if ($existingParent) {
                $update = $pdo->prepare(
                    'UPDATE new_school_parents
                     SET user_id = ?,
                         parent_full_name = ?,
                         relationship_to_student = ?,
                         phone_number = ?,
                         email = ?,
                         home_address = ?,
                         zip_code = ?,
                         government_id_url = ?,
                         consent_checked = 1,
                         digital_signature = ?,
                         link_status = "pending_student",
                         student_confirmed_at = NULL,
                         approved_at = NULL,
                         consented_at = NOW(),
                         updated_at = NOW()
                     WHERE id = ?'
                );
                $update->execute([
                    (int) $user['id'],
                    $parentFullName,
                    $relationship,
                    $phone,
                    $email,
                    $homeAddress,
                    $zipCode,
                    $governmentIdUrl !== '' ? $governmentIdUrl : null,
                    $signature,
                    (int) $existingParent['id'],
                ]);
            } else {
                $insert = $pdo->prepare(
                    'INSERT INTO new_school_parents (
                        user_id, student_id, parent_full_name, relationship_to_student,
                        phone_number, email, home_address, zip_code, government_id_url, consent_checked,
                        digital_signature, link_status, consented_at
                     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, "pending_student", NOW())'
                );
                $insert->execute([
                    (int) $user['id'],
                    $studentId,
                    $parentFullName,
                    $relationship,
                    $phone,
                    $email,
                    $homeAddress,
                    $zipCode,
                    $governmentIdUrl !== '' ? $governmentIdUrl : null,
                    $signature,
                ]);
            }

            $studentUpdate = $pdo->prepare(
                'UPDATE new_school_students
                 SET parent_name = ?, parent_phone = ?, parent_email = ?, parent_consent_status = "pending"
                 WHERE id = ?'
            );
            $studentUpdate->execute([$parentFullName, $phone, $email, $studentId]);

            $student = new_school_refresh_student_status($studentId);
            if (!$student) {
                json(['error' => 'Unable to register parent.'], 500);
            }

            // New parent chain: student must confirm, then the teacher approves.
            new_school_add_notification(
                $studentId,
                'student',
                'parent_confirm',
                'Confirm your parent',
                $parentFullName . ' registered as your parent/guardian. Open your dashboard to confirm or reject this link.',
                ['participant_id' => (string) $student['participant_id'], 'parent_name' => $parentFullName]
            );
            new_school_add_notification(
                $studentId,
                'admin',
                'parent_consent',
                'Parent registered',
                $parentFullName . ' registered as parent for ' . $student['full_name'] . ' (awaiting student confirmation).',
                ['participant_id' => (string) $student['participant_id']]
            );

            record_registration_terms((int) $user['id'], $parentFullName, $email, 'parent', $signature, $body);

            json([
                'message' => 'Parent registration submitted. Your child must confirm the link, then their teacher approves it before your dashboard unlocks.',
                'user' => login_user($user),
                'parent' => new_school_fetch_parent_by_student_id($studentId),
                'student' => $student,
                'status_tracker' => new_school_status_tracker($student, new_school_student_interview_count($studentId)),
            ], 201);
        }

        case $key === 'POST new-school/parent/confirm': {
            $user = require_login();
            if ($user['role'] !== 'student') {
                json(['error' => 'Only the student can confirm their parent.'], 403);
            }
            $student = new_school_fetch_student_by_user_id((int) $user['id']);
            if (!$student) {
                json(['error' => 'Student profile not found.'], 404);
            }
            new_school_parents_ensure_link_columns();
            $pdo = db();
            $row = $pdo->prepare('SELECT * FROM new_school_parents WHERE student_id = ? LIMIT 1');
            $row->execute([(int) $student['id']]);
            $parent = $row->fetch();
            if (!$parent) {
                json(['error' => 'No parent registration is waiting for your confirmation.'], 404);
            }
            $decision = field($body, 'decision') ?: 'confirm';
            if ($decision === 'reject') {
                $pdo->prepare("UPDATE new_school_parents SET link_status = 'rejected', updated_at = NOW() WHERE id = ?")->execute([(int) $parent['id']]);
                json(['message' => 'Parent link rejected.', 'link_status' => 'rejected']);
            }
            $pdo->prepare("UPDATE new_school_parents SET link_status = 'pending_teacher', student_confirmed_at = NOW(), updated_at = NOW() WHERE id = ?")->execute([(int) $parent['id']]);
            new_school_add_notification(
                (int) $student['id'], 'teacher', 'parent_approval', 'Parent awaiting approval',
                $student['full_name'] . ' confirmed a parent/guardian — review it in the Parent Approvals tab.',
                ['participant_id' => (string) $student['participant_id']]
            );
            new_school_add_notification(
                (int) $student['id'], 'parent', 'parent_approval', 'Confirmed by student',
                'Your child confirmed the link. A teacher will review and approve your access.',
                ['participant_id' => (string) $student['participant_id']]
            );
            json(['message' => 'Parent confirmed and sent to your teacher for approval.', 'link_status' => 'pending_teacher']);
        }

        case $key === 'POST new-school/parent/approve': {
            $user = require_login();
            if (!in_array($user['role'], ['teacher', 'admin', 'super_admin', 'editor'], true)) {
                json(['error' => 'Parent approval requires a teacher account.'], 403);
            }
            $studentId = (int) ($body['student_id'] ?? 0);
            $student = $studentId > 0 ? new_school_fetch_student_by_id($studentId) : null;
            if (!$student) {
                json(['error' => 'Student not found.'], 404);
            }
            $teacher = $user['role'] === 'teacher' ? new_school_fetch_teacher_by_user_id((int) $user['id']) : null;
            if ($teacher) {
                // A teacher may only approve parents for their OWN students (or students
                // not yet assigned to any teacher in their school).
                $ownsStudent = (int) $student['teacher_id'] === (int) $teacher['id'];
                $unassignedInSchool = ((int) ($student['teacher_id'] ?? 0) === 0) && (int) $student['school_id'] === (int) $teacher['school_id'];
                if (!$ownsStudent && !$unassignedInSchool) {
                    json(['error' => 'This student is not assigned to your teacher account.'], 403);
                }
            }
            new_school_parents_ensure_link_columns();
            $pdo = db();
            $row = $pdo->prepare('SELECT * FROM new_school_parents WHERE student_id = ? LIMIT 1');
            $row->execute([(int) $student['id']]);
            $parent = $row->fetch();
            if (!$parent) {
                json(['error' => 'No parent to approve for this student.'], 404);
            }
            $status = field($body, 'approval_status') ?: 'approved';
            if (!in_array($status, ['approved', 'rejected'], true)) {
                json(['error' => 'Invalid approval status.'], 422);
            }
            if ($status === 'approved') {
                $pdo->prepare("UPDATE new_school_parents SET link_status = 'approved', approved_at = NOW(), updated_at = NOW() WHERE id = ?")->execute([(int) $parent['id']]);
                // Unlock the parent's login + record consent on the student.
                $pdo->prepare("UPDATE users SET approval_status = 'approved', approval_reviewed_by_user_id = ?, approval_reviewed_at = NOW(), updated_at = NOW() WHERE id = ?")->execute([(int) $user['id'], (int) $parent['user_id']]);
                $pdo->prepare("UPDATE new_school_students SET parent_consent_status = 'approved' WHERE id = ?")->execute([(int) $student['id']]);
                new_school_add_notification(
                    (int) $student['id'], 'parent', 'parent_approval', 'Parent access approved',
                    'A teacher approved your link. Your parent dashboard is now active.',
                    ['participant_id' => (string) $student['participant_id']]
                );
                new_school_add_notification(
                    (int) $student['id'], 'student', 'parent_approval', 'Parent approved',
                    'Your parent/guardian was approved by your teacher.',
                    ['participant_id' => (string) $student['participant_id']]
                );
            } else {
                $pdo->prepare("UPDATE new_school_parents SET link_status = 'rejected', updated_at = NOW() WHERE id = ?")->execute([(int) $parent['id']]);
                new_school_add_notification(
                    (int) $student['id'], 'parent', 'parent_approval', 'Parent link rejected',
                    'A teacher could not approve your link. Please contact the school.',
                    ['participant_id' => (string) $student['participant_id']]
                );
            }
            json(['message' => 'Parent ' . $status . '.', 'link_status' => $status === 'approved' ? 'approved' : 'rejected']);
        }

        /* ---------------- Scholarship intake questionnaire ---------------- */
        case $key === 'GET new-school/scholarship': {
            $user = require_login();
            if ($user['role'] !== 'student') {
                json(['error' => 'Only students answer the scholarship questions.'], 403);
            }
            $student = new_school_fetch_student_by_user_id((int) $user['id']);
            if (!$student) {
                json(['error' => 'Student profile not found.'], 404);
            }
            $record = new_school_scholarship_fetch((int) $student['id']);
            json([
                'completed' => $record !== null && !empty($record['completed']),
                'answers' => $record['answers'] ?? [],
                'word_limit' => NS_SCHOLARSHIP_WORD_LIMIT,
            ]);
        }

        case $key === 'POST new-school/scholarship': {
            $user = require_login();
            if ($user['role'] !== 'student') {
                json(['error' => 'Only students answer the scholarship questions.'], 403);
            }
            $student = new_school_fetch_student_by_user_id((int) $user['id']);
            if (!$student) {
                json(['error' => 'Student profile not found.'], 404);
            }
            $items = $body['answers'] ?? null;
            if (!is_array($items)) {
                json(['error' => 'Answers are required.'], 422);
            }
            try {
                $record = new_school_scholarship_save((int) $student['id'], $items);
            } catch (RuntimeException $e) {
                json(['error' => $e->getMessage()], 422);
            }
            json([
                'message' => 'Scholarship answers saved.',
                'completed' => true,
                'answers' => $record['answers'] ?? [],
            ], 201);
        }

        /* ---------------- Admin ⇄ user chat ---------------- */
        case $key === 'GET new-school/chat': {
            $user = require_login();
            new_school_chat_ensure_schema();
            json(['messages' => new_school_chat_fetch((int) $user['id'], 'user')]);
        }

        case $key === 'POST new-school/chat': {
            $user = require_login();
            $text = trim((string) field($body, 'body'));
            if ($text === '') {
                json(['error' => 'Message cannot be empty.'], 422);
            }
            $text = mb_substr($text, 0, 2000);
            new_school_chat_ensure_schema();
            db()->prepare('INSERT INTO new_school_chat_messages (thread_user_id, sender, sender_user_id, body) VALUES (?, "user", ?, ?)')
                ->execute([(int) $user['id'], (int) $user['id'], $text]);
            new_school_add_notification(null, 'admin', 'chat', 'New message', (($user['full_name'] ?? 'A user') . ' sent a message in chat.'), ['user_id' => (string) $user['id']]);
            json(['messages' => new_school_chat_fetch((int) $user['id'], 'user')], 201);
        }

        case $key === 'POST new-school/chat/clear': {
            $user = require_login();
            new_school_chat_ensure_schema();
            new_school_chat_clear((int) $user['id'], 'user');
            json(['messages' => []]);
        }

        case $key === 'GET admin/new-school/chats': {
            require_admin();
            new_school_chat_ensure_schema();
            $rows = db()->query(
                'SELECT m.thread_user_id, u.full_name, u.email, u.role,
                        SUM(CASE
                            WHEN ac.cleared_at IS NULL OR m.created_at > ac.cleared_at
                            THEN 1 ELSE 0
                        END) AS total,
                        MAX(CASE
                            WHEN ac.cleared_at IS NULL OR m.created_at > ac.cleared_at
                            THEN m.created_at ELSE NULL
                        END) AS last_at,
                        SUM(CASE
                            WHEN m.sender = "user"
                             AND (ac.cleared_at IS NULL OR m.created_at > ac.cleared_at)
                            THEN 1 ELSE 0
                        END) AS user_msgs,
                        SUM(CASE
                            WHEN m.sender = "user"
                             AND (ac.cleared_at IS NULL OR m.created_at > ac.cleared_at)
                            THEN 1 ELSE 0
                        END) AS unread_count
                 FROM new_school_chat_messages m
                 INNER JOIN users u ON u.id = m.thread_user_id
                 LEFT JOIN new_school_chat_clears ac
                   ON ac.thread_user_id = m.thread_user_id
                  AND ac.side = "admin"
                 GROUP BY m.thread_user_id, u.full_name, u.email, u.role
                 HAVING total > 0
                 ORDER BY last_at DESC'
            )->fetchAll();
            json(['threads' => $rows]);
        }

        case $key === 'GET admin/new-school/chat': {
            require_admin();
            new_school_chat_ensure_schema();
            $threadUserId = (int) ($_GET['user_id'] ?? 0);
            if ($threadUserId <= 0) {
                json(['error' => 'A user_id is required.'], 422);
            }
            $messages = new_school_chat_fetch($threadUserId, 'admin');
            new_school_chat_clear($threadUserId, 'admin');
            json(['messages' => $messages]);
        }

        case $key === 'POST admin/new-school/chat': {
            $admin = require_admin();
            new_school_chat_ensure_schema();
            $threadUserId = (int) ($body['user_id'] ?? 0);
            $text = trim((string) field($body, 'body'));
            if ($threadUserId <= 0 || $text === '') {
                json(['error' => 'A user_id and message body are required.'], 422);
            }
            $text = mb_substr($text, 0, 2000);
            db()->prepare('INSERT INTO new_school_chat_messages (thread_user_id, sender, sender_user_id, body) VALUES (?, "admin", ?, ?)')
                ->execute([$threadUserId, (int) $admin['id'], $text]);
            new_school_add_notification(null, 'all', 'chat', 'Admin replied', 'You have a new message from the admin team.', ['user_id' => (string) $threadUserId]);
            json(['messages' => new_school_chat_fetch($threadUserId, 'admin')], 201);
        }

        case $key === 'POST admin/new-school/chat/clear': {
            require_admin();
            new_school_chat_ensure_schema();
            $threadUserId = (int) ($body['user_id'] ?? 0);
            if ($threadUserId <= 0) {
                json(['error' => 'A user_id is required.'], 422);
            }
            new_school_chat_clear($threadUserId, 'admin');
            json(['messages' => []]);
        }

        case $key === 'POST new-school/school/register': {
            $schoolName = field($body, 'school_name');
            $schoolAddress = field($body, 'school_address');
            $zipCode = field($body, 'zip_code');
            $schoolDistrict = field($body, 'school_district');
            $mainPhone = field($body, 'main_phone');
            $principalName = require_name_field(field($body, 'principal_name'), 'Principal name', 3);
            $administratorName = require_name_field(field($body, 'administrator_name'), 'Administrator name', 3);
            $administratorEmail = require_email(field($body, 'administrator_email'));
            $administratorPhone = field($body, 'administrator_phone');
            $password = field($body, 'password');

            if ($schoolName === '' || $schoolAddress === '' || $schoolDistrict === '' || $mainPhone === '' || $principalName === '' || $administratorName === '' || $administratorPhone === '') {
                json(['error' => 'All school profile fields are required.'], 422);
            }
            $mainPhone = require_phone($mainPhone, 'Main phone number');
            $administratorPhone = require_phone($administratorPhone, 'Administrator phone');
            if ($password === '' || strlen($password) < 6) {
                json(['error' => 'Password must be at least 6 characters.'], 422);
            }

            $pdo = db();
            $existingSchool = new_school_fetch_school_by_name($schoolName);
            $user = new_school_upsert_user_account($administratorName, $administratorEmail, $password, 'school');

            if ($existingSchool && (int) $existingSchool['user_id'] !== (int) $user['id']) {
                json(['error' => 'A school with that name is already registered.'], 409);
            }

            if ($existingSchool) {
                $update = $pdo->prepare(
                    'UPDATE new_school_schools
                     SET user_id = ?,
                         school_address = ?,
                         zip_code = ?,
                         school_district = ?,
                         main_phone = ?,
                         principal_name = ?,
                         administrator_name = ?,
                         administrator_email = ?,
                         administrator_phone = ?,
                         status = "registered",
                         updated_at = NOW()
                     WHERE id = ?'
                );
                $update->execute([
                    (int) $user['id'],
                    $schoolAddress,
                    $zipCode,
                    $schoolDistrict,
                    $mainPhone,
                    $principalName,
                    $administratorName,
                    $administratorEmail,
                    $administratorPhone,
                    (int) $existingSchool['id'],
                ]);
                $schoolId = (int) $existingSchool['id'];
            } else {
                $insert = $pdo->prepare(
                    'INSERT INTO new_school_schools (
                        user_id, school_name, school_address, zip_code, school_district, main_phone,
                        principal_name, administrator_name, administrator_email, administrator_phone, status
                     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "registered")'
                );
                $insert->execute([
                    (int) $user['id'],
                    $schoolName,
                    $schoolAddress,
                    $zipCode,
                    $schoolDistrict,
                    $mainPhone,
                    $principalName,
                    $administratorName,
                    $administratorEmail,
                    $administratorPhone,
                ]);
                $schoolId = (int) $pdo->lastInsertId();
            }

            new_school_add_notification(
                null,
                'admin',
                'school_registration',
                'School registered',
                $schoolName . ' completed the school registration flow.',
                ['school_name' => $schoolName, 'administrator_email' => $administratorEmail]
            );

            record_registration_terms((int) $user['id'], $administratorName, $administratorEmail, 'school', field($body, 'terms_signature'), $body);

            json([
                'message' => 'School registration submitted for admin approval.',
                'user' => login_user($user),
                'school' => new_school_fetch_school_by_id($schoolId),
            ], $existingSchool ? 200 : 201);
        }

        case $key === 'POST new-school/teacher/register': {
            $teacherFullName = require_name_field(field($body, 'teacher_full_name'), 'Teacher full name', 3);
            $schoolId = (int) ($body['school_id'] ?? 0);
            $schoolName = field($body, 'school_name');
            $schoolEmail = require_email(field($body, 'school_email'));
            $phoneNumber = field($body, 'phone_number');
            $roleDepartment = field($body, 'role_department');
            $gradeLevel = field($body, 'grade_level_supported');
            $password = field($body, 'password');

            if ($teacherFullName === '' || $schoolEmail === '' || $phoneNumber === '' || $roleDepartment === '' || $gradeLevel === '') {
                json(['error' => 'Teacher profile fields are required.'], 422);
            }
            $phoneNumber = require_phone($phoneNumber, 'Phone number');
            if ($password === '' || strlen($password) < 6) {
                json(['error' => 'Password must be at least 6 characters.'], 422);
            }

            $registerMode = field($body, 'register_mode');
            if ($registerMode === 'trendcatch_edu') {
                // TrendCatch EDU intake: the teacher's school isn't listed yet. Create/find an
                // unclaimed EDU-managed school and let them register pending admin review.
                $school = new_school_find_or_create_edu_school($schoolName, field($body, 'edu_school_email'), field($body, 'school_website'));
                if (!$school) {
                    json(['error' => 'Enter your school name to register under TrendCatch EDU.'], 422);
                }
                new_school_add_notification(
                    null, 'admin', 'trendcatch_edu_intake', 'New TrendCatch EDU registration',
                    $teacherFullName . ' registered under TrendCatch EDU for "' . $school['school_name'] . '".',
                    ['school_id' => (int) $school['id'], 'school_name' => $school['school_name'], 'role' => 'teacher']
                );
            } else {
                $school = $schoolId > 0 ? new_school_fetch_school_by_id($schoolId) : ($schoolName !== '' ? new_school_fetch_school_by_name($schoolName) : null);
                if (!$school) {
                    json(['error' => 'Choose a school from the approved school list.'], 422);
                }
                if ((string) ($school['status'] ?? '') !== 'approved') {
                    json(['error' => 'Teacher accounts can only be created for approved schools.'], 422);
                }
            }

            $user = new_school_upsert_user_account($teacherFullName, $schoolEmail, $password, 'teacher');
            $pdo = db();
            $existingTeacher = $pdo->prepare('SELECT * FROM new_school_teachers WHERE user_id = ? LIMIT 1');
            $existingTeacher->execute([(int) $user['id']]);
            $teacher = $existingTeacher->fetch();

            if ($teacher) {
                $update = $pdo->prepare(
                    'UPDATE new_school_teachers
                     SET school_id = ?,
                         teacher_full_name = ?,
                         school_email = ?,
                         phone_number = ?,
                         role_department = ?,
                         grade_level_supported = ?,
                         status = "registered",
                         updated_at = NOW()
                     WHERE id = ?'
                );
                $update->execute([
                    (int) $school['id'],
                    $teacherFullName,
                    $schoolEmail,
                    $phoneNumber,
                    $roleDepartment,
                    $gradeLevel,
                    (int) $teacher['id'],
                ]);
                $teacherId = (int) $teacher['id'];
            } else {
                $insert = $pdo->prepare(
                    'INSERT INTO new_school_teachers (
                        user_id, school_id, teacher_full_name, school_email, phone_number, role_department, grade_level_supported, status
                     ) VALUES (?, ?, ?, ?, ?, ?, ?, "registered")'
                );
                $insert->execute([
                    (int) $user['id'],
                    (int) $school['id'],
                    $teacherFullName,
                    $schoolEmail,
                    $phoneNumber,
                    $roleDepartment,
                    $gradeLevel,
                ]);
                $teacherId = (int) $pdo->lastInsertId();
            }

            new_school_add_notification(
                null,
                'admin',
                'teacher_registration',
                'Teacher registered',
                $teacherFullName . ' joined ' . $school['school_name'] . '.',
                ['teacher_name' => $teacherFullName, 'school_name' => (string) $school['school_name']]
            );
            new_school_add_notification(
                null,
                'school',
                'teacher_registration',
                'Teacher registered',
                $teacherFullName . ' joined ' . $school['school_name'] . ' and is awaiting principal verification.',
                ['teacher_name' => $teacherFullName, 'school_name' => (string) $school['school_name']]
            );

            record_registration_terms((int) $user['id'], $teacherFullName, $schoolEmail, 'teacher', field($body, 'terms_signature'), $body);

            json([
                'message' => 'Teacher registration submitted for admin approval.',
                'user' => login_user($user),
                'teacher' => new_school_fetch_teacher_by_user_id((int) $user['id']),
                'school' => $school,
            ], $teacher ? 200 : 201);
        }

        case $key === 'POST new-school/school/teacher/approve': {
            $user = require_login();
            if (!in_array($user['role'], ['school', 'admin', 'super_admin', 'editor'], true)) {
                json(['error' => 'Teacher verification requires a school account.'], 403);
            }

            $teacherId = (int) ($body['teacher_id'] ?? 0);
            if ($teacherId <= 0) {
                json(['error' => 'Teacher selection is required.'], 422);
            }

            $teacher = new_school_fetch_teacher_by_id($teacherId);
            if (!$teacher) {
                json(['error' => 'Teacher not found.'], 404);
            }

            $school = $user['role'] === 'school' ? new_school_fetch_school_by_user_id((int) $user['id']) : null;
            if ($school && (int) $teacher['school_id'] !== (int) $school['id']) {
                json(['error' => 'This teacher does not belong to your school.'], 403);
            }

            $teacherName = field($body, 'teacher_name');
            $teacherEmail = require_email(field($body, 'teacher_email'));
            $approvalStatus = field($body, 'approval_status') ?: 'approved';
            $notes = field($body, 'notes');
            $signature = field($body, 'digital_signature');

            if ($teacherName === '' || $teacherEmail === '' || $signature === '') {
                json(['error' => 'Teacher verification form is incomplete.'], 422);
            }
            if (!in_array($approvalStatus, ['approved', 'pending', 'rejected'], true)) {
                json(['error' => 'Invalid approval status.'], 422);
            }

            $pdo = db();
            $approvalReviewedAt = in_array($approvalStatus, ['approved', 'rejected'], true) ? date('Y-m-d H:i:s') : null;
            $teacherUpdate = $pdo->prepare(
                'UPDATE new_school_teachers
                 SET status = ?,
                     updated_at = NOW()
                 WHERE id = ?'
            );
            $teacherUpdate->execute([$approvalStatus, $teacherId]);

            $userUpdate = $pdo->prepare(
                'UPDATE users
                 SET approval_status = ?,
                     approval_note = ?,
                     approval_reviewed_by_user_id = ?,
                     approval_reviewed_at = ?
                 WHERE id = ?'
            );
            $userUpdate->execute([
                $approvalStatus,
                $notes ?: null,
                (int) $user['id'],
                $approvalReviewedAt,
                (int) $teacher['user_id'],
            ]);

            $freshTeacher = new_school_fetch_teacher_by_id($teacherId);
            new_school_add_notification(
                null,
                'teacher',
                'teacher_registration_review',
                'Teacher account ' . $approvalStatus,
                $teacherName . ' has been ' . $approvalStatus . ' by school verification.',
                ['teacher_id' => $teacherId, 'approval_status' => $approvalStatus]
            );
            new_school_add_notification(
                null,
                'admin',
                'teacher_registration_review',
                'Teacher account ' . $approvalStatus,
                $teacherName . ' has been ' . $approvalStatus . ' by school verification.',
                ['teacher_id' => $teacherId, 'approval_status' => $approvalStatus]
            );

            json([
                'message' => 'Teacher verification saved.',
                'teacher' => $freshTeacher,
                'approval_status' => $approvalStatus,
            ]);
        }

        case $key === 'POST new-school/submission/review': {
            $user = require_login();
            // Data isolation: only admin reviews/scores submission CONTENT. Teacher/school are
            // restricted to counts + participation approval and never see project content.
            if (!in_array($user['role'], ['admin', 'super_admin', 'editor'], true)) {
                json(['error' => 'Submission review and scoring is restricted to admin accounts.'], 403);
            }

            $submissionId = (int) ($body['submission_id'] ?? 0);
            if ($submissionId <= 0) {
                json(['error' => 'Submission selection is required.'], 422);
            }

            $status = field($body, 'status') ?: 'approved';
            if (!in_array($status, ['approved', 'rejected'], true)) {
                json(['error' => 'Invalid review status.'], 422);
            }

            $pdo = db();
            $submissionStmt = $pdo->prepare('SELECT * FROM new_school_submissions WHERE id = ? LIMIT 1');
            $submissionStmt->execute([$submissionId]);
            $submission = $submissionStmt->fetch();
            if (!$submission) {
                json(['error' => 'Submission not found.'], 404);
            }

            $student = new_school_fetch_student_by_id((int) $submission['student_id']);
            if (!$student) {
                json(['error' => 'Student not found.'], 404);
            }

            $notes = field($body, 'reviewer_notes');
            $score = $body['score'] ?? null;
            $rankPosition = (int) ($body['rank_position'] ?? 0);
            $scoreValue = $score !== null && $score !== ''
                ? (float) $score
                : ($submission['score'] !== null && $submission['score'] !== '' ? (float) $submission['score'] : null);
            $rankValue = $rankPosition > 0
                ? $rankPosition
                : (($submission['rank_position'] ?? null) !== null && $submission['rank_position'] !== '' ? (int) $submission['rank_position'] : null);

            $pdo->beginTransaction();
            try {
                $reviewedAt = date('Y-m-d H:i:s');
                $update = $pdo->prepare(
                    'UPDATE new_school_submissions
                     SET status = ?,
                         reviewer_notes = ?,
                         score = ?,
                         rank_position = ?,
                         reviewed_by_user_id = ?,
                         reviewed_at = ?,
                         updated_at = NOW()
                     WHERE id = ?'
                );
                $update->execute([
                    $status,
                    $notes ?: null,
                    $scoreValue,
                    $rankValue,
                    (int) $user['id'],
                    $reviewedAt,
                    $submissionId,
                ]);

                if ($status === 'approved') {
                    new_school_refresh_student_status((int) $student['id']);
                } elseif ($status === 'rejected') {
                    $pdo->prepare('DELETE FROM new_school_winners WHERE submission_id = ?')->execute([$submissionId]);
                    new_school_refresh_student_status((int) $student['id']);
                }

                $pdo->commit();
                $studentRecord = new_school_fetch_student_by_id((int) $submission['student_id']);
                if ($studentRecord) {
                    new_school_add_notification(
                        (int) $studentRecord['id'],
                        'student',
                        'submission_review',
                        'Submission ' . $status,
                        'Your problem and solution submission has been ' . $status . '.',
                        ['participant_id' => (string) $studentRecord['participant_id'], 'status' => $status]
                    );
                    new_school_add_notification(
                        (int) $studentRecord['id'],
                        'parent',
                        'submission_review',
                        'Submission ' . $status,
                        $studentRecord['full_name'] . "'s problem and solution submission has been " . $status . '.',
                        ['participant_id' => (string) $studentRecord['participant_id'], 'status' => $status]
                    );
                    new_school_add_notification(
                        (int) $studentRecord['id'],
                        'teacher',
                        'submission_review',
                        'Submission ' . $status,
                        $studentRecord['full_name'] . "'s problem and solution submission has been " . $status . '.',
                        ['participant_id' => (string) $studentRecord['participant_id'], 'status' => $status]
                    );
                    new_school_add_notification(
                        (int) $studentRecord['id'],
                        'school',
                        'submission_review',
                        'Submission ' . $status,
                        $studentRecord['full_name'] . "'s problem and solution submission has been " . $status . '.',
                        ['participant_id' => (string) $studentRecord['participant_id'], 'status' => $status]
                    );
                    new_school_add_notification(
                        (int) $studentRecord['id'],
                        'admin',
                        'submission_review',
                        'Submission ' . $status,
                        $studentRecord['full_name'] . "'s problem and solution submission has been " . $status . '.',
                        ['participant_id' => (string) $studentRecord['participant_id'], 'status' => $status]
                    );
                }

                json([
                    'message' => 'Submission review saved.',
                    'submission' => new_school_fetch_submission_by_student_id((int) $submission['student_id']),
                ]);
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                json(['error' => app_debug() ? $e->getMessage() : 'Unable to update submission review.'], 500);
            }
        }

        case $key === 'POST new-school/school/approve': {
            $user = require_login();
            if (!in_array($user['role'], ['school', 'admin', 'super_admin', 'editor'], true)) {
                json(['error' => 'School approval requires a school account.'], 403);
            }

            $studentId = (int) ($body['student_id'] ?? 0);
            if ($studentId <= 0 && field($body, 'participant_id') !== '') {
                $student = new_school_fetch_student_by_participant_id(field($body, 'participant_id'));
                $studentId = $student ? (int) $student['id'] : 0;
            } else {
                $student = $studentId > 0 ? new_school_fetch_student_by_id($studentId) : null;
            }
            if (!$student) {
                json(['error' => 'Student not found.'], 404);
            }

            $schoolStaffName = field($body, 'school_staff_name');
            $role = field($body, 'role');
            $schoolEmail = require_email(field($body, 'school_email'));
            $approvalStatus = field($body, 'approval_status') ?: 'approved';
            $notes = field($body, 'notes');
            $signature = field($body, 'digital_signature');

            if ($schoolStaffName === '' || $role === '' || $schoolEmail === '' || $signature === '') {
                json(['error' => 'School approval form is incomplete.'], 422);
            }
            if (!in_array($approvalStatus, ['approved', 'rejected', 'pending'], true)) {
                json(['error' => 'Invalid approval status.'], 422);
            }
            if (($student['parent_consent_status'] ?? '') !== 'approved') {
                json(['error' => 'Parent consent must be approved before school approval.'], 422);
            }

            $school = $user['role'] === 'school' ? new_school_fetch_school_by_user_id((int) $user['id']) : null;
            if ($school && (int) $student['school_id'] > 0 && (int) $student['school_id'] !== (int) $school['id']) {
                json(['error' => 'This student does not belong to your school.'], 403);
            }
            if ($school && (int) $student['school_id'] === 0 && strcasecmp((string) $student['school_name'], (string) $school['school_name']) === 0) {
                $link = db()->prepare('UPDATE new_school_students SET school_id = ? WHERE id = ?');
                $link->execute([(int) $school['id'], (int) $student['id']]);
                $student['school_id'] = (int) $school['id'];
            }
            // Belongs-to-school is decided by id (set above when names matched); don't reject a
            // correctly id-linked student just because the denormalised school_name differs.
            if ($school && (int) $student['school_id'] !== (int) $school['id']) {
                json(['error' => 'This student is not part of your school.'], 403);
            }

            $pdo = db();
            $recordedAt = date('Y-m-d H:i:s');
            $approvedAt = $approvalStatus === 'approved' ? $recordedAt : null;
            $approvalStmt = $pdo->prepare(
                'INSERT INTO new_school_approvals (
                    student_id, approval_type, reviewer_user_id, reviewer_name, reviewer_email, reviewer_role,
                    status, notes, digital_signature, approved_at, recorded_at
                 ) VALUES (?, "school", ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    reviewer_user_id = VALUES(reviewer_user_id),
                    reviewer_name = VALUES(reviewer_name),
                    reviewer_email = VALUES(reviewer_email),
                    reviewer_role = VALUES(reviewer_role),
                    status = VALUES(status),
                    notes = VALUES(notes),
                    digital_signature = VALUES(digital_signature),
                    approved_at = VALUES(approved_at),
                    recorded_at = VALUES(recorded_at),
                    updated_at = NOW()'
            );
            $approvalStmt->execute([
                (int) $student['id'],
                (int) $user['id'],
                $schoolStaffName,
                $schoolEmail,
                $role,
                $approvalStatus,
                $notes ?: null,
                $signature,
                $approvedAt,
                $recordedAt,
            ]);

            $studentUpdate = $pdo->prepare(
                'UPDATE new_school_students
                 SET school_approval_status = ?
                 WHERE id = ?'
            );
            $studentUpdate->execute([$approvalStatus, (int) $student['id']]);

            $student = new_school_refresh_student_status((int) $student['id']);
            new_school_add_notification(
                (int) $student['id'],
                'student',
                'school_approval',
                'School approval ' . $approvalStatus,
                'Your school has ' . $approvalStatus . ' your participation.',
                ['participant_id' => (string) $student['participant_id'], 'approval_status' => $approvalStatus]
            );
            new_school_add_notification(
                (int) $student['id'],
                'teacher',
                'school_approval',
                'School approval ' . $approvalStatus,
                $student['full_name'] . ' has been ' . $approvalStatus . ' by school staff.',
                ['participant_id' => (string) $student['participant_id'], 'approval_status' => $approvalStatus]
            );
            new_school_add_notification(
                (int) $student['id'],
                'admin',
                'school_approval',
                'School approval ' . $approvalStatus,
                $student['full_name'] . ' has been ' . $approvalStatus . ' by school staff.',
                ['participant_id' => (string) $student['participant_id'], 'approval_status' => $approvalStatus]
            );
            json([
                'message' => 'School approval saved.',
                'student' => $student,
                'approval' => new_school_fetch_student_approvals((int) $student['id'])['school'],
            ]);
        }

        case $key === 'POST new-school/teacher/approve': {
            $user = require_login();
            if (!in_array($user['role'], ['teacher', 'admin', 'super_admin', 'editor'], true)) {
                json(['error' => 'Teacher approval requires a teacher account.'], 403);
            }

            $studentId = (int) ($body['student_id'] ?? 0);
            if ($studentId <= 0 && field($body, 'participant_id') !== '') {
                $student = new_school_fetch_student_by_participant_id(field($body, 'participant_id'));
                $studentId = $student ? (int) $student['id'] : 0;
            } else {
                $student = $studentId > 0 ? new_school_fetch_student_by_id($studentId) : null;
            }
            if (!$student) {
                json(['error' => 'Student not found.'], 404);
            }

            $teacherName = field($body, 'teacher_name');
            $teacherEmail = require_email(field($body, 'teacher_email'));
            $approvalStatus = field($body, 'approval_status') ?: 'approved';
            $notes = field($body, 'notes');
            $signature = field($body, 'digital_signature');

            if ($teacherName === '' || $teacherEmail === '' || $signature === '') {
                json(['error' => 'Teacher approval form is incomplete.'], 422);
            }
            if (!in_array($approvalStatus, ['approved', 'rejected', 'pending'], true)) {
                json(['error' => 'Invalid approval status.'], 422);
            }
            // Teacher approval is the only gate — no parent/school prerequisites.

            $teacher = $user['role'] === 'teacher' ? new_school_fetch_teacher_by_user_id((int) $user['id']) : null;
            if ($teacher && (int) $student['teacher_id'] > 0 && (int) $student['teacher_id'] !== (int) $teacher['id']) {
                json(['error' => 'This student is assigned to a different teacher.'], 403);
            }
            if ($teacher && (int) $student['teacher_id'] === 0 && (int) $student['school_id'] === (int) $teacher['school_id']) {
                $link = db()->prepare('UPDATE new_school_students SET teacher_id = ? WHERE id = ?');
                $link->execute([(int) $teacher['id'], (int) $student['id']]);
                $student['teacher_id'] = (int) $teacher['id'];
            }
            if ($teacher && (int) $student['school_id'] !== (int) $teacher['school_id']) {
                json(['error' => 'This student does not belong to your school.'], 403);
            }

            $pdo = db();
            $recordedAt = date('Y-m-d H:i:s');
            $approvedAt = $approvalStatus === 'approved' ? $recordedAt : null;
            $approvalStmt = $pdo->prepare(
                'INSERT INTO new_school_approvals (
                    student_id, approval_type, reviewer_user_id, reviewer_name, reviewer_email, reviewer_role,
                    status, notes, digital_signature, approved_at, recorded_at
                 ) VALUES (?, "teacher", ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    reviewer_user_id = VALUES(reviewer_user_id),
                    reviewer_name = VALUES(reviewer_name),
                    reviewer_email = VALUES(reviewer_email),
                    reviewer_role = VALUES(reviewer_role),
                    status = VALUES(status),
                    notes = VALUES(notes),
                    digital_signature = VALUES(digital_signature),
                    approved_at = VALUES(approved_at),
                    recorded_at = VALUES(recorded_at),
                    updated_at = NOW()'
            );
            $approvalStmt->execute([
                (int) $student['id'],
                (int) $user['id'],
                $teacherName,
                $teacherEmail,
                field($body, 'role') ?: ($teacher['role_department'] ?? null),
                $approvalStatus,
                $notes ?: null,
                $signature,
                $approvedAt,
                $recordedAt,
            ]);

            $studentUpdate = $pdo->prepare(
                'UPDATE new_school_students
                 SET teacher_approval_status = ?
                 WHERE id = ?'
            );
            $studentUpdate->execute([$approvalStatus, (int) $student['id']]);

            // Teacher approval is the student's only gate — activate (or reject) their account login too.
            $userStatus = $approvalStatus === 'approved' ? 'approved' : ($approvalStatus === 'rejected' ? 'rejected' : 'pending');
            $pdo->prepare(
                'UPDATE users SET approval_status = ?, approval_reviewed_by_user_id = ?, approval_reviewed_at = NOW(), updated_at = NOW() WHERE id = ?'
            )->execute([$userStatus, (int) $user['id'], (int) $student['user_id']]);

            $student = new_school_refresh_student_status((int) $student['id']);
            new_school_add_notification(
                (int) $student['id'],
                'student',
                'teacher_approval',
                'Teacher approval ' . $approvalStatus,
                'Your teacher has ' . $approvalStatus . ' your participation.',
                ['participant_id' => (string) $student['participant_id'], 'approval_status' => $approvalStatus]
            );
            new_school_add_notification(
                (int) $student['id'],
                'school',
                'teacher_approval',
                'Teacher approval ' . $approvalStatus,
                $student['full_name'] . ' has been ' . $approvalStatus . ' by teacher review.',
                ['participant_id' => (string) $student['participant_id'], 'approval_status' => $approvalStatus]
            );
            new_school_add_notification(
                (int) $student['id'],
                'admin',
                'teacher_approval',
                'Teacher approval ' . $approvalStatus,
                $student['full_name'] . ' has been ' . $approvalStatus . ' by teacher review.',
                ['participant_id' => (string) $student['participant_id'], 'approval_status' => $approvalStatus]
            );
            json([
                'message' => 'Teacher approval saved.',
                'student' => $student,
                'approval' => new_school_fetch_student_approvals((int) $student['id'])['teacher'],
            ]);
        }

        case $key === 'GET new-school/businesses': {
            $user = require_login();

            if ($user['role'] === 'student') {
                $student = new_school_fetch_student_by_user_id((int) $user['id']);
                if (!$student) {
                    json(['error' => 'Student profile not found.'], 404);
                }
                json(array_merge([
                    'role' => 'student',
                    'user' => $user,
                ], new_school_build_student_context($student)));
            }

            if ($user['role'] === 'parent') {
                $parent = new_school_fetch_parent_by_user_id((int) $user['id']);
                if (!$parent) {
                    json(['error' => 'Parent profile not found.'], 404);
                }
                $student = new_school_fetch_student_by_id((int) $parent['student_id']);
                if (!$student) {
                    json(['error' => 'Student profile not found.'], 404);
                }
                json(array_merge([
                    'role' => 'parent',
                    'user' => $user,
                ], new_school_build_student_context($student)));
            }

            if ($user['role'] === 'teacher') {
                $teacher = new_school_fetch_teacher_by_user_id((int) $user['id']);
                if (!$teacher) {
                    json(['error' => 'Teacher profile not found.'], 404);
                }
                $studentId = (int) ($_GET['student_id'] ?? 0);
                if ($studentId > 0) {
                    $student = new_school_fetch_student_by_id($studentId);
                    if (!$student) {
                        json(['error' => 'Student not found.'], 404);
                    }
                    // Teacher may view their OWN students, plus students not yet
                    // assigned to any teacher in their school (so they can claim/approve).
                    $ownsStudent = (int) $student['teacher_id'] === (int) $teacher['id'];
                    $unassignedInSchool = ((int) ($student['teacher_id'] ?? 0) === 0) && (int) $student['school_id'] === (int) $teacher['school_id'];
                    if (!$ownsStudent && !$unassignedInSchool) {
                        json(['error' => 'This student is not assigned to your teacher account.'], 403);
                    }
                    json(new_school_redact_student_context(array_merge([
                        'role' => 'teacher',
                        'user' => $user,
                        'teacher' => $teacher,
                    ], new_school_build_student_context($student)), ['kind' => 'teacher']));
                }
                json(new_school_redact_dashboard([
                    'role' => 'teacher',
                    'user' => $user,
                    'teacher' => $teacher,
                    'students' => new_school_fetch_students_for_teacher($teacher),
                    'summary' => new_school_student_status_summary(new_school_fetch_students_for_teacher($teacher)),
                ], ['kind' => 'teacher']));
            }

            if ($user['role'] === 'school') {
                $school = new_school_fetch_school_by_user_id((int) $user['id']);
                if (!$school) {
                    json(['error' => 'School profile not found.'], 404);
                }
                $studentId = (int) ($_GET['student_id'] ?? 0);
                if ($studentId > 0) {
                    $student = new_school_fetch_student_by_id($studentId);
                    if (!$student) {
                        json(['error' => 'Student not found.'], 404);
                    }
                    if ((int) $student['school_id'] !== (int) $school['id'] && strcasecmp((string) $student['school_name'], (string) $school['school_name']) !== 0) {
                        json(['error' => 'This student is not assigned to your school account.'], 403);
                    }
                    json(new_school_redact_student_context(array_merge([
                        'role' => 'school',
                        'user' => $user,
                        'school' => $school,
                    ], new_school_build_student_context($student)), ['kind' => 'school']));
                }
                $students = new_school_fetch_students_for_school($school);
                json([
                    'role' => 'school',
                    'user' => $user,
                    'school' => $school,
                    'students' => $students,
                    'summary' => new_school_student_status_summary($students),
                ]);
            }

            if (in_array($user['role'], ['admin', 'super_admin', 'editor'], true)) {
                json([
                    'role' => 'admin',
                    'user' => $user,
                    'students' => db()->query(
                        'SELECT s.*, u.full_name AS user_full_name, u.email AS user_email,
                                (SELECT COUNT(*) FROM new_school_business_interviews bi WHERE bi.student_id = s.id) AS interview_count,
                                (SELECT COUNT(*) FROM new_school_submissions sub WHERE sub.student_id = s.id) AS has_submission
                         FROM new_school_students s
                         INNER JOIN users u ON u.id = s.user_id
                         ORDER BY s.created_at DESC'
                    )->fetchAll(),
                ]);
            }

            json(['error' => 'Unsupported account role for business tracking.'], 403);
        }

        case $key === 'POST new-school/business': {
            $user = require_login();
            // Data isolation: interview content is entered by the student (or parent on their
            // behalf) and managed by admin. Teacher/school are read-only for interview content.
            if (in_array($user['role'], ['teacher', 'school'], true)) {
                json(['error' => 'Interviews are entered by students; your role is read-only for interview content.'], 403);
            }
            $student = null;
            $studentId = (int) ($body['student_id'] ?? 0);

            if ($user['role'] === 'student') {
                $student = new_school_fetch_student_by_user_id((int) $user['id']);
            } elseif ($user['role'] === 'parent') {
                $parent = new_school_fetch_parent_by_user_id((int) $user['id']);
                $student = $parent ? new_school_fetch_student_by_id((int) $parent['student_id']) : null;
            } elseif ($studentId > 0) {
                $student = new_school_fetch_student_by_id($studentId);
            }

            if (!$student) {
                json(['error' => 'Student profile not found.'], 404);
            }

            // Gate: the student must finish the scholarship questionnaire before any
            // interview/project work in "My Work" (admin acting on their behalf is exempt).
            if (in_array($user['role'], ['student', 'parent'], true) && !new_school_scholarship_completed((int) $student['id'])) {
                json(['error' => 'Please answer your scholarship questions in My Work before adding a business interview.'], 403);
            }

            $businessName = field($body, 'business_name');
            $ownerName = field($body, 'owner_name');
            $businessPhone = field($body, 'business_phone');
            $businessAddress = field($body, 'business_address');
            $businessCategory = field($body, 'business_category');
            $dateOfVisit = field($body, 'date_of_visit');
            $mainChallenge = field($body, 'main_challenge');
            $studentNotes = field($body, 'student_notes');
            $visitNumber = (int) ($body['visit_number'] ?? 0);

            if ($businessName === '' || $ownerName === '' || $businessPhone === '' || $businessAddress === '' || $businessCategory === '' || $dateOfVisit === '' || $mainChallenge === '' || $studentNotes === '') {
                json(['error' => 'Business interview fields are incomplete.'], 422);
            }
            new_school_assert_min_chars($businessName, 'Business name', 3);
            new_school_assert_min_chars($ownerName, 'Owner / Manager', 3);
            new_school_assert_min_chars($businessAddress, 'Business address', 3);
            new_school_assert_min_chars($businessCategory, 'Category', 3);
            new_school_assert_words($mainChallenge, 'Main challenge', 50, 500);
            new_school_assert_words($studentNotes, 'Student notes', 50, 500);
            if (!date_create($dateOfVisit)) {
                json(['error' => 'Date of visit is invalid.'], 422);
            }
            if ($dateOfVisit > date('Y-m-d')) {
                json(['error' => 'Date of visit can’t be in the future.'], 422);
            }
            $regDate = substr((string) ($student['created_at'] ?? ''), 0, 10);
            if ($regDate !== '' && $dateOfVisit < $regDate) {
                json(['error' => 'Date of visit can’t be before the student registered.'], 422);
            }

            $interviewCount = new_school_student_interview_count((int) $student['id']);
            if ($visitNumber <= 0) {
                $visitNumber = $interviewCount + 1;
            }
            if ($visitNumber < 1 || $visitNumber > 10) {
                json(['error' => 'Visit number must be between 1 and 10.'], 422);
            }
            $existingInterview = db()->prepare('SELECT * FROM new_school_business_interviews WHERE student_id = ? AND visit_number = ? LIMIT 1');
            $existingInterview->execute([(int) $student['id'], $visitNumber]);
            $interviewRow = $existingInterview->fetch();
            if (!$interviewRow && $interviewCount >= 10) {
                json(['error' => 'The student already has 10 completed interviews.'], 422);
            }

            $values = [
                (int) $student['id'],
                $visitNumber,
                $businessName,
                $ownerName,
                $businessPhone,
                $businessAddress,
                $businessCategory,
                $dateOfVisit,
                !empty($body['has_website']) ? 1 : 0,
                !empty($body['has_google_profile']) ? 1 : 0,
                !empty($body['uses_social_media']) ? 1 : 0,
                !empty($body['uses_digital_signage']) ? 1 : 0,
                !empty($body['offers_rewards']) ? 1 : 0,
                !empty($body['has_online_ordering']) ? 1 : 0,
                !empty($body['has_delivery_options']) ? 1 : 0,
                $mainChallenge,
                $studentNotes,
            ];

            $pdo = db();
            if ($interviewRow) {
                $update = $pdo->prepare(
                    'UPDATE new_school_business_interviews
                     SET business_name = ?, owner_name = ?, business_phone = ?, business_address = ?, business_category = ?,
                         date_of_visit = ?, has_website = ?, has_google_profile = ?, uses_social_media = ?, uses_digital_signage = ?,
                         offers_rewards = ?, has_online_ordering = ?, has_delivery_options = ?, main_challenge = ?, student_notes = ?,
                         updated_at = NOW()
                     WHERE id = ?'
                );
                $update->execute([
                    $businessName,
                    $ownerName,
                    $businessPhone,
                    $businessAddress,
                    $businessCategory,
                    $dateOfVisit,
                    !empty($body['has_website']) ? 1 : 0,
                    !empty($body['has_google_profile']) ? 1 : 0,
                    !empty($body['uses_social_media']) ? 1 : 0,
                    !empty($body['uses_digital_signage']) ? 1 : 0,
                    !empty($body['offers_rewards']) ? 1 : 0,
                    !empty($body['has_online_ordering']) ? 1 : 0,
                    !empty($body['has_delivery_options']) ? 1 : 0,
                    $mainChallenge,
                    $studentNotes,
                    (int) $interviewRow['id'],
                ]);
                $interviewId = (int) $interviewRow['id'];
            } else {
                $insert = $pdo->prepare(
                    'INSERT INTO new_school_business_interviews (
                        student_id, visit_number, business_name, owner_name, business_phone, business_address, business_category,
                        date_of_visit, has_website, has_google_profile, uses_social_media, uses_digital_signage, offers_rewards,
                        has_online_ordering, has_delivery_options, main_challenge, student_notes
                     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                );
                $insert->execute($values);
                $interviewId = (int) $pdo->lastInsertId();
            }

            // Auto points: every interview earns the student +5 and their teacher +2 (idempotent).
            new_school_points_award_auto((int) $student['id'], 'interview', $interviewId);

            $student = new_school_refresh_student_status((int) $student['id']);
            $businessStmt = $pdo->prepare('SELECT * FROM new_school_business_interviews WHERE id = ? LIMIT 1');
            $businessStmt->execute([$interviewId]);
            $business = $businessStmt->fetch();
            $updatedInterviewCount = new_school_student_interview_count((int) $student['id']);
            new_school_add_notification(
                (int) $student['id'],
                'student',
                'business_interview',
                'Business interview saved',
                'Visit ' . $business['visit_number'] . ' for ' . $business['business_name'] . ' has been saved.',
                ['participant_id' => (string) $student['participant_id'], 'visit_number' => (int) $business['visit_number']]
            );
            new_school_add_notification(
                (int) $student['id'],
                'teacher',
                'business_interview',
                'Business interview updated',
                $student['full_name'] . ' has recorded business visit ' . $business['visit_number'] . '.',
                ['participant_id' => (string) $student['participant_id'], 'visit_number' => (int) $business['visit_number']]
            );
            new_school_add_notification(
                (int) $student['id'],
                'school',
                'business_interview',
                'Business interview updated',
                $student['full_name'] . ' has recorded business visit ' . $business['visit_number'] . '.',
                ['participant_id' => (string) $student['participant_id'], 'visit_number' => (int) $business['visit_number']]
            );
            new_school_add_notification(
                (int) $student['id'],
                'admin',
                'business_interview',
                'Business interview updated',
                $student['full_name'] . ' has recorded business visit ' . $business['visit_number'] . '.',
                ['participant_id' => (string) $student['participant_id'], 'visit_number' => (int) $business['visit_number']]
            );
            if ($updatedInterviewCount === 10) {
                new_school_add_notification(
                    (int) $student['id'],
                    'student',
                    'business_milestone',
                    'All 10 interviews complete',
                    'You have completed the 10 required business interviews.',
                    ['participant_id' => (string) $student['participant_id']]
                );
                new_school_add_notification(
                    (int) $student['id'],
                    'teacher',
                    'business_milestone',
                    'All 10 interviews complete',
                    $student['full_name'] . ' has completed all 10 interviews.',
                    ['participant_id' => (string) $student['participant_id']]
                );
                new_school_add_notification(
                    (int) $student['id'],
                    'admin',
                    'business_milestone',
                    'All 10 interviews complete',
                    $student['full_name'] . ' has completed all 10 interviews.',
                    ['participant_id' => (string) $student['participant_id']]
                );
            }
            json([
                'message' => 'Business interview saved.',
                'business' => $business,
                'student' => $student,
                'interview_count' => $updatedInterviewCount,
            ], $interviewRow ? 200 : 201);
        }

        case $key === 'POST new-school/submission': {
            $user = require_login();
            $student = null;

            if ($user['role'] === 'student') {
                $student = new_school_fetch_student_by_user_id((int) $user['id']);
            } elseif ($user['role'] === 'parent') {
                $parent = new_school_fetch_parent_by_user_id((int) $user['id']);
                $student = $parent ? new_school_fetch_student_by_id((int) $parent['student_id']) : null;
            } elseif (in_array($user['role'], ['admin', 'super_admin', 'editor'], true) && (int) ($body['student_id'] ?? 0) > 0) {
                $student = new_school_fetch_student_by_id((int) $body['student_id']);
            }

            if (!$student) {
                json(['error' => 'Student profile not found.'], 404);
            }

            if (in_array($user['role'], ['student', 'parent'], true) && !new_school_scholarship_completed((int) $student['id'])) {
                json(['error' => 'Please answer your scholarship questions in My Work before submitting your project.'], 403);
            }

            if (new_school_submission_is_locked($student, new_school_student_interview_count((int) $student['id']))) {
                json(['error' => 'This student is not yet eligible to submit.'], 422);
            }

            $problemIdentified = field($body, 'problem_identified');
            $whyItMatters = field($body, 'why_it_matters');
            $proposedSolution = field($body, 'proposed_solution');
            $howItHelps = field($body, 'how_it_helps');
            $expectedImpact = field($body, 'expected_impact');
            $videoUrl = field($body, 'video_url');
            $writtenUrl = field($body, 'written_url');
            $sourceBusinessId = (int) ($body['source_business_id'] ?? 0);

            if ($problemIdentified === '' || $whyItMatters === '' || $proposedSolution === '' || $howItHelps === '' || $expectedImpact === '') {
                json(['error' => 'Submission fields are incomplete.'], 422);
            }
            new_school_assert_words($problemIdentified, 'Problem identified', 50, 500);
            new_school_assert_words($whyItMatters, 'Why it matters', 50, 500);
            new_school_assert_words($proposedSolution, 'Proposed solution', 50, 500);
            new_school_assert_words($howItHelps, 'How it helps', 50, 500);
            new_school_assert_words($expectedImpact, 'Expected impact', 50, 500);
            if ($videoUrl === '' || $writtenUrl === '') {
                json(['error' => 'Both video and written uploads are required.'], 422);
            }

            if ($sourceBusinessId > 0) {
                $checkBusiness = db()->prepare('SELECT id FROM new_school_business_interviews WHERE id = ? AND student_id = ? LIMIT 1');
                $checkBusiness->execute([$sourceBusinessId, (int) $student['id']]);
                if (!$checkBusiness->fetchColumn()) {
                    json(['error' => 'Selected business does not belong to this student.'], 422);
                }
            } else {
                $fallback = db()->prepare('SELECT id FROM new_school_business_interviews WHERE student_id = ? ORDER BY visit_number DESC LIMIT 1');
                $fallback->execute([(int) $student['id']]);
                $sourceBusinessId = (int) $fallback->fetchColumn();
            }

            $pdo = db();
            $existing = $pdo->prepare('SELECT * FROM new_school_submissions WHERE student_id = ? LIMIT 1');
            $existing->execute([(int) $student['id']]);
            $submission = $existing->fetch();

            if ($submission) {
                // One-time only: once a student has submitted, the project is locked.
                // (A 'draft' row, if ever created, may still be finalized.)
                if ((string) $submission['status'] !== 'draft') {
                    json(['error' => 'You have already submitted your final project. Submissions are one-time only and cannot be changed.'], 409);
                }
                $update = $pdo->prepare(
                    'UPDATE new_school_submissions
                     SET source_business_id = ?,
                         problem_identified = ?,
                         why_it_matters = ?,
                         proposed_solution = ?,
                         how_it_helps = ?,
                         expected_impact = ?,
                         video_url = ?,
                         written_url = ?,
                         submission_date = NOW(),
                         status = "submitted",
                         updated_at = NOW()
                     WHERE id = ?'
                );
                $update->execute([
                    $sourceBusinessId > 0 ? $sourceBusinessId : null,
                    $problemIdentified,
                    $whyItMatters,
                    $proposedSolution,
                    $howItHelps,
                    $expectedImpact,
                    $videoUrl,
                    $writtenUrl,
                    (int) $submission['id'],
                ]);
                $submissionId = (int) $submission['id'];
            } else {
                $insert = $pdo->prepare(
                    'INSERT INTO new_school_submissions (
                        student_id, source_business_id, problem_identified, why_it_matters, proposed_solution, how_it_helps,
                        expected_impact, video_url, written_url, submission_date, status
                     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), "submitted")'
                );
                $insert->execute([
                    (int) $student['id'],
                    $sourceBusinessId > 0 ? $sourceBusinessId : null,
                    $problemIdentified,
                    $whyItMatters,
                    $proposedSolution,
                    $howItHelps,
                    $expectedImpact,
                    $videoUrl,
                    $writtenUrl,
                ]);
                $submissionId = (int) $pdo->lastInsertId();
            }

            // Auto points: the project submission earns the student +5 and their teacher +2.
            new_school_points_award_auto((int) $student['id'], 'project', $submissionId);

            $student = new_school_refresh_student_status((int) $student['id']);
            new_school_add_notification(
                (int) $student['id'],
                'student',
                'submission',
                'Final submission saved',
                'Your project submission has been saved and is ready for review.',
                ['participant_id' => (string) $student['participant_id']]
            );
            new_school_add_notification(
                (int) $student['id'],
                'parent',
                'submission',
                'Final submission saved',
                $student['full_name'] . ' has saved the final project submission.',
                ['participant_id' => (string) $student['participant_id']]
            );
            new_school_add_notification(
                (int) $student['id'],
                'teacher',
                'submission',
                'Final submission saved',
                $student['full_name'] . ' has submitted the final project.',
                ['participant_id' => (string) $student['participant_id']]
            );
            new_school_add_notification(
                (int) $student['id'],
                'school',
                'submission',
                'Final submission saved',
                $student['full_name'] . ' has submitted the final project.',
                ['participant_id' => (string) $student['participant_id']]
            );
            new_school_add_notification(
                (int) $student['id'],
                'admin',
                'submission',
                'Final submission saved',
                $student['full_name'] . ' has submitted the final project.',
                ['participant_id' => (string) $student['participant_id']]
            );
            json([
                'message' => 'Submission saved.',
                'submission' => new_school_fetch_submission_by_student_id((int) $student['id']),
                'student' => $student,
            ]);
        }

        case $key === 'POST new-school/upload': {
            if (empty($_FILES['file']) || ($_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
                json(['error' => 'No file uploaded.'], 422);
            }

            $file = $_FILES['file'];
            $mime = function_exists('mime_content_type') ? mime_content_type($file['tmp_name']) : ($file['type'] ?? '');
            $videoMimes = [
                'video/mp4' => 'mp4',
                'video/webm' => 'webm',
                'video/quicktime' => 'mov',
                'video/x-matroska' => 'mkv',
            ];
            $documentMimes = [
                'application/pdf' => 'pdf',
                'application/msword' => 'doc',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
                'image/jpeg' => 'jpg',
                'image/png' => 'png',
                'image/webp' => 'webp',
                'text/plain' => 'txt',
            ];

            $extension = null;
            $maxSize = 0;
            if (isset($videoMimes[$mime])) {
                $extension = $videoMimes[$mime];
                $maxSize = 70 * 1024 * 1024;
            } elseif (isset($documentMimes[$mime])) {
                $extension = $documentMimes[$mime];
                $maxSize = 5 * 1024 * 1024;
            }

            if ($extension === null) {
                json(['error' => 'Unsupported file type.'], 422);
            }
            if ((int) ($file['size'] ?? 0) > $maxSize) {
                json(['error' => $maxSize >= 50 * 1024 * 1024 ? 'Video must be 70MB or smaller.' : 'File must be 5MB or smaller.'], 422);
            }

            $dir = __DIR__ . '/uploads/new_school';
            if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
                json(['error' => 'Could not create upload directory.'], 500);
            }

            $prefix = str_starts_with((string) $mime, 'video/') ? 'video' : 'doc';
            $name = 'ns-' . $prefix . '-' . bin2hex(random_bytes(8)) . '.' . $extension;
            if (!move_uploaded_file($file['tmp_name'], $dir . '/' . $name)) {
                json(['error' => 'Failed to save the uploaded file.'], 500);
            }

            json([
                'url' => '/api/uploads/new_school/' . $name,
                'mime' => $mime,
                'message' => 'Uploaded.',
            ], 201);
        }

        case $key === 'GET admin/new-school/trendcatch': {
            require_admin();
            $rows = db()->query(
                "SELECT * FROM new_school_schools WHERE origin = 'trendcatch_edu' ORDER BY created_at DESC"
            )->fetchAll();
            $active = [];
            $history = [];
            foreach ($rows as $school) {
                $sid = (int) $school['id'];
                $entry = [
                    'id' => $sid,
                    'school_name' => $school['school_name'],
                    'school_address' => $school['school_address'] ?? '',
                    'school_district' => $school['school_district'] ?? '',
                    'main_phone' => $school['main_phone'] ?? '',
                    'principal_name' => $school['principal_name'] ?? '',
                    'administrator_name' => $school['administrator_name'] ?? '',
                    'administrator_email' => $school['administrator_email'],
                    'school_website' => $school['school_website'] ?? '',
                    'origin' => $school['origin'] ?? 'principal',
                    'status' => $school['status'],
                    'claim_status' => $school['claim_status'] ?? 'unclaimed',
                    'created_at' => $school['created_at'],
                    'claimed_at' => $school['claimed_at'] ?? null,
                    'user_count' => new_school_school_user_count($sid),
                    'teachers' => new_school_fetch_teachers_for_school($sid),
                    'students' => new_school_fetch_students_for_school($school),
                ];
                if (($school['claim_status'] ?? 'unclaimed') === 'claimed') {
                    $history[] = $entry;
                } else {
                    $active[] = $entry;
                }
            }
            json(['active' => $active, 'history' => $history]);
        }

        case $key === 'POST admin/new-school/school/create': {
            require_admin();
            $schoolName = require_name_field(field($body, 'school_name'), 'School name', 2);
            $schoolAddress = field($body, 'school_address');
            $schoolDistrict = field($body, 'school_district');
            $mainPhone = field($body, 'main_phone');
            $principalName = field($body, 'principal_name');
            $administratorName = field($body, 'administrator_name');
            $administratorEmail = field($body, 'administrator_email');
            $administratorPhone = field($body, 'administrator_phone');
            $schoolWebsite = field($body, 'school_website');

            if ($administratorEmail !== '') {
                $administratorEmail = require_email($administratorEmail);
            }
            if ($mainPhone !== '') {
                $mainPhone = require_phone($mainPhone, 'Main phone number');
            }
            if ($administratorPhone !== '') {
                $administratorPhone = require_phone($administratorPhone, 'Administrator phone');
            }

            $school = new_school_find_or_create_edu_school($schoolName, $administratorEmail, $schoolWebsite);
            if (!$school) {
                json(['error' => 'School name is required.'], 422);
            }
            if ((int) ($school['user_id'] ?? 0) > 0 || (string) ($school['claim_status'] ?? '') === 'claimed') {
                json(['error' => 'That school already has a principal and cannot be recreated.'], 409);
            }

            $principalName = $principalName !== '' ? $principalName : (string) ($school['principal_name'] ?? '');
            $administratorName = $administratorName !== '' ? $administratorName : $principalName;
            $schoolAddress = $schoolAddress !== '' ? $schoolAddress : (string) ($school['school_address'] ?? '');
            $schoolDistrict = $schoolDistrict !== '' ? $schoolDistrict : (string) ($school['school_district'] ?? '');
            $mainPhone = $mainPhone !== '' ? $mainPhone : (string) ($school['main_phone'] ?? '');
            $administratorEmail = $administratorEmail !== '' ? $administratorEmail : (string) ($school['administrator_email'] ?? '');
            $administratorPhone = $administratorPhone !== '' ? $administratorPhone : (string) ($school['administrator_phone'] ?? '');
            $schoolWebsite = $schoolWebsite !== '' ? $schoolWebsite : (string) ($school['school_website'] ?? '');

            db()->prepare(
                'UPDATE new_school_schools
                 SET school_address = ?, school_district = ?, main_phone = ?, principal_name = ?,
                     administrator_name = ?, administrator_email = ?, administrator_phone = ?,
                     school_website = ?, status = "approved", origin = "trendcatch_edu",
                     claim_status = "unclaimed", user_id = NULL, updated_at = NOW()
                 WHERE id = ?'
            )->execute([
                $schoolAddress,
                $schoolDistrict,
                $mainPhone,
                $principalName,
                $administratorName,
                $administratorEmail,
                $administratorPhone,
                $schoolWebsite,
                (int) $school['id'],
            ]);

            json([
                'message' => 'School created and published.',
                'school' => new_school_fetch_school_by_id((int) $school['id']),
            ], 201);
        }
        case $key === 'POST admin/new-school/school/set-status': {
            require_admin();
            $schoolId = (int) ($body['school_id'] ?? 0);
            $status = field($body, 'status') ?: 'approved';
            if ($schoolId <= 0) {
                json(['error' => 'A school is required.'], 422);
            }
            if (!in_array($status, ['registered', 'approved', 'rejected'], true)) {
                json(['error' => 'Invalid school status.'], 422);
            }
            $school = new_school_fetch_school_by_id($schoolId);
            if (!$school) {
                json(['error' => 'School not found.'], 404);
            }
            db()->prepare('UPDATE new_school_schools SET status = ?, updated_at = NOW() WHERE id = ?')
                ->execute([$status, $schoolId]);
            // Keep the principal's account in sync when one exists (claimed schools).
            if (!empty($school['user_id'])) {
                $accountStatus = $status === 'approved' ? 'approved' : ($status === 'rejected' ? 'rejected' : 'pending');
                try {
                    db()->prepare('UPDATE users SET approval_status = ?, updated_at = NOW() WHERE id = ?')
                        ->execute([$accountStatus, (int) $school['user_id']]);
                } catch (\Throwable $e) { /* non-fatal */ }
            }
            json(['message' => 'School status updated.', 'school' => new_school_fetch_school_by_id($schoolId)]);
        }

        case $key === 'POST admin/new-school/school/claim': {
            require_admin();
            $schoolId = (int) ($body['school_id'] ?? 0);
            $school = $schoolId > 0 ? new_school_fetch_school_by_id($schoolId) : null;
            if (!$school) {
                json(['error' => 'School not found.'], 404);
            }
            if (($school['claim_status'] ?? 'unclaimed') === 'claimed') {
                json(['error' => 'This school has already been claimed.'], 409);
            }
            $principalName = require_name_field(field($body, 'principal_name'), 'Principal name', 3);
            $administratorName = field($body, 'administrator_name') !== '' ? field($body, 'administrator_name') : $principalName;
            $administratorEmail = require_email(field($body, 'administrator_email'));
            $administratorPhone = field($body, 'administrator_phone');
            $mainPhone = field($body, 'main_phone') !== '' ? field($body, 'main_phone') : $administratorPhone;
            $schoolAddress = field($body, 'school_address');
            $schoolDistrict = field($body, 'school_district');
            $schoolWebsite = field($body, 'school_website') !== '' ? field($body, 'school_website') : (string) ($school['school_website'] ?? '');
            $password = field($body, 'password');
            if ($administratorPhone === '' || $schoolAddress === '' || $schoolDistrict === '') {
                json(['error' => 'Principal phone, school address, and district are required to claim.'], 422);
            }
            $administratorPhone = require_phone($administratorPhone, 'Principal phone');
            $mainPhone = require_phone($mainPhone, 'Main phone number');
            if ($password === '' || strlen($password) < 6) {
                json(['error' => 'Set a principal password of at least 6 characters.'], 422);
            }

            // Create (or reuse) the principal's login and activate it immediately.
            $principalUser = new_school_upsert_user_account($administratorName, $administratorEmail, $password, 'school');
            db()->prepare("UPDATE users SET approval_status = 'approved', updated_at = NOW() WHERE id = ?")
                ->execute([(int) $principalUser['id']]);

            try {
                db()->prepare(
                    'UPDATE new_school_schools
                     SET user_id = ?, principal_name = ?, administrator_name = ?, administrator_email = ?,
                         administrator_phone = ?, main_phone = ?, school_address = ?, school_district = ?,
                         school_website = ?, status = "approved", claim_status = "claimed", claimed_at = NOW(), updated_at = NOW()
                     WHERE id = ?'
                )->execute([
                    (int) $principalUser['id'], $principalName, $administratorName, $administratorEmail,
                    $administratorPhone, $mainPhone, $schoolAddress, $schoolDistrict, $schoolWebsite,
                    $schoolId,
                ]);
            } catch (\Throwable $e) {
                json(['error' => 'Could not claim this school — the principal email may already own another school.'], 409);
            }

            new_school_add_notification(
                null, 'admin', 'trendcatch_edu_claim', 'School claimed',
                $school['school_name'] . ' was claimed and handed to ' . $principalName . '.',
                ['school_id' => $schoolId, 'school_name' => $school['school_name']]
            );

            json([
                'message' => 'School claimed. The principal can now sign in and manage it.',
                'school' => new_school_fetch_school_by_id($schoolId),
            ]);
        }

        case $key === 'GET admin/new-school/summary': {
            require_admin();
            $students = db()->query(
                'SELECT s.*, u.full_name AS user_full_name, u.email AS user_email, u.avatar_url AS avatar_url,
                        (SELECT COUNT(*) FROM new_school_business_interviews bi WHERE bi.student_id = s.id) AS interview_count,
                        (SELECT COUNT(*) FROM new_school_submissions sub WHERE sub.student_id = s.id) AS has_submission
                 FROM new_school_students s
                 INNER JOIN users u ON u.id = s.user_id
                 ORDER BY s.created_at DESC'
            )->fetchAll();

            $submissions = db()->query(
                'SELECT sub.*, s.full_name AS student_name, s.grade_level, s.participant_id, u.email AS student_email,
                        b.business_name AS source_business_name, b.owner_name AS source_owner_name
                 FROM new_school_submissions sub
                 INNER JOIN new_school_students s ON s.id = sub.student_id
                 INNER JOIN users u ON u.id = s.user_id
                 LEFT JOIN new_school_business_interviews b ON b.id = sub.source_business_id
                 ORDER BY sub.updated_at DESC'
            )->fetchAll();

            $winners = db()->query(
                'SELECT w.*, s.full_name AS student_name, s.grade_level, s.participant_id, u.email AS student_email,
                        sub.score, sub.rank_position
                 FROM new_school_winners w
                 INNER JOIN new_school_students s ON s.id = w.student_id
                 INNER JOIN users u ON u.id = s.user_id
                 INNER JOIN new_school_submissions sub ON sub.id = w.submission_id
                 ORDER BY w.created_at DESC'
            )->fetchAll();

            $parents = db()->query(
                'SELECT p.*, s.full_name AS student_name, s.grade_level, s.participant_id, s.school_name, s.parent_consent_status,
                        u.email AS student_email
                 FROM new_school_parents p
                 INNER JOIN new_school_students s ON s.id = p.student_id
                 INNER JOIN users u ON u.id = s.user_id
                 ORDER BY p.updated_at DESC, p.created_at DESC'
            )->fetchAll();

            $approvals = db()->query(
                'SELECT a.*, s.full_name AS student_name, s.grade_level, s.participant_id, s.school_name, s.parent_consent_status,
                        s.school_approval_status, s.teacher_approval_status, u.email AS student_email,
                        rv.full_name AS reviewer_user_name, rv.email AS reviewer_user_email
                 FROM new_school_approvals a
                 INNER JOIN new_school_students s ON s.id = a.student_id
                 INNER JOIN users u ON u.id = s.user_id
                 LEFT JOIN users rv ON rv.id = a.reviewer_user_id
                 ORDER BY a.updated_at DESC, a.created_at DESC'
            )->fetchAll();

            $businesses = db()->query(
                'SELECT bi.*, s.full_name AS student_name, s.grade_level, s.participant_id, s.school_name, u.email AS student_email
                 FROM new_school_business_interviews bi
                 INNER JOIN new_school_students s ON s.id = bi.student_id
                 INNER JOIN users u ON u.id = s.user_id
                 ORDER BY bi.created_at DESC'
            )->fetchAll();

            $notifications = db()->query(
                'SELECT n.*, s.full_name AS student_name, s.participant_id, s.school_name
                 FROM new_school_notifications n
                 LEFT JOIN new_school_students s ON s.id = n.student_id
                 ORDER BY n.created_at DESC
                 LIMIT 50'
            )->fetchAll();

            $allStudentIds = array_map(static fn(array $r): int => (int) $r['id'], $students);
            // Rank students + teachers so the admin Schools area can show points/rank
            // and per-school leaderboards (filter client-side by school_id).
            $students = new_school_rank_students($students);
            $teachers = new_school_rank_teachers(new_school_fetch_all_teachers(), $students);
            json([
                'summary' => new_school_public_summary(),
                'student_summary' => new_school_student_status_summary($students),
                'leaderboards' => new_school_public_leaderboards(),
                'school_rankings' => new_school_school_rankings(),
                'schools' => new_school_fetch_all_schools(),
                'students' => $students,
                'teachers' => $teachers,
                'parents' => $parents,
                'approvals' => $approvals,
                'businesses' => $businesses,
                'submissions' => $submissions,
                'winners' => $winners,
                'notifications' => $notifications,
                'scholarship' => new_school_fetch_scholarship_by_student_ids($allStudentIds),
            ]);
        }

        case $key === 'GET admin/new-school/export': {
            require_admin();
            $type = strtolower(trim((string) ($_GET['type'] ?? 'students')));

            if ($type === 'schools') {
                $rows = db()->query(
                    'SELECT sc.id, sc.school_name, sc.school_address, sc.zip_code, sc.school_district, sc.main_phone, sc.principal_name,
                            sc.administrator_name, sc.administrator_email, sc.administrator_phone, sc.status, sc.created_at, sc.updated_at,
                            (SELECT COUNT(*) FROM new_school_students st WHERE st.school_id = sc.id OR st.school_name = sc.school_name) AS students_count,
                            (SELECT COUNT(*) FROM new_school_teachers t WHERE t.school_id = sc.id) AS teachers_count
                     FROM new_school_schools sc
                     ORDER BY sc.school_name ASC'
                )->fetchAll();
                $csv = new_school_rows_to_csv($rows);
                json(['filename' => 'new-school-schools.csv', 'rows' => $rows, 'csv' => $csv]);
            }

            if ($type === 'teachers') {
                $rows = db()->query(
                    'SELECT t.id, t.teacher_full_name, t.school_email, t.phone_number, t.role_department, t.grade_level_supported,
                            t.status, t.created_at, t.updated_at,
                            s.school_name, s.school_district, s.administrator_email AS school_administrator_email,
                            u.email AS login_email
                     FROM new_school_teachers t
                     LEFT JOIN new_school_schools s ON s.id = t.school_id
                     LEFT JOIN users u ON u.id = t.user_id
                     ORDER BY t.created_at DESC'
                )->fetchAll();
                $csv = new_school_rows_to_csv($rows);
                json(['filename' => 'new-school-teachers.csv', 'rows' => $rows, 'csv' => $csv]);
            }

            if ($type === 'parents') {
                $rows = db()->query(
                    'SELECT p.id, p.student_id, s.full_name AS student_name, s.participant_id, s.grade_level, s.school_name,
                            p.parent_full_name, p.relationship_to_student, p.phone_number, p.email, p.home_address, p.zip_code,
                            p.consent_checked, p.approved_at, p.consented_at, p.digital_signature, p.created_at, p.updated_at,
                            s.parent_consent_status AS student_parent_status,
                            u.email AS student_email
                     FROM new_school_parents p
                     INNER JOIN new_school_students s ON s.id = p.student_id
                     INNER JOIN users u ON u.id = s.user_id
                     ORDER BY p.updated_at DESC, p.created_at DESC'
                )->fetchAll();
                $csv = new_school_rows_to_csv($rows);
                json(['filename' => 'new-school-parents.csv', 'rows' => $rows, 'csv' => $csv]);
            }

            if ($type === 'notifications') {
                $rows = db()->query(
                    'SELECT n.id, n.student_id, s.full_name AS student_name, s.participant_id, s.school_name,
                            n.recipient_role, n.notification_type, n.title, n.message, n.payload_json, n.is_read, n.read_at,
                            n.created_at, n.updated_at
                     FROM new_school_notifications n
                     LEFT JOIN new_school_students s ON s.id = n.student_id
                     ORDER BY n.created_at DESC'
                )->fetchAll();
                foreach ($rows as &$row) {
                    $payload = $row['payload_json'] ?? null;
                    if (is_string($payload) && $payload !== '') {
                        $decoded = json_decode($payload, true);
                        $row['payload'] = is_array($decoded) ? $decoded : null;
                    } else {
                        $row['payload'] = null;
                    }
                }
                unset($row);
                $csv = new_school_rows_to_csv($rows);
                json(['filename' => 'new-school-notifications.csv', 'rows' => $rows, 'csv' => $csv]);
            }

            if ($type === 'submissions') {
                $rows = db()->query(
                    'SELECT sub.id, sub.student_id, s.full_name AS student_name, s.grade_level, s.participant_id, u.email AS student_email,
                            sub.problem_identified, sub.why_it_matters, sub.proposed_solution, sub.how_it_helps, sub.expected_impact,
                            sub.video_url, sub.written_url, sub.status, sub.score, sub.rank_position, sub.submission_date, sub.updated_at
                     FROM new_school_submissions sub
                     INNER JOIN new_school_students s ON s.id = sub.student_id
                     INNER JOIN users u ON u.id = s.user_id
                     ORDER BY sub.updated_at DESC'
                )->fetchAll();
                $csv = new_school_rows_to_csv($rows);
                json(['filename' => 'new-school-submissions.csv', 'rows' => $rows, 'csv' => $csv]);
            }

            if ($type === 'winners') {
                $rows = db()->query(
                    'SELECT w.id, w.place, w.scholarship_amount, w.announced_at, w.published_at,
                            s.full_name AS student_name, s.grade_level, s.participant_id, u.email AS student_email,
                            sub.status, sub.score, sub.rank_position
                     FROM new_school_winners w
                     INNER JOIN new_school_students s ON s.id = w.student_id
                     INNER JOIN users u ON u.id = s.user_id
                     INNER JOIN new_school_submissions sub ON sub.id = w.submission_id
                     ORDER BY w.created_at DESC'
                )->fetchAll();
                $csv = new_school_rows_to_csv($rows);
                json(['filename' => 'new-school-winners.csv', 'rows' => $rows, 'csv' => $csv]);
            }

            if ($type === 'businesses') {
                $rows = db()->query(
                    'SELECT bi.id, bi.student_id, s.full_name AS student_name, s.grade_level, s.participant_id, u.email AS student_email,
                            bi.visit_number, bi.business_name, bi.owner_name, bi.business_phone, bi.business_address, bi.business_category,
                            bi.date_of_visit, bi.has_website, bi.has_google_profile, bi.uses_social_media, bi.uses_digital_signage,
                            bi.offers_rewards, bi.has_online_ordering, bi.has_delivery_options, bi.main_challenge, bi.student_notes,
                            bi.created_at, bi.updated_at
                     FROM new_school_business_interviews bi
                     INNER JOIN new_school_students s ON s.id = bi.student_id
                     INNER JOIN users u ON u.id = s.user_id
                     ORDER BY bi.created_at DESC'
                )->fetchAll();
                $csv = new_school_rows_to_csv($rows);
                json(['filename' => 'new-school-businesses.csv', 'rows' => $rows, 'csv' => $csv]);
            }

            if ($type === 'approvals') {
                $rows = db()->query(
                    'SELECT a.id, a.student_id, s.full_name AS student_name, s.grade_level, s.participant_id, u.email AS student_email,
                            a.approval_type, a.reviewer_name, a.reviewer_email, a.reviewer_role, a.status, a.notes,
                            a.digital_signature, a.approved_at, a.created_at, a.updated_at
                     FROM new_school_approvals a
                     INNER JOIN new_school_students s ON s.id = a.student_id
                     INNER JOIN users u ON u.id = s.user_id
                     ORDER BY a.updated_at DESC'
                )->fetchAll();
                $csv = new_school_rows_to_csv($rows);
                json(['filename' => 'new-school-approvals.csv', 'rows' => $rows, 'csv' => $csv]);
            }

            $rows = db()->query(
                'SELECT s.id, s.participant_id, s.student_username, s.full_name, s.email, s.phone_number, s.home_address, s.zip_code,
                        s.school_name, s.grade_level, s.parent_name, s.parent_phone, s.parent_email,
                        s.parent_consent_status, s.school_approval_status, s.teacher_approval_status, s.submission_status,
                        s.overall_status, s.created_at, s.updated_at,
                        u.email AS login_email,
                        (SELECT COUNT(*) FROM new_school_business_interviews bi WHERE bi.student_id = s.id) AS interview_count,
                        (SELECT COUNT(*) FROM new_school_submissions sub WHERE sub.student_id = s.id) AS submission_count
                 FROM new_school_students s
                 INNER JOIN users u ON u.id = s.user_id
                 ORDER BY s.created_at DESC'
            )->fetchAll();
            $csv = new_school_rows_to_csv($rows);
            json(['filename' => 'new-school-students.csv', 'rows' => $rows, 'csv' => $csv]);
        }

        case $method === 'PUT' && preg_match('#^admin/new-school/submission/(\d+)$#', $route, $m) === 1: {
            require_admin();
            $submissionId = (int) $m[1];
            $status = field($body, 'status') ?: 'submitted';
            $notes = field($body, 'reviewer_notes');
            $score = $body['score'] ?? null;
            $rankPosition = (int) ($body['rank_position'] ?? 0);
            $place = field($body, 'place');
            $scholarshipAmount = (float) ($body['scholarship_amount'] ?? 0);

            if (!in_array($status, ['draft', 'submitted', 'approved', 'rejected', 'winner'], true)) {
                json(['error' => 'Invalid submission status.'], 422);
            }
            if ($status === 'winner' && ($place === '' || $scholarshipAmount <= 0)) {
                json(['error' => 'Winner entries require a place and scholarship amount.'], 422);
            }

            $pdo = db();
            $submissionStmt = $pdo->prepare('SELECT * FROM new_school_submissions WHERE id = ? LIMIT 1');
            $submissionStmt->execute([$submissionId]);
            $submission = $submissionStmt->fetch();
            if (!$submission) {
                json(['error' => 'Submission not found.'], 404);
            }

            $pdo->beginTransaction();
            try {
                $reviewer = require_admin();
                $reviewedAt = date('Y-m-d H:i:s');
                $update = $pdo->prepare(
                    'UPDATE new_school_submissions
                     SET status = ?, reviewer_notes = ?, score = ?, rank_position = ?, reviewed_by_user_id = ?, reviewed_at = ?, updated_at = NOW()
                     WHERE id = ?'
                );
                $update->execute([
                    $status,
                    $notes ?: null,
                    $score !== null && $score !== '' ? (float) $score : null,
                    $rankPosition > 0 ? $rankPosition : null,
                    (int) $reviewer['id'],
                    $reviewedAt,
                    $submissionId,
                ]);

                $winner = null;
                if ($status === 'winner') {
                    $student = new_school_fetch_student_by_id((int) $submission['student_id']);
                    $winnerStmt = $pdo->prepare(
                        'INSERT INTO new_school_winners (
                            student_id, submission_id, place, scholarship_amount, announced_at, published_at
                         ) VALUES (?, ?, ?, ?, NOW(), NOW())
                         ON DUPLICATE KEY UPDATE
                            student_id = VALUES(student_id),
                            place = VALUES(place),
                            scholarship_amount = VALUES(scholarship_amount),
                            announced_at = VALUES(announced_at),
                            published_at = VALUES(published_at)'
                    );
                    $winnerStmt->execute([
                        (int) $submission['student_id'],
                        $submissionId,
                        $place,
                        $scholarshipAmount,
                    ]);
                    $winner = new_school_fetch_winner_by_student_id((int) $submission['student_id']);

                    $subUpdate = $pdo->prepare('UPDATE new_school_submissions SET status = "winner", updated_at = NOW() WHERE id = ?');
                    $subUpdate->execute([$submissionId]);
                    if ($student) {
                        new_school_refresh_student_status((int) $student['id']);
                    }
                } elseif (in_array($status, ['approved', 'rejected'], true)) {
                    $subUpdate = $pdo->prepare('DELETE FROM new_school_winners WHERE submission_id = ?');
                    $subUpdate->execute([$submissionId]);
                    $student = new_school_fetch_student_by_id((int) $submission['student_id']);
                    if ($student) {
                        new_school_refresh_student_status((int) $student['id']);
                    }
                }

                $pdo->commit();
                $studentRecord = new_school_fetch_student_by_id((int) $submission['student_id']);
                if ($studentRecord) {
                    $statusLabel = $status === 'winner' ? 'winner' : $status;
                    new_school_add_notification(
                        (int) $studentRecord['id'],
                        'student',
                        'submission_review',
                        'Submission ' . $statusLabel,
                        'Your final project submission has been ' . $statusLabel . '.',
                        ['participant_id' => (string) $studentRecord['participant_id'], 'status' => $status]
                    );
                    new_school_add_notification(
                        (int) $studentRecord['id'],
                        'parent',
                        'submission_review',
                        'Submission ' . $statusLabel,
                        $studentRecord['full_name'] . "'s final submission has been " . $statusLabel . '.',
                        ['participant_id' => (string) $studentRecord['participant_id'], 'status' => $status]
                    );
                    new_school_add_notification(
                        (int) $studentRecord['id'],
                        'teacher',
                        'submission_review',
                        'Submission ' . $statusLabel,
                        $studentRecord['full_name'] . "'s final submission has been " . $statusLabel . '.',
                        ['participant_id' => (string) $studentRecord['participant_id'], 'status' => $status]
                    );
                    new_school_add_notification(
                        (int) $studentRecord['id'],
                        'school',
                        'submission_review',
                        'Submission ' . $statusLabel,
                        $studentRecord['full_name'] . "'s final submission has been " . $statusLabel . '.',
                        ['participant_id' => (string) $studentRecord['participant_id'], 'status' => $status]
                    );
                    new_school_add_notification(
                        (int) $studentRecord['id'],
                        'admin',
                        'submission_review',
                        'Submission ' . $statusLabel,
                        $studentRecord['full_name'] . "'s final submission has been " . $statusLabel . '.',
                        ['participant_id' => (string) $studentRecord['participant_id'], 'status' => $status]
                    );
                }
                json([
                    'message' => 'Submission updated.',
                    'submission' => new_school_fetch_submission_by_student_id((int) $submission['student_id']),
                    'winner' => $winner,
                ]);
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                json(['error' => app_debug() ? $e->getMessage() : 'Unable to update submission.'], 500);
            }
        }

        case $key === 'POST admin/new-school/points': {
            // Admin bonus points on approval (student up to 15, teacher up to 8, default 3).
            // Idempotent: re-submitting REPLACES the bonus for this interview/project.
            $reviewer = require_admin();
            $sourceType = field($body, 'source_type');
            $sourceId = (int) ($body['source_id'] ?? 0);
            if (!in_array($sourceType, ['interview', 'project'], true) || $sourceId <= 0) {
                json(['error' => 'A valid source_type (interview|project) and source_id are required.'], 422);
            }
            $pdo = db();
            $srcStmt = $sourceType === 'interview'
                ? $pdo->prepare('SELECT student_id FROM new_school_business_interviews WHERE id = ? LIMIT 1')
                : $pdo->prepare('SELECT student_id FROM new_school_submissions WHERE id = ? LIMIT 1');
            $srcStmt->execute([$sourceId]);
            $src = $srcStmt->fetch();
            if (!$src) {
                json(['error' => 'The selected ' . $sourceType . ' was not found.'], 404);
            }
            $studentId = (int) $src['student_id'];
            $studentPoints = (int) ($body['student_points'] ?? 0);
            $teacherPoints = array_key_exists('teacher_points', $body) ? (int) $body['teacher_points'] : NS_POINTS_TEACHER_BONUS_DEFAULT;
            new_school_points_award_bonus($studentId, $sourceType, $sourceId, $studentPoints, $teacherPoints, (int) $reviewer['id']);
            $teacherId = new_school_points_teacher_for_student($studentId);
            json([
                'success' => true,
                'student_id' => $studentId,
                'student_points_total' => new_school_points_total('student', $studentId),
                'teacher_points_total' => $teacherId > 0 ? new_school_points_total('teacher', $teacherId) : 0,
            ]);
        }

        case $key === 'POST admin/new-school/star': {
            // Admin "star" toggle for standout projects / business interviews.
            require_admin();
            $entity = field($body, 'entity');
            $id = (int) ($body['id'] ?? 0);
            $starred = !empty($body['starred']) ? 1 : 0;
            $table = $entity === 'interview'
                ? 'new_school_business_interviews'
                : ($entity === 'submission' ? 'new_school_submissions' : '');
            if ($table === '' || $id <= 0) {
                json(['error' => 'A valid entity (submission|interview) and id are required.'], 422);
            }
            $stmt = db()->prepare("UPDATE $table SET is_starred = ? WHERE id = ?");
            $stmt->execute([$starred, $id]);
            json(['success' => true, 'entity' => $entity, 'id' => $id, 'starred' => (bool) $starred]);
        }

        case $key === 'POST admin/new-school/winners/publish': {
            require_admin();
            $winners = $body['winners'] ?? [];
            if (!is_array($winners) || $winners === []) {
                json(['error' => 'Winners array is required.'], 422);
            }

            $pdo = db();
            $pdo->beginTransaction();
            try {
                $published = [];
                foreach ($winners as $winnerRow) {
                    if (!is_array($winnerRow)) {
                        continue;
                    }
                    $submissionId = (int) ($winnerRow['submission_id'] ?? 0);
                    $place = field($winnerRow, 'place');
                    $amount = (float) ($winnerRow['scholarship_amount'] ?? 0);
                    if ($submissionId <= 0 || $place === '' || $amount <= 0) {
                        continue;
                    }

                    $submissionStmt = $pdo->prepare('SELECT * FROM new_school_submissions WHERE id = ? LIMIT 1');
                    $submissionStmt->execute([$submissionId]);
                    $submission = $submissionStmt->fetch();
                    if (!$submission) {
                        continue;
                    }

                    $pdo->prepare('UPDATE new_school_submissions SET status = "winner", rank_position = COALESCE(rank_position, ?), updated_at = NOW() WHERE id = ?')
                        ->execute([(int) ($winnerRow['rank_position'] ?? 0) ?: null, $submissionId]);

                    $pdo->prepare(
                        'INSERT INTO new_school_winners (
                            student_id, submission_id, place, scholarship_amount, announced_at, published_at
                         ) VALUES (?, ?, ?, ?, NOW(), NOW())
                         ON DUPLICATE KEY UPDATE
                            student_id = VALUES(student_id),
                            place = VALUES(place),
                            scholarship_amount = VALUES(scholarship_amount),
                            announced_at = VALUES(announced_at),
                            published_at = VALUES(published_at)'
                    )->execute([
                        (int) $submission['student_id'],
                        $submissionId,
                        $place,
                        $amount,
                    ]);

                    $studentRecord = new_school_refresh_student_status((int) $submission['student_id']);
                    if ($studentRecord) {
                        new_school_add_notification(
                            (int) $studentRecord['id'],
                            'student',
                            'winner_published',
                            'You won ' . $place . ' place',
                            'Your project was published as a winner in ' . $place . ' place.',
                            ['participant_id' => (string) $studentRecord['participant_id'], 'place' => $place, 'amount' => $amount]
                        );
                        new_school_add_notification(
                            (int) $studentRecord['id'],
                            'parent',
                            'winner_published',
                            'Winner announced',
                            $studentRecord['full_name'] . ' earned ' . $place . ' place in the challenge.',
                            ['participant_id' => (string) $studentRecord['participant_id'], 'place' => $place, 'amount' => $amount]
                        );
                        new_school_add_notification(
                            (int) $studentRecord['id'],
                            'teacher',
                            'winner_published',
                            'Winner announced',
                            $studentRecord['full_name'] . ' earned ' . $place . ' place in the challenge.',
                            ['participant_id' => (string) $studentRecord['participant_id'], 'place' => $place, 'amount' => $amount]
                        );
                        new_school_add_notification(
                            (int) $studentRecord['id'],
                            'school',
                            'winner_published',
                            'Winner announced',
                            $studentRecord['full_name'] . ' earned ' . $place . ' place in the challenge.',
                            ['participant_id' => (string) $studentRecord['participant_id'], 'place' => $place, 'amount' => $amount]
                        );
                        new_school_add_notification(
                            (int) $studentRecord['id'],
                            'admin',
                            'winner_published',
                            'Winner announced',
                            $studentRecord['full_name'] . ' earned ' . $place . ' place in the challenge.',
                            ['participant_id' => (string) $studentRecord['participant_id'], 'place' => $place, 'amount' => $amount]
                        );
                    }
                    $published[] = [
                        'submission_id' => $submissionId,
                        'student_id' => (int) $submission['student_id'],
                        'place' => $place,
                        'scholarship_amount' => $amount,
                    ];
                }
                $pdo->commit();
                json(['message' => 'Winners published.', 'winners' => $published]);
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                json(['error' => app_debug() ? $e->getMessage() : 'Unable to publish winners.'], 500);
            }
        }

        /* =================== Records CRUD (school principal + admin) =================== */

        // ----- Students -----
        case $key === 'POST new-school/manage/student': {
            $user = ns_manage_require_user();
            $scope = ns_manage_scope($user);
            if (!ns_manage_can_write_entity($scope, 'student', 'create')) {
                json(['error' => 'Your role cannot create student records.'], 403);
            }
            $fullName = field($body, 'full_name');
            $email = require_email(field($body, 'email'));
            if ($fullName === '' || $email === '') {
                json(['error' => 'Student name and email are required.'], 422);
            }
            $schoolId = $scope['school_id'] ?? (((int) ($body['school_id'] ?? 0)) ?: null);
            $school = $schoolId ? new_school_fetch_school_by_id($schoolId) : null;
            $schoolName = $school ? (string) $school['school_name'] : field($body, 'school_name');
            $teacherId = ((int) ($body['teacher_id'] ?? 0)) ?: null;
            if ($scope['kind'] === 'teacher') {
                $teacherId = (int) $scope['teacher_id']; // a teacher always creates into their own class
            }
            if ($teacherId) {
                $teacher = new_school_fetch_teacher_by_id($teacherId);
                if (!$teacher || ($schoolId && (int) $teacher['school_id'] !== (int) $schoolId)) {
                    json(['error' => 'Selected teacher is not part of your school.'], 422);
                }
            }
            $password = field($body, 'password') ?: ns_manage_random_password();
            $account = new_school_upsert_user_account($fullName, $email, $password, 'student');
            $pdo = db();
            $pdo->prepare('UPDATE users SET approval_status = "approved" WHERE id = ?')->execute([(int) $account['id']]);
            $exists = $pdo->prepare('SELECT id FROM new_school_students WHERE user_id = ? LIMIT 1');
            $exists->execute([(int) $account['id']]);
            if ($exists->fetch()) {
                json(['error' => 'A student record already exists for this email.'], 409);
            }
            $participantId = new_school_generate_participant_id();
            $qrToken = new_school_generate_qr_token();
            $qrUrl = new_school_qr_url($qrToken);
            $username = field($body, 'student_username') ?: ('stu_' . strtolower(bin2hex(random_bytes(4))));
            $insert = $pdo->prepare(
                'INSERT INTO new_school_students (
                    user_id, school_id, teacher_id, participant_id, qr_token, qr_url,
                    full_name, student_username, age, date_of_birth, email, phone_number,
                    home_address, zip_code, school_name, grade_level, parent_name, parent_phone, parent_email,
                    parent_consent_status, school_approval_status, teacher_approval_status, submission_status, overall_status
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "pending", "pending", "pending", "locked", "student_registered")'
            );
            $insert->execute([
                (int) $account['id'], $schoolId, $teacherId, $participantId, $qrToken, $qrUrl,
                $fullName, $username, (int) ($body['age'] ?? 0), field($body, 'date_of_birth') ?: '2010-01-01',
                $email, field($body, 'phone_number'), field($body, 'home_address'), field($body, 'zip_code'), $schoolName,
                field($body, 'grade_level'), field($body, 'parent_name'), field($body, 'parent_phone'), field($body, 'parent_email'),
            ]);
            $studentId = (int) $pdo->lastInsertId();
            $student = new_school_refresh_student_status($studentId) ?: new_school_fetch_student_by_id($studentId);
            json(['message' => 'Student created.', 'student' => $student], 201);
        }

        case $method === 'PUT' && preg_match('#^new-school/manage/student/(\d+)$#', $route, $m) === 1: {
            $user = ns_manage_require_user();
            $scope = ns_manage_scope($user);
            if (!ns_manage_can_write_entity($scope, 'student', 'update')) {
                json(['error' => 'Your role cannot modify student records.'], 403);
            }
            $student = new_school_fetch_student_by_id((int) $m[1]);
            if (!$student) {
                json(['error' => 'Student not found.'], 404);
            }
            ns_manage_assert_student($student, $scope);
            $fields = [];
            $values = [];
            $textMap = [
                'full_name' => 'full_name', 'email' => 'email', 'phone_number' => 'phone_number',
                'home_address' => 'home_address', 'zip_code' => 'zip_code', 'grade_level' => 'grade_level',
                'parent_name' => 'parent_name', 'parent_phone' => 'parent_phone', 'parent_email' => 'parent_email',
            ];
            foreach ($textMap as $bk => $col) {
                if (array_key_exists($bk, $body)) { $fields[] = "$col = ?"; $values[] = field($body, $bk); }
            }
            if (array_key_exists('age', $body)) { $fields[] = 'age = ?'; $values[] = (int) $body['age']; }
            if (array_key_exists('date_of_birth', $body) && field($body, 'date_of_birth') !== '') { $fields[] = 'date_of_birth = ?'; $values[] = field($body, 'date_of_birth'); }
            $scopeSchool = $scope['school_id'] ?? null;
            $canApprove = in_array($scope['kind'], ['admin', 'school', 'teacher'], true);
            if ($canApprove && array_key_exists('teacher_id', $body)) {
                $tid = ((int) ($body['teacher_id'] ?? 0)) ?: null;
                if ($tid) {
                    $t = new_school_fetch_teacher_by_id($tid);
                    if (!$t || ($scopeSchool !== null && (int) $t['school_id'] !== (int) $scopeSchool)) { json(['error' => 'Invalid teacher.'], 422); }
                }
                $fields[] = 'teacher_id = ?'; $values[] = $tid;
            }
            if ($canApprove) {
                foreach (['parent_consent_status', 'school_approval_status', 'teacher_approval_status'] as $sc) {
                    if (array_key_exists($sc, $body)) {
                        $sv = field($body, $sc);
                        if (!in_array($sv, ['pending', 'approved', 'rejected'], true)) { json(['error' => 'Invalid status.'], 422); }
                        $fields[] = "$sc = ?"; $values[] = $sv;
                    }
                }
                if (array_key_exists('submission_status', $body)) {
                    $sv = field($body, 'submission_status');
                    if (!in_array($sv, ['locked', 'eligible', 'submitted', 'complete'], true)) { json(['error' => 'Invalid submission status.'], 422); }
                    $fields[] = 'submission_status = ?'; $values[] = $sv;
                }
            }
            if (!$fields) {
                json(['error' => 'No changes provided.'], 422);
            }
            $fields[] = 'updated_at = NOW()';
            $values[] = (int) $student['id'];
            db()->prepare('UPDATE new_school_students SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($values);
            $fresh = new_school_refresh_student_status((int) $student['id']) ?: new_school_fetch_student_by_id((int) $student['id']);
            json(['message' => 'Student updated.', 'student' => $fresh]);
        }

        case $method === 'DELETE' && preg_match('#^new-school/manage/student/(\d+)$#', $route, $m) === 1: {
            $user = ns_manage_require_user();
            $scope = ns_manage_scope($user);
            if (!ns_manage_can_write_entity($scope, 'student', 'delete')) {
                json(['error' => 'Your role cannot delete student records.'], 403);
            }
            $student = new_school_fetch_student_by_id((int) $m[1]);
            if (!$student) {
                json(['error' => 'Student not found.'], 404);
            }
            ns_manage_assert_student($student, $scope);
            db()->prepare('DELETE FROM new_school_students WHERE id = ?')->execute([(int) $student['id']]);
            db()->prepare('DELETE FROM users WHERE id = ? AND role = "student"')->execute([(int) $student['user_id']]);
            json(['message' => 'Student deleted.']);
        }

        // ----- Teachers -----
        case $key === 'POST new-school/manage/teacher': {
            $user = ns_manage_require_user();
            $scope = ns_manage_scope($user);
            if (!ns_manage_can_write_entity($scope, 'teacher', 'create')) {
                json(['error' => 'Only a principal or admin can add teachers.'], 403);
            }
            $name = field($body, 'teacher_full_name') ?: field($body, 'full_name');
            $email = require_email(field($body, 'school_email') ?: field($body, 'email'));
            if ($name === '' || $email === '') {
                json(['error' => 'Teacher name and email are required.'], 422);
            }
            $schoolId = $scope['school_id'] ?? 0;
            if (!$schoolId) {
                $schoolId = (int) ($body['school_id'] ?? 0);
                if (!$schoolId) { json(['error' => 'school_id is required.'], 422); }
            }
            $password = field($body, 'password') ?: ns_manage_random_password();
            $account = new_school_upsert_user_account($name, $email, $password, 'teacher');
            $pdo = db();
            $pdo->prepare('UPDATE users SET approval_status = "approved" WHERE id = ?')->execute([(int) $account['id']]);
            $exists = $pdo->prepare('SELECT id FROM new_school_teachers WHERE user_id = ? LIMIT 1');
            $exists->execute([(int) $account['id']]);
            if ($exists->fetch()) {
                json(['error' => 'A teacher record already exists for this email.'], 409);
            }
            $insert = $pdo->prepare(
                'INSERT INTO new_school_teachers (user_id, school_id, teacher_full_name, school_email, phone_number, role_department, grade_level_supported, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, "approved")'
            );
            $insert->execute([
                (int) $account['id'], $schoolId, $name, $email, field($body, 'phone_number'),
                field($body, 'role_department') ?: 'Teacher', field($body, 'grade_level_supported') ?: '9-12',
            ]);
            json(['message' => 'Teacher created.', 'teacher' => new_school_fetch_teacher_by_id((int) $pdo->lastInsertId())], 201);
        }

        case $method === 'PUT' && preg_match('#^new-school/manage/teacher/(\d+)$#', $route, $m) === 1: {
            $user = ns_manage_require_user();
            $scope = ns_manage_scope($user);
            if (!ns_manage_can_write_entity($scope, 'teacher', 'update')) {
                json(['error' => 'Only a principal or admin can edit teachers.'], 403);
            }
            $teacher = new_school_fetch_teacher_by_id((int) $m[1]);
            if (!$teacher) {
                json(['error' => 'Teacher not found.'], 404);
            }
            $scopeSchool = $scope['school_id'] ?? null;
            if ($scopeSchool !== null && (int) $teacher['school_id'] !== (int) $scopeSchool) {
                json(['error' => 'This record does not belong to your school.'], 403);
            }
            $fields = [];
            $values = [];
            $map = ['teacher_full_name' => 'teacher_full_name', 'school_email' => 'school_email', 'phone_number' => 'phone_number', 'role_department' => 'role_department', 'grade_level_supported' => 'grade_level_supported'];
            foreach ($map as $bk => $col) {
                if (array_key_exists($bk, $body)) { $fields[] = "$col = ?"; $values[] = field($body, $bk); }
            }
            if (array_key_exists('status', $body)) {
                $sv = field($body, 'status');
                if (!in_array($sv, ['registered', 'approved', 'rejected'], true)) { json(['error' => 'Invalid status.'], 422); }
                $fields[] = 'status = ?'; $values[] = $sv;
            }
            if (!$fields) {
                json(['error' => 'No changes provided.'], 422);
            }
            $fields[] = 'updated_at = NOW()';
            $values[] = (int) $teacher['id'];
            db()->prepare('UPDATE new_school_teachers SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($values);
            if (array_key_exists('status', $body)) {
                db()->prepare('UPDATE users SET approval_status = ? WHERE id = ?')->execute([field($body, 'status'), (int) $teacher['user_id']]);
            }
            json(['message' => 'Teacher updated.', 'teacher' => new_school_fetch_teacher_by_id((int) $teacher['id'])]);
        }

        case $method === 'DELETE' && preg_match('#^new-school/manage/teacher/(\d+)$#', $route, $m) === 1: {
            $user = ns_manage_require_user();
            $scope = ns_manage_scope($user);
            if (!ns_manage_can_write_entity($scope, 'teacher', 'delete')) {
                json(['error' => 'Only a principal or admin can remove teachers.'], 403);
            }
            $teacher = new_school_fetch_teacher_by_id((int) $m[1]);
            if (!$teacher) {
                json(['error' => 'Teacher not found.'], 404);
            }
            $scopeSchool = $scope['school_id'] ?? null;
            if ($scopeSchool !== null && (int) $teacher['school_id'] !== (int) $scopeSchool) {
                json(['error' => 'This record does not belong to your school.'], 403);
            }
            db()->prepare('DELETE FROM new_school_teachers WHERE id = ?')->execute([(int) $teacher['id']]);
            db()->prepare('DELETE FROM users WHERE id = ? AND role = "teacher"')->execute([(int) $teacher['user_id']]);
            json(['message' => 'Teacher deleted.']);
        }

        // ----- Interviews (business) -----
        case $key === 'POST new-school/manage/interview': {
            $user = ns_manage_require_user();
            $scope = ns_manage_scope($user);
            if (!ns_manage_can_write_entity($scope, 'interview', 'create')) {
                json(['error' => 'Interview content is managed by admin only.'], 403);
            }
            $studentId = (int) ($body['student_id'] ?? 0);
            $student = $studentId ? new_school_fetch_student_by_id($studentId) : null;
            if (!$student) {
                json(['error' => 'Select a valid student.'], 422);
            }
            ns_manage_assert_student($student, $scope);
            $visit = ((int) ($body['visit_number'] ?? 0)) ?: 1;
            $pdo = db();
            $dup = $pdo->prepare('SELECT id FROM new_school_business_interviews WHERE student_id = ? AND visit_number = ?');
            $dup->execute([$studentId, $visit]);
            if ($dup->fetch()) {
                json(['error' => 'A visit with this number already exists for the student.'], 409);
            }
            $insert = $pdo->prepare(
                'INSERT INTO new_school_business_interviews (student_id, visit_number, business_name, owner_name, business_phone, business_address, business_category, date_of_visit, has_website, has_google_profile, uses_social_media, uses_digital_signage, offers_rewards, has_online_ordering, has_delivery_options, main_challenge, student_notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $insert->execute([
                $studentId, $visit, field($body, 'business_name'), field($body, 'owner_name'), field($body, 'business_phone'),
                field($body, 'business_address'), field($body, 'business_category'), field($body, 'date_of_visit') ?: date('Y-m-d'),
                ns_manage_bool($body, 'has_website'), ns_manage_bool($body, 'has_google_profile'), ns_manage_bool($body, 'uses_social_media'),
                ns_manage_bool($body, 'uses_digital_signage'), ns_manage_bool($body, 'offers_rewards'), ns_manage_bool($body, 'has_online_ordering'),
                ns_manage_bool($body, 'has_delivery_options'), field($body, 'main_challenge'), field($body, 'student_notes'),
            ]);
            $interviewId = (int) $pdo->lastInsertId();
            new_school_points_award_auto($studentId, 'interview', $interviewId);
            new_school_refresh_student_status($studentId);
            json(['message' => 'Interview created.', 'id' => $interviewId], 201);
        }

        case $method === 'PUT' && preg_match('#^new-school/manage/interview/(\d+)$#', $route, $m) === 1: {
            $user = ns_manage_require_user();
            $scope = ns_manage_scope($user);
            if (!ns_manage_can_write_entity($scope, 'interview', 'update')) {
                json(['error' => 'Interview content is managed by admin only.'], 403);
            }
            $pdo = db();
            $row = $pdo->prepare('SELECT * FROM new_school_business_interviews WHERE id = ?');
            $row->execute([(int) $m[1]]);
            $iv = $row->fetch();
            if (!$iv) {
                json(['error' => 'Interview not found.'], 404);
            }
            $student = new_school_fetch_student_by_id((int) $iv['student_id']);
            if ($student) { ns_manage_assert_student($student, $scope); }
            $fields = [];
            $values = [];
            $map = ['business_name' => 'business_name', 'owner_name' => 'owner_name', 'business_phone' => 'business_phone', 'business_address' => 'business_address', 'business_category' => 'business_category', 'main_challenge' => 'main_challenge', 'student_notes' => 'student_notes'];
            foreach ($map as $bk => $col) {
                if (array_key_exists($bk, $body)) { $fields[] = "$col = ?"; $values[] = field($body, $bk); }
            }
            if (array_key_exists('date_of_visit', $body) && field($body, 'date_of_visit') !== '') { $fields[] = 'date_of_visit = ?'; $values[] = field($body, 'date_of_visit'); }
            if (array_key_exists('visit_number', $body)) { $fields[] = 'visit_number = ?'; $values[] = (int) $body['visit_number']; }
            foreach (['has_website', 'has_google_profile', 'uses_social_media', 'uses_digital_signage', 'offers_rewards', 'has_online_ordering', 'has_delivery_options'] as $bk) {
                if (array_key_exists($bk, $body)) { $fields[] = "$bk = ?"; $values[] = ns_manage_bool($body, $bk); }
            }
            if (!$fields) {
                json(['error' => 'No changes provided.'], 422);
            }
            $fields[] = 'updated_at = NOW()';
            $values[] = (int) $iv['id'];
            $pdo->prepare('UPDATE new_school_business_interviews SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($values);
            json(['message' => 'Interview updated.']);
        }

        case $method === 'DELETE' && preg_match('#^new-school/manage/interview/(\d+)$#', $route, $m) === 1: {
            $user = ns_manage_require_user();
            $scope = ns_manage_scope($user);
            if (!ns_manage_can_write_entity($scope, 'interview', 'delete')) {
                json(['error' => 'Interview content is managed by admin only.'], 403);
            }
            $pdo = db();
            $row = $pdo->prepare('SELECT * FROM new_school_business_interviews WHERE id = ?');
            $row->execute([(int) $m[1]]);
            $iv = $row->fetch();
            if (!$iv) {
                json(['error' => 'Interview not found.'], 404);
            }
            $student = new_school_fetch_student_by_id((int) $iv['student_id']);
            if ($student) { ns_manage_assert_student($student, $scope); }
            $pdo->prepare('DELETE FROM new_school_business_interviews WHERE id = ?')->execute([(int) $iv['id']]);
            new_school_refresh_student_status((int) $iv['student_id']);
            json(['message' => 'Interview deleted.']);
        }

        // ----- Approvals -----
        case $key === 'POST new-school/manage/approval': {
            $user = ns_manage_require_user();
            $scope = ns_manage_scope($user);
            if (!ns_manage_can_write_entity($scope, 'approval', 'create')) {
                json(['error' => 'Your role cannot record approvals.'], 403);
            }
            $studentId = (int) ($body['student_id'] ?? 0);
            $student = $studentId ? new_school_fetch_student_by_id($studentId) : null;
            if (!$student) {
                json(['error' => 'Select a valid student.'], 422);
            }
            ns_manage_assert_student($student, $scope);
            $type = field($body, 'approval_type');
            if (!in_array($type, ['school', 'teacher'], true)) {
                json(['error' => 'Invalid approval type.'], 422);
            }
            $status = field($body, 'status') ?: 'approved';
            if (!in_array($status, ['pending', 'approved', 'rejected'], true)) {
                json(['error' => 'Invalid status.'], 422);
            }
            // Teacher approval is the student's only gate — no parent/school ordering.
            $pdo = db();
            $approvedAt = in_array($status, ['approved', 'rejected'], true) ? date('Y-m-d H:i:s') : null;
            $stmt = $pdo->prepare(
                'INSERT INTO new_school_approvals (student_id, approval_type, reviewer_user_id, reviewer_name, reviewer_email, reviewer_role, status, notes, digital_signature, approved_at, recorded_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
                 ON DUPLICATE KEY UPDATE reviewer_user_id=VALUES(reviewer_user_id), reviewer_name=VALUES(reviewer_name), reviewer_email=VALUES(reviewer_email), reviewer_role=VALUES(reviewer_role), status=VALUES(status), notes=VALUES(notes), digital_signature=VALUES(digital_signature), approved_at=VALUES(approved_at), updated_at=NOW()'
            );
            $stmt->execute([
                $studentId, $type, (int) $user['id'], field($body, 'reviewer_name') ?: (string) $user['full_name'],
                field($body, 'reviewer_email') ?: (string) $user['email'], field($body, 'reviewer_role') ?: ucfirst($type),
                $status, field($body, 'notes') ?: null, field($body, 'digital_signature') ?: (string) $user['full_name'], $approvedAt,
            ]);
            $col = $type === 'school' ? 'school_approval_status' : 'teacher_approval_status';
            $pdo->prepare("UPDATE new_school_students SET $col = ?, updated_at = NOW() WHERE id = ?")->execute([$status, $studentId]);
            // Teacher approval activates (or rejects) the student's account login.
            if ($type === 'teacher') {
                $userStatus = $status === 'approved' ? 'approved' : ($status === 'rejected' ? 'rejected' : 'pending');
                $pdo->prepare('UPDATE users SET approval_status = ?, approval_reviewed_by_user_id = ?, approval_reviewed_at = NOW(), updated_at = NOW() WHERE id = ?')
                    ->execute([$userStatus, (int) $user['id'], (int) $student['user_id']]);
            }
            new_school_refresh_student_status($studentId);
            json(['message' => 'Approval saved.'], 201);
        }

        case $method === 'PUT' && preg_match('#^new-school/manage/approval/(\d+)$#', $route, $m) === 1: {
            $user = ns_manage_require_user();
            $scope = ns_manage_scope($user);
            if (!ns_manage_can_write_entity($scope, 'approval', 'update')) {
                json(['error' => 'Your role cannot edit approvals.'], 403);
            }
            $pdo = db();
            $row = $pdo->prepare('SELECT * FROM new_school_approvals WHERE id = ?');
            $row->execute([(int) $m[1]]);
            $ap = $row->fetch();
            if (!$ap) {
                json(['error' => 'Approval not found.'], 404);
            }
            $student = new_school_fetch_student_by_id((int) $ap['student_id']);
            if ($student) { ns_manage_assert_student($student, $scope); }
            $status = array_key_exists('status', $body) ? field($body, 'status') : (string) $ap['status'];
            if (!in_array($status, ['pending', 'approved', 'rejected'], true)) {
                json(['error' => 'Invalid status.'], 422);
            }
            $approvedAt = in_array($status, ['approved', 'rejected'], true) ? date('Y-m-d H:i:s') : null;
            $pdo->prepare('UPDATE new_school_approvals SET status = ?, notes = ?, reviewer_name = ?, digital_signature = ?, approved_at = ?, updated_at = NOW() WHERE id = ?')
                ->execute([
                    $status,
                    array_key_exists('notes', $body) ? field($body, 'notes') : $ap['notes'],
                    field($body, 'reviewer_name') ?: $ap['reviewer_name'],
                    field($body, 'digital_signature') ?: $ap['digital_signature'],
                    $approvedAt, (int) $ap['id'],
                ]);
            $col = $ap['approval_type'] === 'school' ? 'school_approval_status' : 'teacher_approval_status';
            $pdo->prepare("UPDATE new_school_students SET $col = ?, updated_at = NOW() WHERE id = ?")->execute([$status, (int) $ap['student_id']]);
            new_school_refresh_student_status((int) $ap['student_id']);
            json(['message' => 'Approval updated.']);
        }

        case $method === 'DELETE' && preg_match('#^new-school/manage/approval/(\d+)$#', $route, $m) === 1: {
            $user = ns_manage_require_user();
            $scope = ns_manage_scope($user);
            if (!ns_manage_can_write_entity($scope, 'approval', 'delete')) {
                json(['error' => 'Your role cannot delete approvals.'], 403);
            }
            $pdo = db();
            $row = $pdo->prepare('SELECT * FROM new_school_approvals WHERE id = ?');
            $row->execute([(int) $m[1]]);
            $ap = $row->fetch();
            if (!$ap) {
                json(['error' => 'Approval not found.'], 404);
            }
            $student = new_school_fetch_student_by_id((int) $ap['student_id']);
            if ($student) { ns_manage_assert_student($student, $scope); }
            $pdo->prepare('DELETE FROM new_school_approvals WHERE id = ?')->execute([(int) $ap['id']]);
            $col = $ap['approval_type'] === 'school' ? 'school_approval_status' : 'teacher_approval_status';
            $pdo->prepare("UPDATE new_school_students SET $col = 'pending', updated_at = NOW() WHERE id = ?")->execute([(int) $ap['student_id']]);
            new_school_refresh_student_status((int) $ap['student_id']);
            json(['message' => 'Approval deleted.']);
        }

        // ----- Submissions (projects) -----
        case $key === 'POST new-school/manage/submission': {
            $user = ns_manage_require_user();
            $scope = ns_manage_scope($user);
            if (!ns_manage_can_write_entity($scope, 'submission', 'create')) {
                json(['error' => 'Submission content is managed by admin only.'], 403);
            }
            $studentId = (int) ($body['student_id'] ?? 0);
            $student = $studentId ? new_school_fetch_student_by_id($studentId) : null;
            if (!$student) {
                json(['error' => 'Select a valid student.'], 422);
            }
            ns_manage_assert_student($student, $scope);
            $pdo = db();
            $exists = $pdo->prepare('SELECT id FROM new_school_submissions WHERE student_id = ?');
            $exists->execute([$studentId]);
            if ($exists->fetch()) {
                json(['error' => 'A submission already exists for this student.'], 409);
            }
            $status = field($body, 'status') ?: 'submitted';
            if (!in_array($status, ['draft', 'submitted', 'approved', 'rejected', 'winner'], true)) {
                json(['error' => 'Invalid status.'], 422);
            }
            $insert = $pdo->prepare(
                'INSERT INTO new_school_submissions (student_id, source_business_id, problem_identified, why_it_matters, proposed_solution, how_it_helps, expected_impact, video_url, written_url, submission_date, status, score, rank_position)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?)'
            );
            $insert->execute([
                $studentId, ((int) ($body['source_business_id'] ?? 0)) ?: null,
                field($body, 'problem_identified'), field($body, 'why_it_matters'), field($body, 'proposed_solution'),
                field($body, 'how_it_helps'), field($body, 'expected_impact'),
                field($body, 'video_url') ?: null, field($body, 'written_url') ?: null,
                $status, (($body['score'] ?? '') !== '' ? (float) $body['score'] : null), ((int) ($body['rank_position'] ?? 0)) ?: null,
            ]);
            $submissionId = (int) $pdo->lastInsertId();
            new_school_points_award_auto($studentId, 'project', $submissionId);
            new_school_refresh_student_status($studentId);
            json(['message' => 'Submission created.', 'id' => $submissionId], 201);
        }

        case $method === 'PUT' && preg_match('#^new-school/manage/submission/(\d+)$#', $route, $m) === 1: {
            $user = ns_manage_require_user();
            $scope = ns_manage_scope($user);
            if (!ns_manage_can_write_entity($scope, 'submission', 'update')) {
                json(['error' => 'Submission content is managed by admin only.'], 403);
            }
            $pdo = db();
            $row = $pdo->prepare('SELECT * FROM new_school_submissions WHERE id = ?');
            $row->execute([(int) $m[1]]);
            $sub = $row->fetch();
            if (!$sub) {
                json(['error' => 'Submission not found.'], 404);
            }
            $student = new_school_fetch_student_by_id((int) $sub['student_id']);
            if ($student) { ns_manage_assert_student($student, $scope); }
            $fields = [];
            $values = [];
            $map = ['problem_identified' => 'problem_identified', 'why_it_matters' => 'why_it_matters', 'proposed_solution' => 'proposed_solution', 'how_it_helps' => 'how_it_helps', 'expected_impact' => 'expected_impact', 'video_url' => 'video_url', 'written_url' => 'written_url', 'reviewer_notes' => 'reviewer_notes'];
            foreach ($map as $bk => $col) {
                if (array_key_exists($bk, $body)) { $fields[] = "$col = ?"; $values[] = field($body, $bk); }
            }
            if (array_key_exists('status', $body)) {
                $sv = field($body, 'status');
                if (!in_array($sv, ['draft', 'submitted', 'approved', 'rejected', 'winner'], true)) { json(['error' => 'Invalid status.'], 422); }
                $fields[] = 'status = ?'; $values[] = $sv;
            }
            if (array_key_exists('score', $body)) { $fields[] = 'score = ?'; $values[] = (($body['score'] !== '' && $body['score'] !== null) ? (float) $body['score'] : null); }
            if (array_key_exists('rank_position', $body)) { $fields[] = 'rank_position = ?'; $values[] = ((int) ($body['rank_position'] ?? 0)) ?: null; }
            if (array_key_exists('source_business_id', $body)) { $fields[] = 'source_business_id = ?'; $values[] = ((int) ($body['source_business_id'] ?? 0)) ?: null; }
            if (!$fields) {
                json(['error' => 'No changes provided.'], 422);
            }
            $fields[] = 'updated_at = NOW()';
            $values[] = (int) $sub['id'];
            $pdo->prepare('UPDATE new_school_submissions SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($values);
            new_school_refresh_student_status((int) $sub['student_id']);
            json(['message' => 'Submission updated.']);
        }

        case $method === 'DELETE' && preg_match('#^new-school/manage/submission/(\d+)$#', $route, $m) === 1: {
            $user = ns_manage_require_user();
            $scope = ns_manage_scope($user);
            if (!ns_manage_can_write_entity($scope, 'submission', 'delete')) {
                json(['error' => 'Submission content is managed by admin only.'], 403);
            }
            $pdo = db();
            $row = $pdo->prepare('SELECT * FROM new_school_submissions WHERE id = ?');
            $row->execute([(int) $m[1]]);
            $sub = $row->fetch();
            if (!$sub) {
                json(['error' => 'Submission not found.'], 404);
            }
            $student = new_school_fetch_student_by_id((int) $sub['student_id']);
            if ($student) { ns_manage_assert_student($student, $scope); }
            $pdo->prepare('DELETE FROM new_school_submissions WHERE id = ?')->execute([(int) $sub['id']]);
            new_school_refresh_student_status((int) $sub['student_id']);
            json(['message' => 'Submission deleted.']);
        }

        default:
            return false;
    }
}


