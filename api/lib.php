<?php
/* ============================================================
   Helper functions
   ============================================================ */

declare(strict_types=1);

/** Send a JSON response and stop. */
function json($data, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** Read JSON (or form) body as an associative array. */
function body(): array
{
    $raw = file_get_contents('php://input') ?: '';
    $json = json_decode($raw, true);
    if (is_array($json)) {
        return $json;
    }
    return $_POST ?: [];
}

/** Trim + return a string field, or '' if missing. */
function field(array $src, string $key): string
{
    return isset($src[$key]) ? trim((string) $src[$key]) : '';
}

/** Validate an email or fail with 422. */
function require_email(string $email): string
{
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        json(['error' => 'A valid email is required.'], 422);
    }
    return strtolower($email);
}

/** Currently logged-in user array, or null. */
function current_user(): ?array
{
    if (empty($_SESSION['uid'])) {
        return null;
    }
    try {
        $stmt = db()->prepare(
            'SELECT id, full_name, email, role, email_verified_at, approval_status,
                    approval_note, approval_reviewed_by_user_id, approval_reviewed_at,
                    created_at, updated_at
             FROM users WHERE id = ?'
        );
        $stmt->execute([$_SESSION['uid']]);
        $u = $stmt->fetch();
        return $u ?: null;
    } catch (Throwable $e) {
        if (app_debug()) {
            error_log('current_user() failed: ' . $e->getMessage());
        }
        return null;
    }
}

/** Require a logged-in user (any role) or fail 401. */
function require_login(): array
{
    $u = current_user();
    if (!$u) {
        json(['error' => 'Authentication required.'], 401);
    }
    if (!in_array((string) ($u['role'] ?? ''), ['admin', 'super_admin', 'editor'], true)
        && (string) ($u['approval_status'] ?? 'pending') !== 'approved') {
        json(['error' => 'Your account is pending admin approval.'], 403);
    }
    return $u;
}

/** Require an admin-level user or fail 403. */
function require_admin(): array
{
    $u = require_login();
    if (!in_array($u['role'], ['admin', 'super_admin', 'editor'], true)) {
        json(['error' => 'Admin access required.'], 403);
    }
    return $u;
}

function csrf_token(): string
{
    return (string) ($_SESSION['csrf_token'] ?? '');
}

function require_csrf(): void
{
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if (in_array($method, ['GET', 'HEAD', 'OPTIONS'], true)) {
        return;
    }

    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if ($token === '' || !hash_equals(csrf_token(), $token)) {
        json(['error' => 'Invalid CSRF token.'], 419);
    }
}

function login_user(array $user): array
{
    session_regenerate_id(true);
    $_SESSION['uid'] = (int) $user['id'];
    unset(
        $user['password_hash'],
        $user['email_verification_otp_hash'],
        $user['email_verification_otp_expires_at'],
        $user['email_verification_otp_sent_at'],
        $user['email_verification_otp_attempts']
    );
    return $user;
}

function logout_user(): void
{
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], (bool) $params['secure'], (bool) $params['httponly']);
    }
    session_destroy();
}

function storefront_catalog(): array
{
    return [
        'hoodie-legacy' => ['name' => 'Founder Hoodie - Legacy Black', 'price' => 68.0],
        'hoodie-c2l' => ['name' => 'From Community to Legacy Hoodie', 'price' => 72.0],
        'tee-emblem' => ['name' => 'Premium Tee - FC Emblem', 'price' => 34.0],
        'tee-tech' => ['name' => 'Technology For Good Tee', 'price' => 32.0],
        'tee-vision' => ['name' => 'Visionary Tee', 'price' => 30.0],
        'cap-gold' => ['name' => 'Signature Cap - Gold FC', 'price' => 28.0],
        'cap-builder' => ['name' => 'Community Builder Cap', 'price' => 26.0],
        'book-nts' => ['name' => 'From Nothing to Something - Hardcover', 'price' => 24.0],
        'book-blueprint' => ['name' => 'The Legacy Blueprint - eBook', 'price' => 14.0],
        'pin-ltd' => ['name' => 'Limited Edition FC Lapel Pin', 'price' => 18.0],
        'print-signed' => ['name' => 'Signed Founder\'s Print', 'price' => 48.0],
    ];
}

function storefront_inventory_defaults(): array
{
    return [
        'hoodie-legacy'   => ['stock' => 24, 'threshold' => 5],
        'hoodie-c2l'      => ['stock' => 18, 'threshold' => 4],
        'tee-emblem'      => ['stock' => 48, 'threshold' => 8],
        'tee-tech'        => ['stock' => 44, 'threshold' => 8],
        'tee-vision'      => ['stock' => 36, 'threshold' => 6],
        'cap-gold'        => ['stock' => 40, 'threshold' => 6],
        'cap-builder'     => ['stock' => 32, 'threshold' => 5],
        'book-nts'        => ['stock' => 64, 'threshold' => 10],
        'book-blueprint'   => ['stock' => 96, 'threshold' => 12],
        'pin-ltd'         => ['stock' => 70, 'threshold' => 10],
        'print-signed'    => ['stock' => 16, 'threshold' => 4],
    ];
}

function inventory_status_label(int $stock, int $threshold): string
{
    if ($stock <= 0) {
        return 'out';
    }
    if ($stock <= $threshold) {
        return 'low';
    }
    return 'in';
}

function new_school_generate_participant_id(): string
{
    return 'NS-' . date('Y') . '-' . strtoupper(bin2hex(random_bytes(3)));
}

function new_school_generate_qr_token(): string
{
    return bin2hex(random_bytes(16));
}

function new_school_qr_url(string $token): string
{
    return '/new-school/parent/' . rawurlencode($token);
}

function new_school_submission_is_locked(array $student, int $interviewCount): bool
{
    return !(
        ($student['parent_consent_status'] ?? '') === 'approved'
        && ($student['school_approval_status'] ?? '') === 'approved'
        && ($student['teacher_approval_status'] ?? '') === 'approved'
        && $interviewCount >= 10
    );
}

function new_school_overall_status(array $student, int $interviewCount): string
{
    if (($student['submission_status'] ?? '') === 'complete') {
        return 'submission_complete';
    }
    if (($student['submission_status'] ?? '') === 'submitted') {
        return 'submission_submitted';
    }
    if (($student['parent_consent_status'] ?? '') !== 'approved') {
        return 'parent_consent_pending';
    }
    if (($student['school_approval_status'] ?? '') !== 'approved') {
        return 'school_approval_pending';
    }
    if (($student['teacher_approval_status'] ?? '') !== 'approved') {
        return 'teacher_approval_pending';
    }
    if ($interviewCount < 10) {
        return 'interviews_pending';
    }
    return 'eligible_to_submit';
}

function new_school_status_tracker(array $student, int $interviewCount): array
{
    return [
        ['label' => 'Student Registered', 'complete' => true],
        ['label' => 'Parent Consent', 'complete' => ($student['parent_consent_status'] ?? '') === 'approved'],
        ['label' => 'School Approval', 'complete' => ($student['school_approval_status'] ?? '') === 'approved'],
        ['label' => 'Teacher Approval', 'complete' => ($student['teacher_approval_status'] ?? '') === 'approved'],
        ['label' => '10 Business Interviews', 'complete' => $interviewCount >= 10],
        ['label' => 'Eligible To Submit', 'complete' => $interviewCount >= 10
            && ($student['parent_consent_status'] ?? '') === 'approved'
            && ($student['school_approval_status'] ?? '') === 'approved'
            && ($student['teacher_approval_status'] ?? '') === 'approved'],
        ['label' => 'Final Submission', 'complete' => in_array((string) ($student['submission_status'] ?? ''), ['submitted', 'complete', 'winner'], true)],
    ];
}

function new_school_fetch_student_by_user_id(int $userId): ?array
{
    $stmt = db()->prepare(
        'SELECT s.*, u.full_name AS user_full_name, u.email AS user_email
         FROM new_school_students s
         INNER JOIN users u ON u.id = s.user_id
         WHERE s.user_id = ?
         LIMIT 1'
    );
    $stmt->execute([$userId]);
    $student = $stmt->fetch();
    return $student ?: null;
}

function new_school_fetch_student_by_token(string $token): ?array
{
    $stmt = db()->prepare(
        'SELECT s.*, u.full_name AS user_full_name, u.email AS user_email
         FROM new_school_students s
         INNER JOIN users u ON u.id = s.user_id
         WHERE s.qr_token = ?
         LIMIT 1'
    );
    $stmt->execute([$token]);
    $student = $stmt->fetch();
    return $student ?: null;
}

function new_school_fetch_student_by_id(int $studentId): ?array
{
    $stmt = db()->prepare(
        'SELECT s.*, u.full_name AS user_full_name, u.email AS user_email
         FROM new_school_students s
         INNER JOIN users u ON u.id = s.user_id
         WHERE s.id = ?
         LIMIT 1'
    );
    $stmt->execute([$studentId]);
    $student = $stmt->fetch();
    return $student ?: null;
}

function new_school_fetch_student_by_participant_id(string $participantId): ?array
{
    $stmt = db()->prepare(
        'SELECT s.*, u.full_name AS user_full_name, u.email AS user_email
         FROM new_school_students s
         INNER JOIN users u ON u.id = s.user_id
         WHERE s.participant_id = ?
         LIMIT 1'
    );
    $stmt->execute([$participantId]);
    $student = $stmt->fetch();
    return $student ?: null;
}

function new_school_fetch_school_by_user_id(int $userId): ?array
{
    $stmt = db()->prepare(
        'SELECT * FROM new_school_schools WHERE user_id = ? LIMIT 1'
    );
    $stmt->execute([$userId]);
    $school = $stmt->fetch();
    return $school ?: null;
}

function new_school_fetch_school_by_id(int $schoolId): ?array
{
    $stmt = db()->prepare('SELECT * FROM new_school_schools WHERE id = ? LIMIT 1');
    $stmt->execute([$schoolId]);
    $school = $stmt->fetch();
    return $school ?: null;
}

function new_school_fetch_school_by_name(string $schoolName): ?array
{
    $stmt = db()->prepare('SELECT * FROM new_school_schools WHERE school_name = ? LIMIT 1');
    $stmt->execute([$schoolName]);
    $school = $stmt->fetch();
    return $school ?: null;
}

function new_school_fetch_teacher_by_user_id(int $userId): ?array
{
    $stmt = db()->prepare(
        'SELECT t.*, s.school_name AS linked_school_name
         FROM new_school_teachers t
         INNER JOIN new_school_schools s ON s.id = t.school_id
         WHERE t.user_id = ?
         LIMIT 1'
    );
    $stmt->execute([$userId]);
    $teacher = $stmt->fetch();
    return $teacher ?: null;
}

function new_school_fetch_teacher_by_id(int $teacherId): ?array
{
    $stmt = db()->prepare(
        'SELECT t.*, s.school_name AS linked_school_name
         FROM new_school_teachers t
         INNER JOIN new_school_schools s ON s.id = t.school_id
         WHERE t.id = ?
         LIMIT 1'
    );
    $stmt->execute([$teacherId]);
    $teacher = $stmt->fetch();
    return $teacher ?: null;
}

function new_school_fetch_parent_by_student_id(int $studentId): ?array
{
    $stmt = db()->prepare(
        'SELECT * FROM new_school_parents WHERE student_id = ? LIMIT 1'
    );
    $stmt->execute([$studentId]);
    $parent = $stmt->fetch();
    return $parent ?: null;
}

function new_school_fetch_parent_by_user_id(int $userId): ?array
{
    $stmt = db()->prepare(
        'SELECT p.*, s.full_name AS student_full_name, s.school_name AS student_school_name, s.participant_id
         FROM new_school_parents p
         INNER JOIN new_school_students s ON s.id = p.student_id
         WHERE p.user_id = ?
         LIMIT 1'
    );
    $stmt->execute([$userId]);
    $parent = $stmt->fetch();
    return $parent ?: null;
}

function new_school_student_interview_count(int $studentId): int
{
    $stmt = db()->prepare('SELECT COUNT(*) FROM new_school_business_interviews WHERE student_id = ?');
    $stmt->execute([$studentId]);
    return (int) $stmt->fetchColumn();
}

function new_school_fetch_student_interviews(int $studentId): array
{
    $stmt = db()->prepare(
        'SELECT *
         FROM new_school_business_interviews
         WHERE student_id = ?
         ORDER BY visit_number ASC, created_at ASC'
    );
    $stmt->execute([$studentId]);
    return $stmt->fetchAll();
}

function new_school_fetch_student_approvals(int $studentId): array
{
    $stmt = db()->prepare(
        'SELECT *
         FROM new_school_approvals
         WHERE student_id = ?
         ORDER BY approval_type ASC'
    );
    $stmt->execute([$studentId]);
    $rows = $stmt->fetchAll();
    $map = ['school' => null, 'teacher' => null];
    foreach ($rows as $row) {
        $map[(string) $row['approval_type']] = $row;
    }
    return $map;
}

function new_school_placeholder_list(int $count): string
{
    return implode(',', array_fill(0, max(1, $count), '?'));
}

function new_school_fetch_businesses_by_student_ids(array $studentIds): array
{
    $studentIds = array_values(array_filter(array_map('intval', $studentIds), static fn(int $id): bool => $id > 0));
    if ($studentIds === []) {
        return [];
    }

    $stmt = db()->prepare(
        'SELECT bi.*, s.full_name AS student_name, s.participant_id, s.grade_level, s.school_name, u.email AS student_email
         FROM new_school_business_interviews bi
         INNER JOIN new_school_students s ON s.id = bi.student_id
         INNER JOIN users u ON u.id = s.user_id
         WHERE bi.student_id IN (' . new_school_placeholder_list(count($studentIds)) . ')
         ORDER BY bi.student_id ASC, bi.visit_number ASC, bi.created_at ASC'
    );
    $stmt->execute($studentIds);
    return $stmt->fetchAll();
}

function new_school_fetch_submissions_by_student_ids(array $studentIds): array
{
    $studentIds = array_values(array_filter(array_map('intval', $studentIds), static fn(int $id): bool => $id > 0));
    if ($studentIds === []) {
        return [];
    }

    $stmt = db()->prepare(
        'SELECT sub.*, s.full_name AS student_name, s.participant_id, s.grade_level, s.school_name, u.email AS student_email,
                b.business_name AS source_business_name, b.owner_name AS source_owner_name, b.business_category AS source_business_category,
                rv.full_name AS reviewer_name, rv.email AS reviewer_email
         FROM new_school_submissions sub
         INNER JOIN new_school_students s ON s.id = sub.student_id
         INNER JOIN users u ON u.id = s.user_id
         LEFT JOIN new_school_business_interviews b ON b.id = sub.source_business_id
         LEFT JOIN users rv ON rv.id = sub.reviewed_by_user_id
         WHERE sub.student_id IN (' . new_school_placeholder_list(count($studentIds)) . ')
         ORDER BY COALESCE(sub.reviewed_at, sub.submission_date, sub.updated_at) DESC, sub.created_at DESC'
    );
    $stmt->execute($studentIds);
    return $stmt->fetchAll();
}

function new_school_fetch_approvals_by_student_ids(array $studentIds): array
{
    $studentIds = array_values(array_filter(array_map('intval', $studentIds), static fn(int $id): bool => $id > 0));
    if ($studentIds === []) {
        return [];
    }

    $stmt = db()->prepare(
        'SELECT a.*, s.full_name AS student_name, s.participant_id, s.grade_level, s.school_name, u.email AS student_email
         FROM new_school_approvals a
         INNER JOIN new_school_students s ON s.id = a.student_id
         INNER JOIN users u ON u.id = s.user_id
         WHERE a.student_id IN (' . new_school_placeholder_list(count($studentIds)) . ')
         ORDER BY a.updated_at DESC, a.created_at DESC'
    );
    $stmt->execute($studentIds);
    return $stmt->fetchAll();
}

function new_school_fetch_parents_by_student_ids(array $studentIds): array
{
    $studentIds = array_values(array_filter(array_map('intval', $studentIds), static fn(int $id): bool => $id > 0));
    if ($studentIds === []) {
        return [];
    }

    $stmt = db()->prepare(
        'SELECT p.*, s.full_name AS student_name, s.participant_id, s.school_name, s.grade_level, s.parent_consent_status,
                u.email AS student_email
         FROM new_school_parents p
         INNER JOIN new_school_students s ON s.id = p.student_id
         INNER JOIN users u ON u.id = s.user_id
         WHERE p.student_id IN (' . new_school_placeholder_list(count($studentIds)) . ')
         ORDER BY p.updated_at DESC, p.created_at DESC'
    );
    $stmt->execute($studentIds);
    return $stmt->fetchAll();
}

function new_school_fetch_winners_by_student_ids(array $studentIds): array
{
    $studentIds = array_values(array_filter(array_map('intval', $studentIds), static fn(int $id): bool => $id > 0));
    if ($studentIds === []) {
        return [];
    }

    $stmt = db()->prepare(
        'SELECT w.*, s.full_name AS student_name, s.participant_id, s.grade_level, s.school_name, u.email AS student_email,
                sub.score, sub.rank_position, sub.status AS submission_status
         FROM new_school_winners w
         INNER JOIN new_school_students s ON s.id = w.student_id
         INNER JOIN users u ON u.id = s.user_id
         INNER JOIN new_school_submissions sub ON sub.id = w.submission_id
         WHERE w.student_id IN (' . new_school_placeholder_list(count($studentIds)) . ')
         ORDER BY w.created_at DESC'
    );
    $stmt->execute($studentIds);
    return $stmt->fetchAll();
}

function new_school_fetch_notifications_for_scope(array $studentIds, array $roles, int $limit = 12): array
{
    $studentIds = array_values(array_filter(array_map('intval', $studentIds), static fn(int $id): bool => $id > 0));
    $roles = array_values(array_filter(array_map('strval', $roles), static fn(string $role): bool => $role !== ''));

    if ($studentIds === [] && $roles === []) {
        return [];
    }

    $clauses = [];
    $params = [];

    if ($studentIds !== []) {
        $clauses[] = 'n.student_id IN (' . new_school_placeholder_list(count($studentIds)) . ')';
        $params = array_merge($params, $studentIds);
    }

    if ($roles !== []) {
        $clauses[] = 'n.recipient_role IN (' . new_school_placeholder_list(count($roles)) . ')';
        $params = array_merge($params, $roles);
    }

    $clauses[] = "n.recipient_role = 'all'";

    $stmt = db()->prepare(
        'SELECT n.*, s.full_name AS student_name, s.participant_id, s.school_name
         FROM new_school_notifications n
         LEFT JOIN new_school_students s ON s.id = n.student_id
         WHERE ' . implode(' OR ', $clauses) . '
         ORDER BY n.created_at DESC
         LIMIT ' . max(1, $limit)
    );
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

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

    return $rows;
}

function new_school_add_notification(?int $studentId, string $recipientRole, string $type, string $title, string $message, array $payload = []): void
{
    $stmt = db()->prepare(
        'INSERT INTO new_school_notifications (
            student_id, recipient_role, notification_type, title, message, payload_json
         ) VALUES (?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([
        $studentId,
        $recipientRole,
        $type,
        $title,
        $message,
        $payload !== [] ? json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
    ]);
}

function new_school_fetch_notification_by_id(int $notificationId): ?array
{
    $stmt = db()->prepare(
        'SELECT n.*, s.full_name AS student_name, s.participant_id, s.school_name
         FROM new_school_notifications n
         LEFT JOIN new_school_students s ON s.id = n.student_id
         WHERE n.id = ?
         LIMIT 1'
    );
    $stmt->execute([$notificationId]);
    $notification = $stmt->fetch();
    return $notification ?: null;
}

function new_school_notification_can_access(array $user, array $notification): bool
{
    if (in_array((string) ($user['role'] ?? ''), ['admin', 'super_admin', 'editor'], true)) {
        return true;
    }

    $recipientRole = (string) ($notification['recipient_role'] ?? '');
    if (!in_array($recipientRole, ['student', 'parent', 'school', 'teacher', 'all'], true)) {
        return false;
    }

    $studentId = (int) ($notification['student_id'] ?? 0);
    if ($studentId <= 0) {
        return false;
    }

    $role = (string) ($user['role'] ?? '');
    if ($role === 'student') {
        if (!in_array($recipientRole, ['student', 'all'], true)) {
            return false;
        }
        $student = new_school_fetch_student_by_user_id((int) $user['id']);
        return $student && (int) $student['id'] === $studentId;
    }

    if ($role === 'parent') {
        if (!in_array($recipientRole, ['parent', 'all'], true)) {
            return false;
        }
        $parent = new_school_fetch_parent_by_user_id((int) $user['id']);
        return $parent && (int) $parent['student_id'] === $studentId;
    }

    if ($role === 'school') {
        if (!in_array($recipientRole, ['school', 'all'], true)) {
            return false;
        }
        $school = new_school_fetch_school_by_user_id((int) $user['id']);
        if (!$school) {
            return false;
        }
        $student = new_school_fetch_student_by_id($studentId);
        return $student && (
            (int) ($student['school_id'] ?? 0) === (int) $school['id']
            || (string) ($student['school_name'] ?? '') === (string) ($school['school_name'] ?? '')
        );
    }

    if ($role === 'teacher') {
        if (!in_array($recipientRole, ['teacher', 'all'], true)) {
            return false;
        }
        $teacher = new_school_fetch_teacher_by_user_id((int) $user['id']);
        if (!$teacher) {
            return false;
        }
        $student = new_school_fetch_student_by_id($studentId);
        return $student && (
            (int) ($student['teacher_id'] ?? 0) === (int) $teacher['id']
            || (int) ($student['school_id'] ?? 0) === (int) $teacher['school_id']
            || (string) ($student['school_name'] ?? '') === (string) ($teacher['linked_school_name'] ?? '')
        );
    }

    return false;
}

function new_school_fetch_submission_by_student_id(int $studentId): ?array
{
    $stmt = db()->prepare(
        'SELECT s.*, b.business_name AS source_business_name, b.owner_name AS source_owner_name, b.business_address AS source_business_address,
                b.business_phone AS source_business_phone, b.date_of_visit AS source_date_of_visit, b.business_category AS source_business_category,
                rv.full_name AS reviewer_name, rv.email AS reviewer_email
         FROM new_school_submissions s
         LEFT JOIN new_school_business_interviews b ON b.id = s.source_business_id
         LEFT JOIN users rv ON rv.id = s.reviewed_by_user_id
         WHERE s.student_id = ?
         LIMIT 1'
    );
    $stmt->execute([$studentId]);
    $submission = $stmt->fetch();
    return $submission ?: null;
}

function new_school_fetch_students_by_school_id(int $schoolId): array
{
    $stmt = db()->prepare(
        'SELECT s.*, u.full_name AS user_full_name, u.email AS user_email,
                (SELECT COUNT(*) FROM new_school_business_interviews bi WHERE bi.student_id = s.id) AS interview_count,
                (SELECT COUNT(*) FROM new_school_submissions sub WHERE sub.student_id = s.id) AS has_submission
         FROM new_school_students s
         INNER JOIN users u ON u.id = s.user_id
         WHERE s.school_id = ?
         ORDER BY s.created_at DESC'
    );
    $stmt->execute([$schoolId]);
    return $stmt->fetchAll();
}

function new_school_fetch_students_by_teacher_id(int $teacherId): array
{
    $stmt = db()->prepare(
        'SELECT s.*, u.full_name AS user_full_name, u.email AS user_email,
                (SELECT COUNT(*) FROM new_school_business_interviews bi WHERE bi.student_id = s.id) AS interview_count,
                (SELECT COUNT(*) FROM new_school_submissions sub WHERE sub.student_id = s.id) AS has_submission
         FROM new_school_students s
         INNER JOIN users u ON u.id = s.user_id
         WHERE s.teacher_id = ?
         ORDER BY s.created_at DESC'
    );
    $stmt->execute([$teacherId]);
    return $stmt->fetchAll();
}

function new_school_fetch_all_schools(): array
{
    return db()->query(
        'SELECT id, school_name, school_address, school_district, main_phone, principal_name, administrator_name, administrator_email, administrator_phone, status, created_at
         FROM new_school_schools
         ORDER BY school_name ASC'
    )->fetchAll();
}

function new_school_fetch_students_for_school(array $school): array
{
    $stmt = db()->prepare(
        'SELECT s.*, u.full_name AS user_full_name, u.email AS user_email,
                (SELECT COUNT(*) FROM new_school_business_interviews bi WHERE bi.student_id = s.id) AS interview_count,
                (SELECT COUNT(*) FROM new_school_submissions sub WHERE sub.student_id = s.id) AS has_submission
         FROM new_school_students s
         INNER JOIN users u ON u.id = s.user_id
         WHERE s.school_id = ? OR s.school_name = ?
         ORDER BY s.created_at DESC'
    );
    $stmt->execute([(int) $school['id'], (string) $school['school_name']]);
    return $stmt->fetchAll();
}

function new_school_fetch_students_for_teacher(array $teacher): array
{
    $stmt = db()->prepare(
        'SELECT s.*, u.full_name AS user_full_name, u.email AS user_email,
                (SELECT COUNT(*) FROM new_school_business_interviews bi WHERE bi.student_id = s.id) AS interview_count,
                (SELECT COUNT(*) FROM new_school_submissions sub WHERE sub.student_id = s.id) AS has_submission
         FROM new_school_students s
         INNER JOIN users u ON u.id = s.user_id
         WHERE s.teacher_id = ? OR s.school_id = ? OR s.school_name = ?
         ORDER BY s.created_at DESC'
    );
    $stmt->execute([(int) $teacher['id'], (int) $teacher['school_id'], (string) ($teacher['linked_school_name'] ?? '')]);
    return $stmt->fetchAll();
}

function new_school_public_leaderboards(): array
{
    return [
        'schools' => db()->query(
            'SELECT sc.id, sc.school_name AS label,
                    COUNT(DISTINCT st.id) AS students,
                    SUM(CASE WHEN st.parent_consent_status = "approved" THEN 1 ELSE 0 END) AS parent_approved,
                    SUM(CASE WHEN st.school_approval_status = "approved" THEN 1 ELSE 0 END) AS school_approved,
                    SUM(CASE WHEN st.teacher_approval_status = "approved" THEN 1 ELSE 0 END) AS teacher_approved,
                    COUNT(DISTINCT sub.id) AS submissions
             FROM new_school_schools sc
             LEFT JOIN new_school_students st ON st.school_id = sc.id
             LEFT JOIN new_school_submissions sub ON sub.student_id = st.id
             GROUP BY sc.id, sc.school_name
             ORDER BY submissions DESC, teacher_approved DESC, students DESC
             LIMIT 10'
        )->fetchAll(),
        'teachers' => db()->query(
            'SELECT t.id, t.teacher_full_name AS label,
                    COUNT(DISTINCT st.id) AS students,
                    SUM(CASE WHEN st.parent_consent_status = "approved" THEN 1 ELSE 0 END) AS parent_approved,
                    SUM(CASE WHEN st.school_approval_status = "approved" THEN 1 ELSE 0 END) AS school_approved,
                    SUM(CASE WHEN st.teacher_approval_status = "approved" THEN 1 ELSE 0 END) AS teacher_approved,
                    COUNT(DISTINCT sub.id) AS submissions
             FROM new_school_teachers t
             LEFT JOIN new_school_students st ON st.teacher_id = t.id
             LEFT JOIN new_school_submissions sub ON sub.student_id = st.id
             GROUP BY t.id, t.teacher_full_name
             ORDER BY submissions DESC, teacher_approved DESC, students DESC
             LIMIT 10'
        )->fetchAll(),
        'students' => db()->query(
            'SELECT s.id, s.full_name AS label, s.grade_level,
                    (SELECT COUNT(*) FROM new_school_business_interviews bi WHERE bi.student_id = s.id) AS interview_count,
                    (SELECT COUNT(*) FROM new_school_submissions sub WHERE sub.student_id = s.id) AS submitted
             FROM new_school_students s
             ORDER BY interview_count DESC, submitted DESC, s.created_at DESC
             LIMIT 10'
        )->fetchAll(),
    ];
}

function new_school_fetch_winner_by_student_id(int $studentId): ?array
{
    $stmt = db()->prepare(
        'SELECT * FROM new_school_winners WHERE student_id = ? LIMIT 1'
    );
    $stmt->execute([$studentId]);
    $winner = $stmt->fetch();
    return $winner ?: null;
}

function new_school_refresh_student_status(int $studentId): ?array
{
    $student = new_school_fetch_student_by_id($studentId);
    if (!$student) {
        return null;
    }

    $interviewCount = new_school_student_interview_count($studentId);
    $submission = new_school_fetch_submission_by_student_id($studentId);

    $submissionStatus = 'locked';
    if ($submission) {
        $submissionStatus = in_array((string) $submission['status'], ['approved', 'winner'], true) ? 'complete' : 'submitted';
    } elseif (
        ($student['parent_consent_status'] ?? '') === 'approved'
        && ($student['school_approval_status'] ?? '') === 'approved'
        && ($student['teacher_approval_status'] ?? '') === 'approved'
        && $interviewCount >= 10
    ) {
        $submissionStatus = 'eligible';
    }

    $overall = new_school_overall_status(array_merge($student, ['submission_status' => $submissionStatus]), $interviewCount);

    $stmt = db()->prepare(
        'UPDATE new_school_students
         SET submission_status = ?, overall_status = ?, updated_at = NOW()
         WHERE id = ?'
    );
    $stmt->execute([$submissionStatus, $overall, $studentId]);

    return new_school_fetch_student_by_id($studentId);
}

function new_school_public_summary(): array
{
    $count = static fn(string $sql): int => (int) db()->query($sql)->fetchColumn();
    return [
        'students' => $count('SELECT COUNT(*) FROM new_school_students'),
        'parents' => $count('SELECT COUNT(*) FROM new_school_parents'),
        'schools' => $count('SELECT COUNT(*) FROM new_school_schools'),
        'teachers' => $count('SELECT COUNT(*) FROM new_school_teachers'),
        'businesses' => $count('SELECT COUNT(*) FROM new_school_business_interviews'),
        'submissions' => $count('SELECT COUNT(*) FROM new_school_submissions'),
        'winners' => $count('SELECT COUNT(*) FROM new_school_winners'),
    ];
}

function user_access_rank(?array $user): int
{
    if (!$user) {
        return 0;
    }
    if (in_array((string) $user['role'], ['vip', 'editor', 'admin', 'super_admin'], true)) {
        return 2;
    }
    return 1;
}

function community_can_view(string $audience, ?array $user): bool
{
    $rank = user_access_rank($user);
    return match ($audience) {
        'public' => true,
        'member' => $rank >= 1,
        'vip'    => $rank >= 2,
        default  => false,
    };
}

function event_confirmation_code(): string
{
    return 'EV-' . str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
}

function normalized_order_items(array $items): array
{
    $catalog = storefront_catalog();
    $normalized = [];

    foreach ($items as $item) {
        if (!is_array($item)) {
            continue;
        }
        $id = trim((string) ($item['id'] ?? ''));
        $qty = (int) ($item['qty'] ?? 0);
        $size = trim((string) ($item['size'] ?? ''));

        if ($id === '' || !isset($catalog[$id]) || $qty <= 0) {
            continue;
        }

        $normalized[] = [
            'id' => $id,
            'name' => $catalog[$id]['name'],
            'size' => $size !== '' ? $size : 'Default',
            'qty' => $qty,
            'price' => $catalog[$id]['price'],
        ];
    }

    return $normalized;
}

function calculate_order_totals(array $items, string $promoCode = ''): array
{
    $subtotal = 0.0;
    foreach ($items as $item) {
        $subtotal += ((float) $item['price']) * ((int) $item['qty']);
    }

    $promo = strtoupper(trim($promoCode));
    $discountRate = match ($promo) {
        'LEGACY10' => 0.10,
        'COMMUNITY' => 0.15,
        default => 0.0,
    };

    $discount = round($subtotal * $discountRate, 2);
    $shipping = ($subtotal >= 75 || $subtotal <= 0) ? 0.0 : 6.5;
    $tax = round(($subtotal - $discount) * 0.0875, 2);
    $total = round($subtotal - $discount + $shipping + $tax, 2);

    return [
        'subtotal' => round($subtotal, 2),
        'discount' => $discount,
        'shipping' => $shipping,
        'tax' => $tax,
        'total' => $total,
        'promo_code' => $promo,
    ];
}

function mail_timeout_seconds(): int
{
    return max(1, (int) env('MAIL_TIMEOUT_SECONDS', '8'));
}

function mail_from_address(): string
{
    $from = trim((string) env('MAIL_FROM_ADDRESS', ''));
    if ($from !== '') {
        return $from;
    }

    $legacy = trim((string) env('MAIL_FROM', ''));
    if ($legacy !== '') {
        return $legacy;
    }

    $username = trim((string) env('MAIL_USERNAME', ''));
    return $username !== '' ? $username : 'no-reply@frantzcoutard.com';
}

function mail_from_name(): string
{
    $name = trim((string) env('MAIL_FROM_NAME', ''));
    if ($name !== '') {
        return $name;
    }

    return 'FrantzCoutard';
}

function mail_allow_php_fallback(): bool
{
    return filter_var(env('MAIL_ALLOW_PHP_FALLBACK', 'false'), FILTER_VALIDATE_BOOLEAN);
}

function mail_verify_peer(): bool
{
    return filter_var(env('MAIL_VERIFY_PEER', 'false'), FILTER_VALIDATE_BOOLEAN);
}

function mail_smtp_configured(): bool
{
    return trim((string) env('MAIL_HOST', '')) !== ''
        && trim((string) env('MAIL_USERNAME', '')) !== ''
        && (string) env('MAIL_PASSWORD', '') !== '';
}

function mail_normalize_password(string $password): string
{
    return preg_replace('/\s+/', '', trim($password)) ?? trim($password);
}

function mail_smtp_crypto_method(): int
{
    $method = 0;
    foreach ([
        'STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT',
        'STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT',
        'STREAM_CRYPTO_METHOD_TLS_CLIENT',
    ] as $const) {
        if (defined($const)) {
            $method |= constant($const);
        }
    }

    return $method !== 0 ? $method : STREAM_CRYPTO_METHOD_TLS_CLIENT;
}

function mail_smtp_candidates(string $host, int $port, string $encryption): array
{
    $host = trim($host);
    $encryption = strtolower(trim($encryption));
    $candidates = [];

    if ($host !== '' && $port > 0) {
        $candidates[] = [$host, $port, $encryption];
    }

    if (str_contains(strtolower($host), 'gmail.com')) {
        if ($port === 587 && $encryption === 'tls') {
            $candidates[] = [$host, 465, 'ssl'];
        } elseif ($port === 465 && $encryption === 'ssl') {
            $candidates[] = [$host, 587, 'tls'];
        }
    }

    return array_values(array_unique($candidates, SORT_REGULAR));
}

function mail_smtp_log_failure(string $stage, string $detail): void
{
    error_log('[mail][' . $stage . '] ' . $detail);
}

function mail_encode_header(string $value): string
{
    $value = trim($value);
    if ($value === '') {
        return '';
    }

    if (function_exists('mb_encode_mimeheader')) {
        $encoded = mb_encode_mimeheader($value, 'UTF-8', 'B', "\r\n");
        if (is_string($encoded) && $encoded !== '') {
            return $encoded;
        }
    }

    return $value;
}

function mail_prepare_body(string $bodyText): string
{
    $normalized = str_replace(["\r\n", "\r"], "\n", $bodyText);
    $lines = explode("\n", $normalized);
    foreach ($lines as &$line) {
        if ($line !== '' && isset($line[0]) && $line[0] === '.') {
            $line = '.' . $line;
        }
    }
    unset($line);

    return implode("\r\n", $lines);
}

function mail_provider(): string
{
    $provider = strtolower(trim((string) env('MAIL_PROVIDER', '')));
    $provider = str_replace(['-', ' '], '_', $provider);

    if (in_array($provider, ['gmail', 'gmailapi', 'gmail_api'], true)) {
        return 'gmail_api';
    }

    if (in_array($provider, ['smtp', 'php'], true)) {
        return $provider;
    }

    if ($provider !== '') {
        return $provider;
    }

    if (mail_gmail_configured()) {
        return 'gmail_api';
    }

    if (mail_smtp_configured()) {
        return 'smtp';
    }

    return 'php';
}

function mail_google_client_id(): string
{
    return trim((string) env('GOOGLE_CLIENT_ID', ''));
}

function mail_google_client_secret(): string
{
    return trim((string) env('GOOGLE_CLIENT_SECRET', ''));
}

function mail_google_refresh_token(): string
{
    return trim((string) env('GOOGLE_REFRESH_TOKEN', ''));
}

function mail_gmail_configured(): bool
{
    return mail_google_client_id() !== ''
        && mail_google_client_secret() !== ''
        && mail_google_refresh_token() !== '';
}

function mail_base64url_encode(string $value): string
{
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

function mail_build_message(string $to, string $subject, string $bodyText): string
{
    $fromAddress = mail_from_address();
    $fromName = mail_from_name();

    $headers = [
        'From: ' . mail_encode_header($fromName) . ' <' . $fromAddress . '>',
        'To: <' . $to . '>',
        'Subject: ' . mail_encode_header($subject),
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
    ];

    return implode("\r\n", $headers) . "\r\n\r\n" . mail_prepare_body($bodyText);
}

function mail_http_request(string $url, string $method, ?string $body = null, array $headers = []): array
{
    if (!function_exists('curl_init')) {
        throw new RuntimeException('cURL extension is required for Gmail API mail transport.');
    }

    $curl = curl_init($url);
    if ($curl === false) {
        throw new RuntimeException('Unable to initialize HTTP client.');
    }

    $method = strtoupper(trim($method));
    $options = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_CONNECTTIMEOUT => mail_timeout_seconds(),
        CURLOPT_TIMEOUT => max(10, mail_timeout_seconds() * 4),
        CURLOPT_SSL_VERIFYPEER => mail_verify_peer(),
        CURLOPT_SSL_VERIFYHOST => mail_verify_peer() ? 2 : 0,
    ];

    if ($body !== null) {
        $options[CURLOPT_POSTFIELDS] = $body;
    }

    curl_setopt_array($curl, $options);
    $responseBody = curl_exec($curl);
    $error = curl_error($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    curl_close($curl);

    return [
        'ok' => $error === '' && $responseBody !== false && $status >= 200 && $status < 300,
        'status' => $status,
        'body' => is_string($responseBody) ? $responseBody : '',
        'error' => $error,
    ];
}

function mail_gmail_access_token(): string
{
    static $cachedToken = '';
    static $expiresAt = 0;

    if ($cachedToken !== '' && time() < ($expiresAt - 60)) {
        return $cachedToken;
    }

    if (!mail_gmail_configured()) {
        return '';
    }

    $response = mail_http_request(
        'https://oauth2.googleapis.com/token',
        'POST',
        http_build_query([
            'client_id' => mail_google_client_id(),
            'client_secret' => mail_google_client_secret(),
            'refresh_token' => mail_google_refresh_token(),
            'grant_type' => 'refresh_token',
        ], '', '&', PHP_QUERY_RFC3986),
        [
            'Accept: application/json',
            'Content-Type: application/x-www-form-urlencoded',
        ]
    );

    if (!$response['ok']) {
        $detail = $response['error'] !== '' ? $response['error'] : $response['body'];
        mail_smtp_log_failure('gmail-token', $detail !== '' ? $detail : 'Token exchange failed.');
        return '';
    }

    $data = json_decode($response['body'], true);
    if (!is_array($data) || empty($data['access_token'])) {
        $detail = $response['body'] !== '' ? $response['body'] : 'Invalid token response.';
        mail_smtp_log_failure('gmail-token', $detail);
        return '';
    }

    $cachedToken = (string) $data['access_token'];
    $expiresIn = max(60, (int) ($data['expires_in'] ?? 3600));
    $expiresAt = time() + $expiresIn;

    return $cachedToken;
}

function mail_gmail_send_message(string $to, string $subject, string $bodyText): bool
{
    $accessToken = mail_gmail_access_token();
    if ($accessToken === '') {
        return false;
    }

    $payload = json_encode([
        'raw' => mail_base64url_encode(mail_build_message($to, $subject, $bodyText)),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($payload === false) {
        mail_smtp_log_failure('gmail-api', 'Unable to encode Gmail API payload.');
        return false;
    }

    $response = mail_http_request(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        'POST',
        $payload,
        [
            'Accept: application/json',
            'Authorization: Bearer ' . $accessToken,
            'Content-Type: application/json; charset=UTF-8',
        ]
    );

    if (!$response['ok']) {
        $detail = $response['error'] !== '' ? $response['error'] : $response['body'];
        mail_smtp_log_failure('gmail-api', $detail !== '' ? $detail : 'Gmail API send failed.');
        return false;
    }

    return true;
}

function mail_transport_retryable(): bool
{
    return mail_smtp_configured() || mail_gmail_configured() || mail_allow_php_fallback();
}

function mail_smtp_read_response($socket): array
{
    $lines = [];
    $code = null;

    while (!feof($socket)) {
        $line = fgets($socket, 512);
        if ($line === false) {
            break;
        }

        $lines[] = rtrim($line, "\r\n");
        if (preg_match('/^(\d{3})([ -])/', $line, $matches)) {
            $code = (int) $matches[1];
            if ($matches[2] === ' ') {
                break;
            }
        }
    }

    return ['code' => $code, 'lines' => $lines];
}

function mail_smtp_expect($socket, array $expectedCodes, string $stage): void
{
    $response = mail_smtp_read_response($socket);
    if (!in_array($response['code'], $expectedCodes, true)) {
        throw new RuntimeException($stage . ' failed: ' . implode(' | ', $response['lines']));
    }
}

function mail_smtp_send($socket, string $command, array $expectedCodes, string $stage): void
{
    if (fwrite($socket, $command . "\r\n") === false) {
        throw new RuntimeException($stage . ' failed: unable to write command.');
    }

    mail_smtp_expect($socket, $expectedCodes, $stage);
}

function mail_php_binary(): string
{
    $candidates = [];
    $binary = trim((string) (defined('PHP_BINARY') ? PHP_BINARY : ''));
    if ($binary !== '') {
        $candidates[] = $binary;
    }

    $bindir = trim((string) (defined('PHP_BINDIR') ? PHP_BINDIR : ''));
    if ($bindir !== '') {
        $candidates[] = $bindir . DIRECTORY_SEPARATOR . 'php.exe';
        $candidates[] = $bindir . DIRECTORY_SEPARATOR . 'php';
    }

    foreach ($candidates as $candidate) {
        if ($candidate !== '' && is_file($candidate)) {
            return $candidate;
        }
    }

    return $binary !== '' ? $binary : 'php';
}

function mail_queue_max_attempts(): int
{
    return max(1, (int) env('MAIL_MAX_ATTEMPTS', '3'));
}

function mail_queue_retry_delay_seconds(int $attempts): int
{
    $attempts = max(1, $attempts);
    return min(300, max(30, 30 * $attempts));
}

function mail_queue_ensure_schema(): void
{
    static $ready = false;
    if ($ready) {
        return;
    }

    db()->exec(
        "CREATE TABLE IF NOT EXISTS mail_outbox (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            message_kind VARCHAR(40) NOT NULL DEFAULT 'notification',
            recipient_email VARCHAR(160) NOT NULL,
            subject VARCHAR(255) NOT NULL,
            body_text LONGTEXT NOT NULL,
            status ENUM('queued','sending','retry','sent','failed') NOT NULL DEFAULT 'queued',
            attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
            last_error TEXT DEFAULT NULL,
            next_attempt_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            sent_at TIMESTAMP NULL DEFAULT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_mail_outbox_status_next (status, next_attempt_at, created_at),
            INDEX idx_mail_outbox_kind_status (message_kind, status, created_at),
            INDEX idx_mail_outbox_recipient (recipient_email, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $ready = true;
}

function mail_queue_spawn_worker(): bool
{
    if (PHP_SAPI === 'cli' || PHP_SAPI === 'phpdbg') {
        return false;
    }

    $script = realpath(__DIR__ . '/mail_worker.php') ?: (__DIR__ . '/mail_worker.php');
    if (!is_file($script)) {
        mail_smtp_log_failure('queue-spawn', 'Mail worker script is missing.');
        return false;
    }

    $phpBinary = mail_php_binary();
    $command = PHP_OS_FAMILY === 'Windows'
        ? 'cmd /d /s /c start "" /B ' . escapeshellarg($phpBinary) . ' ' . escapeshellarg($script) . ' --drain-mail-queue >NUL 2>&1'
        : escapeshellarg($phpBinary) . ' ' . escapeshellarg($script) . ' --drain-mail-queue >/dev/null 2>&1 &';

    if (function_exists('popen')) {
        $handle = @popen($command, 'r');
        if ($handle !== false) {
            @pclose($handle);
            return true;
        }
    }

    if (function_exists('proc_open')) {
        $descriptorSpec = [
            0 => ['pipe', 'r'],
            1 => ['file', PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null', 'a'],
            2 => ['file', PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null', 'a'],
        ];
        $process = @proc_open($command, $descriptorSpec, $pipes);
        if (is_resource($process)) {
            foreach ($pipes as $pipe) {
                if (is_resource($pipe)) {
                    fclose($pipe);
                }
            }
            @proc_close($process);
            return true;
        }
    }

    mail_smtp_log_failure('queue-spawn', 'Unable to launch the mail worker.');
    return false;
}

function mail_queue_enqueue(string $kind, string $to, string $subject, string $bodyText): bool
{
    $kind = trim($kind) !== '' ? trim($kind) : 'notification';
    $to = trim($to);
    $subject = trim($subject);
    $bodyText = rtrim($bodyText);

    if ($to === '' || $subject === '' || $bodyText === '') {
        return false;
    }

    try {
        mail_queue_ensure_schema();
        $stmt = db()->prepare(
            'INSERT INTO mail_outbox (message_kind, recipient_email, subject, body_text, status, attempts, last_error, next_attempt_at)
             VALUES (?, ?, ?, ?, \'queued\', 0, NULL, NOW())'
        );
        $stmt->execute([$kind, $to, $subject, $bodyText]);
        mail_queue_spawn_worker();
        return true;
    } catch (Throwable $e) {
        mail_smtp_log_failure('queue', $e->getMessage());
        return false;
    }
}

function mail_queue_claim_next(): ?array
{
    mail_queue_ensure_schema();
    $pdo = db();
    $pdo->beginTransaction();

    try {
        $stmt = $pdo->query(
            "SELECT id, message_kind, recipient_email, subject, body_text, attempts
             FROM mail_outbox
             WHERE (
                    status = 'queued'
                    OR (status = 'retry' AND next_attempt_at <= NOW())
                    OR (status = 'sending' AND updated_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE))
                   )
             ORDER BY next_attempt_at ASC, created_at ASC, id ASC
             LIMIT 1
             FOR UPDATE"
        );
        $mail = $stmt->fetch();
        if (!$mail) {
            $pdo->commit();
            return null;
        }

        $update = $pdo->prepare(
            "UPDATE mail_outbox
             SET status = 'sending',
                 attempts = attempts + 1,
                 next_attempt_at = DATE_ADD(NOW(), INTERVAL 15 MINUTE),
                 updated_at = NOW()
             WHERE id = ?"
        );
        $update->execute([(int) $mail['id']]);

        $pdo->commit();
        $mail['attempts'] = (int) $mail['attempts'] + 1;
        return $mail;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

function mail_queue_mark_sent(int $mailId): void
{
    $stmt = db()->prepare(
        "UPDATE mail_outbox
         SET status = 'sent',
             sent_at = NOW(),
             last_error = NULL,
             updated_at = NOW()
         WHERE id = ?"
    );
    $stmt->execute([$mailId]);
}

function mail_queue_mark_retry(int $mailId, int $attempts, string $reason): string
{
    $retryable = mail_transport_retryable();
    $status = ($retryable && $attempts < mail_queue_max_attempts()) ? 'retry' : 'failed';
    $nextAttemptAt = $status === 'retry'
        ? date('Y-m-d H:i:s', time() + mail_queue_retry_delay_seconds($attempts))
        : date('Y-m-d H:i:s');

    $stmt = db()->prepare(
        "UPDATE mail_outbox
         SET status = ?,
             last_error = ?,
             next_attempt_at = ?,
             updated_at = NOW()
         WHERE id = ?"
    );
    $error = function_exists('mb_substr') ? mb_substr($reason, 0, 2000) : substr($reason, 0, 2000);
    $stmt->execute([$status, $error, $nextAttemptAt, $mailId]);

    return $status;
}

function mail_queue_drain(int $limit = 10, int $timeBudgetSeconds = 15): array
{
    $limit = max(1, $limit);
    $timeBudgetSeconds = max(1, $timeBudgetSeconds);
    $deadline = microtime(true) + $timeBudgetSeconds;
    $stats = [
        'sent' => 0,
        'retry' => 0,
        'failed' => 0,
        'processed' => 0,
    ];

    while ($limit-- > 0 && microtime(true) < $deadline) {
        $mail = mail_queue_claim_next();
        if ($mail === null) {
            break;
        }

        $stats['processed']++;
        $ok = send_mail_message((string) $mail['recipient_email'], (string) $mail['subject'], (string) $mail['body_text']);
        if ($ok) {
            mail_queue_mark_sent((int) $mail['id']);
            $stats['sent']++;
            continue;
        }

        $status = mail_queue_mark_retry((int) $mail['id'], (int) $mail['attempts'], 'Mail delivery failed.');
        $stats[$status]++;
    }

    return $stats;
}

function send_mail_message(string $to, string $subject, string $bodyText): bool
{
    $to = trim($to);
    if ($to === '') {
        return false;
    }

    $subject = trim($subject);
    $bodyText = rtrim($bodyText);
    $smtpErrors = [];
    $provider = mail_provider();

    try {
        if ($provider === 'gmail_api') {
            if (mail_gmail_configured()) {
                return mail_gmail_send_message($to, $subject, $bodyText);
            }

            mail_smtp_log_failure('gmail-api', 'Gmail API credentials are missing.');
            return false;
        }

        if (mail_smtp_configured()) {
            $host = trim((string) env('MAIL_HOST', ''));
            $port = (int) env('MAIL_PORT', '587');
            $username = trim((string) env('MAIL_USERNAME', ''));
            $password = mail_normalize_password((string) env('MAIL_PASSWORD', ''));
            $encryption = strtolower(trim((string) env('MAIL_ENCRYPTION', 'tls')));
            $timeout = mail_timeout_seconds();
            $messageBody = mail_build_message($to, $subject, $bodyText);

            foreach (mail_smtp_candidates($host, $port, $encryption) as [$candidateHost, $candidatePort, $candidateEncryption]) {
                $transport = ($candidateEncryption === 'ssl' && $candidatePort > 0)
                    ? sprintf('ssl://%s:%d', $candidateHost, $candidatePort)
                    : sprintf('tcp://%s:%d', $candidateHost, $candidatePort);
                $context = stream_context_create([
                    'ssl' => [
                        'verify_peer' => mail_verify_peer(),
                        'verify_peer_name' => mail_verify_peer(),
                        'allow_self_signed' => !mail_verify_peer(),
                        'SNI_enabled' => true,
                        'peer_name' => $candidateHost,
                    ],
                ]);
                $socket = @stream_socket_client($transport, $errno, $errstr, $timeout, STREAM_CLIENT_CONNECT, $context);
                if (!$socket) {
                    $reason = sprintf('%s:%d (%s) connection failed: %s', $candidateHost, $candidatePort, $candidateEncryption, $errstr !== '' ? $errstr : 'unknown error');
                    $smtpErrors[] = $reason;
                    mail_smtp_log_failure('smtp', $reason);
                    continue;
                }

                try {
                    stream_set_timeout($socket, $timeout);
                    $helo = $_SERVER['SERVER_NAME'] ?? 'localhost';
                    mail_smtp_expect($socket, [220], 'SMTP greeting');
                    mail_smtp_send($socket, 'EHLO ' . $helo, [250], 'SMTP EHLO');

                    if ($candidateEncryption !== 'ssl' && $candidateEncryption !== 'none') {
                        mail_smtp_send($socket, 'STARTTLS', [220], 'SMTP STARTTLS');
                        if (!stream_socket_enable_crypto($socket, true, mail_smtp_crypto_method())) {
                            throw new RuntimeException('SMTP TLS negotiation failed.');
                        }
                        mail_smtp_send($socket, 'EHLO ' . $helo, [250], 'SMTP EHLO after STARTTLS');
                    }

                    if ($username !== '') {
                        mail_smtp_send($socket, 'AUTH LOGIN', [334], 'SMTP AUTH LOGIN');
                        mail_smtp_send($socket, base64_encode($username), [334], 'SMTP AUTH USERNAME');
                        mail_smtp_send($socket, base64_encode($password), [235], 'SMTP AUTH PASSWORD');
                    }

                    mail_smtp_send($socket, 'MAIL FROM:<' . $fromAddress . '>', [250], 'SMTP MAIL FROM');
                    mail_smtp_send($socket, 'RCPT TO:<' . $to . '>', [250, 251], 'SMTP RCPT TO');
                    mail_smtp_send($socket, 'DATA', [354], 'SMTP DATA');

                    $message = $messageBody . "\r\n.";
                    if (fwrite($socket, $message . "\r\n") === false) {
                        throw new RuntimeException('SMTP message write failed.');
                    }
                    mail_smtp_expect($socket, [250], 'SMTP message delivery');
                    mail_smtp_send($socket, 'QUIT', [221], 'SMTP QUIT');
                    return true;
                } catch (Throwable $e) {
                    $reason = sprintf('%s:%d (%s) %s', $candidateHost, $candidatePort, $candidateEncryption, $e->getMessage());
                    $smtpErrors[] = $reason;
                    mail_smtp_log_failure('smtp', $reason);
                } finally {
                    fclose($socket);
                }
            }
        }

        if (mail_allow_php_fallback()) {
            $fromAddress = mail_from_address();
            $fromName = mail_from_name();
            $headers = 'From: ' . mail_encode_header($fromName) . ' <' . $fromAddress . ">\r\n"
                . 'Reply-To: ' . $fromAddress . "\r\n"
                . 'MIME-Version: 1.0' . "\r\n"
                . 'Content-Type: text/plain; charset=UTF-8';
            return @mail($to, $subject, $bodyText, $headers);
        }

        if (!empty($smtpErrors)) {
            mail_smtp_log_failure('smtp-all', implode(' || ', $smtpErrors));
        }

        return false;
    } catch (\Throwable $e) {
        mail_smtp_log_failure('mail', $e->getMessage());
        return false;
    }
}

function generate_verification_otp(): string
{
    return str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
}

function verification_code_body(string $name, string $otp): string
{
    $safeName = trim($name) !== '' ? trim($name) : 'there';
    return implode("\n", [
        'Hi ' . $safeName . ',',
        '',
        'Your email verification code is: ' . $otp,
        '',
        'This code expires in 10 minutes.',
        'If you did not request this, you can ignore this message.',
        '',
        'Thanks,',
        mail_from_name(),
    ]);
}

function send_verification_code_mail(string $email, string $name, string $otp): bool
{
    $subject = 'Verify your email address';
    $bodyText = verification_code_body($name, $otp);
    if (mail_queue_enqueue('verification', $email, $subject, $bodyText)) {
        return true;
    }

    return send_mail_message($email, $subject, $bodyText);
}

function issue_email_verification_otp(int $userId, string $email, string $name): bool
{
    $otp = generate_verification_otp();
    $expiry = date('Y-m-d H:i:s', time() + 600);
    $stmt = db()->prepare(
        'UPDATE users
         SET email_verification_otp_hash = ?,
             email_verification_otp_expires_at = ?,
             email_verification_otp_sent_at = NOW(),
             email_verification_otp_attempts = 0
         WHERE id = ?'
    );
    $stmt->execute([password_hash($otp, PASSWORD_DEFAULT), $expiry, $userId]);

    return send_verification_code_mail($email, $name, $otp);
}

/**
 * Fire-and-forget email notification to the team.
 * No-op unless MAIL_ENABLED=true and NOTIFY_EMAIL is set in .env.
 * Always non-fatal — a mail failure must never break the API request.
 */
function notify(string $subject, string $bodyText): void
{
    if (!filter_var(env('MAIL_ENABLED', 'false'), FILTER_VALIDATE_BOOLEAN)) {
        return;
    }
    $to = trim((string) env('NOTIFY_EMAIL', ''));
    if ($to === '') {
        return;
    }
    if (mail_queue_enqueue('notification', $to, $subject, $bodyText)) {
        return;
    }

    try {
        send_mail_message($to, $subject, $bodyText);
    } catch (\Throwable $e) {
        // swallow — notifications are best-effort
    }
}
