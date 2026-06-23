<?php

declare(strict_types=1);

require_once __DIR__ . '/new_school_seed_demo.php';

$pdo = db();

$fail = static function (string $message): void {
    fwrite(STDERR, $message . PHP_EOL);
    exit(1);
};

$assert = static function (bool $condition, string $message) use ($fail): void {
    if (!$condition) {
        $fail($message);
    }
};

$fetchOne = static function (PDO $pdo, string $sql, array $params = []) use ($fail): array {
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $row = $stmt->fetch();
    if (!$row) {
        $fail('Missing expected row for query: ' . $sql);
    }
    return $row;
};

$fetchUser = static function (PDO $pdo, string $email) use ($fetchOne): array {
    return $fetchOne($pdo, 'SELECT * FROM users WHERE email = ? LIMIT 1', [strtolower($email)]);
};

$countRows = static function (PDO $pdo, string $sql, array $params = []) use ($fetchOne): int {
    $row = $fetchOne($pdo, $sql, $params);
    return (int) array_values($row)[0];
};

$findLeaderboardRow = static function (array $rows, string $label) use ($fail): array {
    foreach ($rows as $row) {
        if ((string) ($row['label'] ?? '') === $label) {
            return $row;
        }
    }

    $fail('Missing leaderboard row: ' . $label);
};

// Create the points ledger + terms audit table BEFORE the test transaction: CREATE TABLE
// implicitly commits, which would otherwise break this test's rollback isolation.
new_school_points_ensure_schema();
terms_acceptances_ensure_schema();

$startedTransaction = false;
if (!$pdo->inTransaction()) {
    $pdo->beginTransaction();
    $startedTransaction = true;
}

try {
    $summary = new_school_demo_seed($pdo);

    $assert(count($summary['students'] ?? []) === 3, 'Demo summary should contain three students.');
    $assert((int) ($summary['approval_rows'] ?? 0) === 6, 'Demo summary should contain six approvals.');
    $assert((int) ($summary['business_count'] ?? 0) === 22, 'Demo summary should contain 22 business interviews.');
    $assert((int) ($summary['notification_count'] ?? 0) === 10, 'Demo summary should contain 10 notifications.');

    $studentUsers = [
        'student1' => $fetchUser($pdo, 'newschool.student.alpha@frantzcoutard.test'),
        'student2' => $fetchUser($pdo, 'newschool.student.beta@frantzcoutard.test'),
        'student3' => $fetchUser($pdo, 'newschool.student.gamma@frantzcoutard.test'),
    ];
    $parentUsers = [
        'student1' => $fetchUser($pdo, 'newschool.parent.alpha@frantzcoutard.test'),
        'student2' => $fetchUser($pdo, 'newschool.parent.beta@frantzcoutard.test'),
        'student3' => $fetchUser($pdo, 'newschool.parent.gamma@frantzcoutard.test'),
    ];
    $schoolUser = $fetchUser($pdo, 'newschool.school@frantzcoutard.test');
    $teacherUser = $fetchUser($pdo, 'newschool.teacher@frantzcoutard.test');
    $adminUser = $fetchUser($pdo, 'newschool.admin@frantzcoutard.test');

    $students = [
        'student1' => new_school_fetch_student_by_user_id((int) $studentUsers['student1']['id']),
        'student2' => new_school_fetch_student_by_user_id((int) $studentUsers['student2']['id']),
        'student3' => new_school_fetch_student_by_user_id((int) $studentUsers['student3']['id']),
    ];

    foreach ($students as $key => $student) {
        $assert($student !== null, 'Missing seeded student row: ' . $key);
    }

    $assert(new_school_student_interview_count((int) $students['student1']['id']) === 10, 'Student 1 should have 10 business interviews.');
    $assert(new_school_student_interview_count((int) $students['student2']['id']) === 10, 'Student 2 should have 10 business interviews.');
    $assert(new_school_student_interview_count((int) $students['student3']['id']) === 2, 'Student 3 should have 2 business interviews.');

    $assert(($students['student1']['submission_status'] ?? '') === 'complete', 'Student 1 should be marked complete.');
    $assert(($students['student1']['overall_status'] ?? '') === 'submission_complete', 'Student 1 overall status should be submission_complete.');
    $assert(($students['student2']['submission_status'] ?? '') === 'eligible', 'Student 2 should be eligible to submit.');
    $assert(($students['student2']['overall_status'] ?? '') === 'eligible_to_submit', 'Student 2 overall status should be eligible_to_submit.');
    $assert(($students['student3']['submission_status'] ?? '') === 'locked', 'Student 3 should remain locked.');
    $assert(($students['student3']['overall_status'] ?? '') === 'parent_consent_pending', 'Student 3 overall status should be parent_consent_pending.');

    $assert(new_school_submission_is_locked($students['student1'], 10) === false, 'Student 1 should not be locked from submission.');
    $assert(new_school_submission_is_locked($students['student2'], 10) === false, 'Student 2 should not be locked from submission.');
    $assert(new_school_submission_is_locked($students['student3'], 2) === true, 'Student 3 should still be locked from submission.');

    $leaderboards = new_school_public_leaderboards();
    $schoolRow = $findLeaderboardRow($leaderboards['schools'] ?? [], 'New School Academy');
    $teacherRow = $findLeaderboardRow($leaderboards['teachers'] ?? [], 'Coach Rivera');
    $studentRow1 = $findLeaderboardRow($leaderboards['students'] ?? [], 'Ariana Carter');
    $studentRow2 = $findLeaderboardRow($leaderboards['students'] ?? [], 'Jayden Brooks');
    $studentRow3 = $findLeaderboardRow($leaderboards['students'] ?? [], 'Maya Patel');

    $assert((int) ($schoolRow['students'] ?? 0) === 3, 'School leaderboard should report three demo students.');
    $assert((int) ($schoolRow['parent_approved'] ?? 0) === 2, 'School leaderboard should report two parent approvals.');
    $assert((int) ($schoolRow['school_approved'] ?? 0) === 2, 'School leaderboard should report two school approvals.');
    $assert((int) ($schoolRow['teacher_approved'] ?? 0) === 2, 'School leaderboard should report two teacher approvals.');
    $assert((int) ($schoolRow['submissions'] ?? 0) === 1, 'School leaderboard should report one submission.');

    $assert((int) ($teacherRow['students'] ?? 0) === 3, 'Teacher leaderboard should report three demo students.');
    $assert((int) ($teacherRow['parent_approved'] ?? 0) === 2, 'Teacher leaderboard should report two parent approvals.');
    $assert((int) ($teacherRow['school_approved'] ?? 0) === 2, 'Teacher leaderboard should report two school approvals.');
    $assert((int) ($teacherRow['teacher_approved'] ?? 0) === 2, 'Teacher leaderboard should report two teacher approvals.');
    $assert((int) ($teacherRow['submissions'] ?? 0) === 1, 'Teacher leaderboard should report one submission.');

    $assert((int) ($studentRow1['interview_count'] ?? 0) === 10, 'Ariana Carter should have 10 interviews on the student leaderboard.');
    $assert((int) ($studentRow1['has_submission'] ?? 0) === 1, 'Ariana Carter should have one submitted project.');
    $assert((int) ($studentRow2['interview_count'] ?? 0) === 10, 'Jayden Brooks should have 10 interviews on the student leaderboard.');
    $assert((int) ($studentRow2['has_submission'] ?? 0) === 0, 'Jayden Brooks should not yet have a submitted project.');
    $assert((int) ($studentRow3['interview_count'] ?? 0) === 2, 'Maya Patel should have 2 interviews on the student leaderboard.');
    $assert((int) ($studentRow3['has_submission'] ?? 0) === 0, 'Maya Patel should not yet have a submitted project.');

    $studentIds = [
        (int) $students['student1']['id'],
        (int) $students['student2']['id'],
        (int) $students['student3']['id'],
    ];

    $studentIdList = implode(',', array_fill(0, count($studentIds), '?'));
    $totalNotificationCount = $countRows(
        $pdo,
        'SELECT COUNT(*) AS total
         FROM new_school_notifications
         WHERE student_id IN (' . $studentIdList . ')',
        $studentIds
    );
    $assert($totalNotificationCount === 10, 'Demo students should have exactly 10 notifications in total.');

    $notificationCounts = $pdo->prepare(
        'SELECT recipient_role, COUNT(*) AS total
         FROM new_school_notifications
         WHERE student_id IN (' . $studentIdList . ')
         GROUP BY recipient_role'
    );
    $notificationCounts->execute($studentIds);
    $notificationMap = [];
    foreach ($notificationCounts->fetchAll() as $row) {
        $notificationMap[(string) $row['recipient_role']] = (int) $row['total'];
    }

    $assert(($notificationMap['student'] ?? 0) === 4, 'Student notifications should total four records.');
    $assert(($notificationMap['parent'] ?? 0) === 3, 'Parent notifications should total three records.');
    $assert(($notificationMap['teacher'] ?? 0) === 1, 'Teacher notifications should total one record.');
    $assert(($notificationMap['school'] ?? 0) === 1, 'School notifications should total one record.');
    $assert(($notificationMap['admin'] ?? 0) === 1, 'Admin notifications should total one record.');

    $student1StudentNotification = $fetchOne(
        $pdo,
        'SELECT * FROM new_school_notifications WHERE student_id = ? AND recipient_role = "student" ORDER BY id ASC LIMIT 1',
        [(int) $students['student1']['id']]
    );
    $student1ParentNotification = $fetchOne(
        $pdo,
        'SELECT * FROM new_school_notifications WHERE student_id = ? AND recipient_role = "parent" ORDER BY id ASC LIMIT 1',
        [(int) $students['student1']['id']]
    );
    $teacherNotification = $fetchOne(
        $pdo,
        'SELECT * FROM new_school_notifications WHERE student_id = ? AND recipient_role = "teacher" ORDER BY id ASC LIMIT 1',
        [(int) $students['student1']['id']]
    );
    $schoolNotification = $fetchOne(
        $pdo,
        'SELECT * FROM new_school_notifications WHERE student_id = ? AND recipient_role = "school" ORDER BY id ASC LIMIT 1',
        [(int) $students['student1']['id']]
    );
    $adminNotification = $fetchOne(
        $pdo,
        'SELECT * FROM new_school_notifications WHERE student_id = ? AND recipient_role = "admin" ORDER BY id ASC LIMIT 1',
        [(int) $students['student1']['id']]
    );

    $assert(new_school_notification_can_access($studentUsers['student1'], $student1StudentNotification) === true, 'Student should access their own student notification.');
    $assert(new_school_notification_can_access($studentUsers['student1'], $student1ParentNotification) === false, 'Student should not access parent-only notifications.');
    $assert(new_school_notification_can_access($parentUsers['student1'], $student1ParentNotification) === true, 'Parent should access their child notification.');
    $assert(new_school_notification_can_access($parentUsers['student1'], $student1StudentNotification) === false, 'Parent should not access student-only notifications.');
    $assert(new_school_notification_can_access($teacherUser, $teacherNotification) === true, 'Teacher should access teacher notifications for their students.');
    $assert(new_school_notification_can_access($schoolUser, $schoolNotification) === true, 'School user should access school notifications for their students.');
    $assert(new_school_notification_can_access($adminUser, $adminNotification) === true, 'Admin should access all notifications.');

    $publicSummary = new_school_public_summary();
    foreach (['students', 'parents', 'schools', 'teachers', 'businesses', 'submissions', 'winners'] as $key) {
        $assert(isset($publicSummary[$key]), 'Public summary is missing key: ' . $key);
        $assert((int) $publicSummary[$key] >= 0, 'Public summary contains an invalid count for: ' . $key);
    }
    $assert((int) ($publicSummary['students'] ?? 0) >= 3, 'Public summary should include at least the demo students.');
    $assert((int) ($publicSummary['parents'] ?? 0) >= 3, 'Public summary should include at least the demo parents.');
    $assert((int) ($publicSummary['schools'] ?? 0) >= 1, 'Public summary should include at least the demo school.');
    $assert((int) ($publicSummary['teachers'] ?? 0) >= 1, 'Public summary should include at least the demo teacher.');

    // ---- Data isolation: role-based redaction + permission matrix ----
    require_once __DIR__ . '/../api/new_school_routes.php';

    $sampleBusiness = [
        'id' => 1, 'student_id' => 2, 'visit_number' => 3, 'business_name' => 'Cafe', 'business_category' => 'Food',
        'owner_name' => 'Jane', 'business_phone' => '555', 'business_address' => 'Main St',
        'main_challenge' => 'secret challenge', 'student_notes' => 'secret notes',
        'student_name' => 'Alpha', 'participant_id' => 'P1', 'student_email' => 'alpha@example.test',
    ];
    $sampleSubmission = [
        'id' => 1, 'student_id' => 2, 'status' => 'approved', 'score' => 90, 'rank_position' => 1,
        'problem_identified' => 'secret problem', 'proposed_solution' => 'secret solution',
        'why_it_matters' => 'x', 'how_it_helps' => 'y', 'expected_impact' => 'z',
        'video_url' => 'http://v', 'written_url' => 'http://w', 'reviewer_notes' => 'rn',
        'student_name' => 'Alpha', 'student_email' => 'alpha@example.test',
    ];
    $sampleStudent = [
        'id' => 2, 'full_name' => 'Alpha', 'participant_id' => 'P1', 'interview_count' => 5, 'has_submission' => 1,
        'submission_status' => 'submitted', 'email' => 'alpha@example.test', 'home_address' => '1 Main',
        'parent_name' => 'Mom', 'parent_phone' => '555', 'parent_email' => 'mom@example.test', 'phone_number' => '999',
    ];

    // Teacher view: no interview/submission content, no student PII, but counts kept.
    $teacherPayload = new_school_redact_dashboard([
        'businesses' => [$sampleBusiness],
        'submissions' => [$sampleSubmission],
        'students' => [$sampleStudent],
        'rankings' => ['students' => [$sampleStudent]],
        'parent' => ['name' => 'Mom'],
    ], ['kind' => 'teacher']);
    foreach (['owner_name', 'business_phone', 'business_address', 'main_challenge', 'student_notes', 'student_email'] as $k) {
        $assert(!array_key_exists($k, $teacherPayload['businesses'][0]), "Teacher must not see interview key: $k");
    }
    foreach (['problem_identified', 'proposed_solution', 'why_it_matters', 'how_it_helps', 'expected_impact', 'video_url', 'written_url', 'reviewer_notes'] as $k) {
        $assert(!array_key_exists($k, $teacherPayload['submissions'][0]), "Teacher must not see submission key: $k");
    }
    $assert((int) ($teacherPayload['submissions'][0]['score'] ?? 0) === 90, 'Teacher should still see submission score.');
    foreach (['email', 'home_address', 'parent_name', 'parent_phone', 'parent_email', 'phone_number'] as $k) {
        $assert(!array_key_exists($k, $teacherPayload['students'][0]), "Teacher must not see student PII: $k");
        $assert(!array_key_exists($k, $teacherPayload['rankings']['students'][0]), "Teacher must not see PII in rankings: $k");
    }
    $assert((int) ($teacherPayload['students'][0]['interview_count'] ?? 0) === 5, 'Teacher should see interview_count.');
    $assert((int) ($teacherPayload['students'][0]['has_submission'] ?? 0) === 1, 'Teacher should see has_submission.');
    $assert(!array_key_exists('parent', $teacherPayload), 'Teacher payload must not include parent block.');

    // School view: content stripped, but full roster (PII) kept.
    $schoolPayload = new_school_redact_dashboard([
        'businesses' => [$sampleBusiness], 'submissions' => [$sampleSubmission], 'students' => [$sampleStudent],
    ], ['kind' => 'school']);
    $assert(!array_key_exists('main_challenge', $schoolPayload['businesses'][0]), 'School must not see interview content.');
    $assert(!array_key_exists('problem_identified', $schoolPayload['submissions'][0]), 'School must not see submission content.');
    $assert(array_key_exists('home_address', $schoolPayload['students'][0]), 'School keeps full student roster (incl. PII).');

    // Admin view: untouched.
    $adminPayload = new_school_redact_dashboard([
        'businesses' => [$sampleBusiness], 'submissions' => [$sampleSubmission],
    ], ['kind' => 'admin']);
    $assert(array_key_exists('main_challenge', $adminPayload['businesses'][0]), 'Admin keeps interview content.');
    $assert(array_key_exists('problem_identified', $adminPayload['submissions'][0]), 'Admin keeps submission content.');

    // Default-deny: an unknown role must be at least as restricted as teacher.
    $unknownPayload = new_school_redact_dashboard([
        'businesses' => [$sampleBusiness], 'submissions' => [$sampleSubmission], 'students' => [$sampleStudent],
    ], ['kind' => 'mystery']);
    $assert(!array_key_exists('main_challenge', $unknownPayload['businesses'][0]), 'Unknown role must not see interview content (default-deny).');
    $assert(!array_key_exists('home_address', $unknownPayload['students'][0]), 'Unknown role must not see student PII (default-deny).');

    // Single-student context (GET businesses drill-down) redaction for teacher.
    $teacherCtx = new_school_redact_student_context([
        'student' => $sampleStudent,
        'interviews' => [$sampleBusiness],
        'submission' => $sampleSubmission,
        'parent' => ['name' => 'Mom'],
        'rankings' => ['school' => ['leaderboard' => [$sampleStudent]], 'teacher' => ['leaderboard' => [$sampleStudent]]],
    ], ['kind' => 'teacher']);
    $assert(!array_key_exists('main_challenge', $teacherCtx['interviews'][0]), 'Teacher context must not expose interview content.');
    $assert(!array_key_exists('problem_identified', $teacherCtx['submission']), 'Teacher context must not expose submission content.');
    $assert(!array_key_exists('home_address', $teacherCtx['student']), 'Teacher context must not expose student PII.');
    $assert($teacherCtx['parent'] === null, 'Teacher context must null the parent block.');
    $assert(!array_key_exists('home_address', $teacherCtx['rankings']['school']['leaderboard'][0]), 'Teacher context must strip PII from ranking leaderboards.');

    // Permission matrix.
    $assert(ns_manage_can_write_entity(['kind' => 'teacher'], 'interview', 'create') === false, 'Teacher cannot write interviews.');
    $assert(ns_manage_can_write_entity(['kind' => 'teacher'], 'submission', 'update') === false, 'Teacher cannot write submissions.');
    $assert(ns_manage_can_write_entity(['kind' => 'teacher'], 'student', 'update') === false, 'Teacher cannot write students.');
    $assert(ns_manage_can_write_entity(['kind' => 'school'], 'interview', 'create') === false, 'School cannot write interview content.');
    $assert(ns_manage_can_write_entity(['kind' => 'school'], 'submission', 'update') === false, 'School cannot write submission content.');
    $assert(ns_manage_can_write_entity(['kind' => 'school'], 'student', 'update') === true, 'School can manage the student roster.');
    $assert(ns_manage_can_write_entity(['kind' => 'school'], 'approval', 'create') === true, 'School can record approvals.');
    $assert(ns_manage_can_write_entity(['kind' => 'admin'], 'submission', 'delete') === true, 'Admin can write everything.');
    $assert(ns_manage_can_write_entity(['kind' => 'mystery'], 'student', 'update') === false, 'Unknown role cannot write (default-deny).');

    // ---- Points engine: auto award, bonus clamp, replace-on-reapprove, ranking ----
    $pStudent = new_school_fetch_student_by_user_id((int) $studentUsers['student1']['id']);
    $assert(is_array($pStudent), 'Points test: demo student row should exist.');
    $pSid = (int) $pStudent['id'];
    $pTid = (int) ($pStudent['teacher_id'] ?? 0);
    $beforeS = new_school_points_total('student', $pSid);
    $beforeT = $pTid > 0 ? new_school_points_total('teacher', $pTid) : 0;

    // Auto: +5 student / +2 teacher per source, idempotent on repeat.
    new_school_points_award_auto($pSid, 'interview', 900001);
    new_school_points_award_auto($pSid, 'interview', 900001);
    $assert(new_school_points_total('student', $pSid) === $beforeS + 5, 'Auto interview adds exactly 5 student points (idempotent).');
    if ($pTid > 0) {
        $assert(new_school_points_total('teacher', $pTid) === $beforeT + 2, 'Auto interview adds exactly 2 teacher points (idempotent).');
    }
    new_school_points_award_auto($pSid, 'project', 900002);
    $assert(new_school_points_total('student', $pSid) === $beforeS + 10, 'Project auto adds another 5 student points.');

    // Bonus: clamp to max, then replace (not stack) on re-approve.
    new_school_points_award_bonus($pSid, 'project', 900002, 100, 100, 1);
    $assert(new_school_points_total('student', $pSid) === $beforeS + 10 + 15, 'Student bonus clamps to 15.');
    if ($pTid > 0) {
        $assert(new_school_points_total('teacher', $pTid) === $beforeT + 4 + 8, 'Teacher bonus clamps to 8.');
    }
    new_school_points_award_bonus($pSid, 'project', 900002, 4, 2, 1);
    $assert(new_school_points_total('student', $pSid) === $beforeS + 10 + 4, 'Re-approving REPLACES the student bonus (4), not stacks.');

    // Ranking reflects points.
    $rankedSample = new_school_rank_students([
        ['id' => $pSid, 'full_name' => 'Pointy', 'interview_count' => 0],
        ['id' => -777, 'full_name' => 'Zero', 'interview_count' => 0],
    ]);
    $assert((int) $rankedSample[0]['id'] === $pSid, 'Student with points ranks above a zero-points student.');
    $assert((int) ($rankedSample[0]['student_points'] ?? 0) > 0, 'Ranked student carries student_points.');

    // ---- Terms & Conditions acceptance audit ----
    $termsId = record_terms_acceptance([
        'accept_type' => 'website',
        'terms_version' => 'Interim Website Terms v1',
        'user_name' => 'Terms Tester',
        'email' => 'terms.tester@frantzcoutard.test',
        'signature_name' => 'Terms Tester',
        'document_label' => 'Terms of Use & Privacy Notice',
    ]);
    $assert($termsId > 0, 'record_terms_acceptance inserts a website acceptance row.');
    $termsRow = $fetchOne($pdo, 'SELECT * FROM terms_acceptances WHERE id = ?', [$termsId]);
    $assert($termsRow['user_name'] === 'Terms Tester', 'Acceptance stores the user name.');
    $assert($termsRow['email'] === 'terms.tester@frantzcoutard.test', 'Acceptance stores the email.');
    $assert($termsRow['accept_type'] === 'website', 'Acceptance stores the accept type.');
    $assert($termsRow['terms_version'] === 'Interim Website Terms v1', 'Acceptance stores the terms version.');
    $assert($termsRow['signature_name'] === 'Terms Tester', 'Acceptance stores the e-signature name.');
    $assert(array_key_exists('accepted_at', $termsRow), 'Acceptance stores a timestamp.');

    // Missing identity / invalid type are safe no-ops (never throw, return 0).
    $assert(record_terms_acceptance(['accept_type' => 'website', 'terms_version' => 'v', 'email' => '']) === 0, 'Acceptance with no name/email is a safe no-op.');
    $assert(record_terms_acceptance(['accept_type' => 'bogus', 'terms_version' => 'v', 'user_name' => 'X', 'email' => 'x@y.z']) === 0, 'Invalid accept_type is a safe no-op.');

    // A registration records three rows: challenge_role + general_platform + website.
    $regUserId = (int) $studentUsers['student1']['id'];
    $regEmail = 'reg.terms.' . $regUserId . '@frantzcoutard.test';
    record_registration_terms($regUserId, 'Reg Tester', $regEmail, 'student', 'Reg Tester', []);
    $regCount = $countRows($pdo, 'SELECT COUNT(*) FROM terms_acceptances WHERE email = ?', [$regEmail]);
    $assert($regCount === 3, 'A registration records exactly three acceptance rows.');
    $regTypesStmt = $pdo->prepare('SELECT accept_type FROM terms_acceptances WHERE email = ? ORDER BY accept_type');
    $regTypesStmt->execute([$regEmail]);
    $assert($regTypesStmt->fetchAll(PDO::FETCH_COLUMN) === ['challenge_role', 'general_platform', 'website'], 'Registration covers all three accept types.');

    echo json_encode([
        'status' => 'passed',
        'demo_students' => 3,
        'demo_businesses' => 22,
        'demo_notifications' => 10,
        'leaderboards' => [
            'school' => $schoolRow['label'] ?? null,
            'teacher' => $teacherRow['label'] ?? null,
        ],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . PHP_EOL;
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, 'new_school regression test failed: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}

if ($pdo->inTransaction()) {
    $pdo->rollBack();
}

echo 'new_school regression test passed' . PHP_EOL;
