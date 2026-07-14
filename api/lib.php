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

function text_length(string $value): int
{
    return function_exists('mb_strlen') ? mb_strlen($value) : strlen($value);
}

function normalize_text_field(string $value): string
{
    $trimmed = trim($value);
    return preg_replace('/\s+/', ' ', $trimmed) ?? $trimmed;
}

function require_text_field(string $value, string $label, int $minLength = 1): string
{
    $cleaned = normalize_text_field($value);
    if ($cleaned === '') {
        json(['error' => $label . ' is required.'], 422);
    }
    if (text_length($cleaned) < $minLength) {
        json(['error' => $label . ' must be at least ' . $minLength . ' characters.'], 422);
    }
    return $cleaned;
}

function require_name_field(string $value, string $label = 'Full name', int $minLength = 3): string
{
    return require_text_field($value, $label, $minLength);
}

function require_phone(string $phone, string $label = 'Phone number', int $minDigits = 7, int $maxDigits = 15): string
{
    $phone = trim($phone);
    if ($phone === '') {
        json(['error' => $label . ' is required.'], 422);
    }
    if (preg_match('/[A-Za-z]/', $phone)) {
        json(['error' => $label . ' must contain digits only.'], 422);
    }
    $digits = preg_replace('/\D+/', '', $phone) ?? '';
    $length = strlen($digits);
    if ($length < $minDigits || $length > $maxDigits) {
        json(['error' => $label . ' must be ' . $minDigits . ' to ' . $maxDigits . ' digits.'], 422);
    }
    return $digits;
}

/** Best-effort client IP ? honors X-Forwarded-For (first hop) then REMOTE_ADDR. */
function client_ip(): ?string
{
    $candidates = [];
    $xff = (string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? '');
    if ($xff !== '') {
        foreach (explode(',', $xff) as $part) {
            $candidates[] = trim($part);
        }
    }
    $candidates[] = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
    foreach ($candidates as $ip) {
        if ($ip !== '' && filter_var($ip, FILTER_VALIDATE_IP) !== false) {
            return substr($ip, 0, 45);
        }
    }
    return null;
}

/** Raw User-Agent string (truncated), or null. */
function client_user_agent(): ?string
{
    $ua = trim((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''));
    return $ua !== '' ? substr($ua, 0, 500) : null;
}

/** Currently logged-in user array, or null. */
function current_user(): ?array
{
    if (empty($_SESSION['uid'])) {
        return null;
    }
    try {
        $stmt = db()->prepare(
            'SELECT id, full_name, email, role, avatar_url, email_verified_at, approval_status,
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

/** Require a judge (or admin, for testing) or fail 403. */
function require_judge(): array
{
    $u = require_login();
    if (!in_array($u['role'], ['judge', 'admin', 'super_admin'], true)) {
        json(['error' => 'Judge access required.'], 403);
    }
    return $u;
}

/**
 * Admin "view as user" impersonation. The active session is swapped to the
 * target user while the original admin id is parked in the session so it can
 * be restored. current_user() then resolves to the impersonated user, so every
 * existing dashboard/endpoint renders exactly as that user would see it.
 */
function impersonation_active(): bool
{
    return !empty($_SESSION['impersonator_uid']);
}

/** The original admin behind an active impersonation, if any. */
function impersonator_user(): ?array
{
    $id = (int) ($_SESSION['impersonator_uid'] ?? 0);
    if ($id <= 0) {
        return null;
    }
    try {
        $stmt = db()->prepare('SELECT id, full_name, email, role FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    } catch (Throwable $e) {
        return null;
    }
}

/** Begin (or re-target) impersonation. Preserves the original admin id. */
function start_impersonation(int $adminId, int $targetId): void
{
    if (empty($_SESSION['impersonator_uid'])) {
        $_SESSION['impersonator_uid'] = $adminId;
    }
    $_SESSION['uid'] = $targetId;
}

/** Restore the original admin session. Returns false when not impersonating. */
function stop_impersonation(): bool
{
    if (empty($_SESSION['impersonator_uid'])) {
        return false;
    }
    $_SESSION['uid'] = (int) $_SESSION['impersonator_uid'];
    unset($_SESSION['impersonator_uid']);
    return true;
}

function admin_user_detail_payload(int $userId): ?array
{
    $stmt = db()->prepare(
        'SELECT u.id, u.full_name, u.email, u.role, u.email_verified_at, u.approval_status,
                u.approval_note, u.approval_reviewed_by_user_id, u.approval_reviewed_at,
                u.created_at, u.updated_at,
                rv.full_name AS approval_reviewed_by_name,
                rv.email AS approval_reviewed_by_email,
                rv.role AS approval_reviewed_by_role
         FROM users u
         LEFT JOIN users rv ON rv.id = u.approval_reviewed_by_user_id
         WHERE u.id = ?
         LIMIT 1'
    );
    $stmt->execute([$userId]);
    $user = $stmt->fetch();
    if (!$user) {
        return null;
    }

    $field = static function (string $label, mixed $value): array {
        if ($value === null || $value === '') {
            $value = '—';
        } elseif (is_bool($value)) {
            $value = $value ? 'Yes' : 'No';
        } elseif (is_array($value)) {
            $value = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }
        return ['label' => $label, 'value' => $value];
    };

    $section = static function (string $title, array $fields): array {
        return ['title' => $title, 'fields' => array_values($fields)];
    };

    $sections = [];
    $tables = [];

    $sections[] = $section('Account', [
        $field('Full Name', $user['full_name']),
        $field('Email', $user['email']),
        $field('Role', $user['role']),
        $field('Email Verified', $user['email_verified_at'] ?? null),
        $field('Created At', $user['created_at']),
        $field('Updated At', $user['updated_at'] ?? null),
    ]);

    $sections[] = $section('Approval', [
        $field('Status', $user['approval_status'] ?? null),
        $field('Note', $user['approval_note'] ?? null),
        $field('Reviewed By', trim((string) ($user['approval_reviewed_by_name'] ?? '')) !== ''
            ? $user['approval_reviewed_by_name'] . (
                trim((string) ($user['approval_reviewed_by_email'] ?? '')) !== ''
                    ? ' (' . $user['approval_reviewed_by_email'] . ')'
                    : ''
            )
            : null),
        $field('Reviewed Role', $user['approval_reviewed_by_role'] ?? null),
        $field('Reviewed At', $user['approval_reviewed_at'] ?? null),
    ]);

    $role = (string) ($user['role'] ?? '');

    if ($role === 'student') {
        $student = new_school_fetch_student_by_user_id($userId);
        if ($student) {
            $interviewCount = new_school_student_interview_count((int) $student['id']);
            $parent = new_school_fetch_parent_by_student_id((int) $student['id']);
            $school = !empty($student['school_id'])
                ? new_school_fetch_school_by_id((int) $student['school_id'])
                : new_school_fetch_school_by_name((string) ($student['school_name'] ?? ''));
            $teacher = !empty($student['teacher_id'])
                ? new_school_fetch_teacher_by_id((int) $student['teacher_id'])
                : null;
            $submission = new_school_fetch_submission_by_student_id((int) $student['id']);
            $winner = new_school_fetch_winner_by_student_id((int) $student['id']);

            $sections[] = $section('Student Registration', [
                $field('Participant ID', $student['participant_id']),
                $field('Username', $student['student_username']),
                $field('Age', $student['age']),
                $field('Date of Birth', $student['date_of_birth']),
                $field('Phone Number', $student['phone_number']),
                $field('Email', $student['email']),
                $field('Home Address', $student['home_address']),
                $field('School Name', $student['school_name']),
                $field('Grade Level', $student['grade_level']),
                $field('Parent Name', $student['parent_name']),
                $field('Parent Phone', $student['parent_phone']),
                $field('Parent Email', $student['parent_email']),
                $field('Parent Consent', $student['parent_consent_status']),
                $field('School Approval', $student['school_approval_status']),
                $field('Teacher Approval', $student['teacher_approval_status']),
                $field('Submission Status', $student['submission_status']),
                $field('Overall Status', $student['overall_status']),
            ]);

            if ($parent) {
                $sections[] = $section('Parent Details', [
                    $field('Parent Full Name', $parent['parent_full_name']),
                    $field('Relationship', $parent['relationship_to_student']),
                    $field('Phone Number', $parent['phone_number']),
                    $field('Email', $parent['email']),
                    $field('Home Address', $parent['home_address']),
                    $field('Consented At', $parent['consented_at'] ?? null),
                    $field('Approved At', $parent['approved_at'] ?? null),
                ]);
            }

            if ($school) {
                $sections[] = $section('School Link', [
                    $field('School Name', $school['school_name']),
                    $field('District', $school['school_district']),
                    $field('Main Phone', $school['main_phone']),
                    $field('Principal', $school['principal_name']),
                    $field('Administrator', $school['administrator_name']),
                    $field('Administrator Email', $school['administrator_email']),
                    $field('Administrator Phone', $school['administrator_phone']),
                    $field('Status', $school['status']),
                ]);
            }

            if ($teacher) {
                $sections[] = $section('Teacher Link', [
                    $field('Teacher Name', $teacher['teacher_full_name']),
                    $field('School Email', $teacher['school_email']),
                    $field('Phone Number', $teacher['phone_number']),
                    $field('Department', $teacher['role_department']),
                    $field('Grade Level Supported', $teacher['grade_level_supported']),
                    $field('Linked School', $teacher['linked_school_name'] ?? null),
                    $field('Status', $teacher['status']),
                ]);
            }

            $sections[] = $section('Progress', [
                $field('Interview Count', $interviewCount),
                $field('Submission Ready', !new_school_submission_is_locked($student, $interviewCount)),
                $field('Winner', $winner ? $winner['place'] . ' place' : '—'),
            ]);

            if ($submission) {
                $sections[] = $section('Submission', [
                    $field('Status', $submission['status']),
                    $field('Problem Identified', $submission['problem_identified']),
                    $field('Why It Matters', $submission['why_it_matters']),
                    $field('Proposed Solution', $submission['proposed_solution']),
                    $field('How It Helps', $submission['how_it_helps']),
                    $field('Expected Impact', $submission['expected_impact']),
                    $field('Video URL', $submission['video_url'] ?? null),
                    $field('Written URL', $submission['written_url'] ?? null),
                    $field('Reviewed By', $submission['reviewer_name'] ?? null),
                    $field('Reviewed At', $submission['reviewed_at'] ?? null),
                ]);
            }

            $interviews = array_map(
                static fn(array $row): array => [
                    'visit_number' => (int) ($row['visit_number'] ?? 0),
                    'business_name' => (string) ($row['business_name'] ?? ''),
                    'owner_name' => (string) ($row['owner_name'] ?? ''),
                    'business_category' => (string) ($row['business_category'] ?? ''),
                    'date_of_visit' => (string) ($row['date_of_visit'] ?? ''),
                    'main_challenge' => (string) ($row['main_challenge'] ?? ''),
                ],
                array_slice(new_school_fetch_student_interviews((int) $student['id']), 0, 10)
            );
            if ($interviews !== []) {
                $tables[] = [
                    'title' => 'Business Interviews',
                    'columns' => ['Visit', 'Business', 'Owner', 'Category', 'Date', 'Challenge'],
                    'rows' => $interviews,
                ];
            }

            $approvals = new_school_fetch_student_approvals((int) $student['id']);
            $approvalRows = array_values(array_filter([
                $approvals['school'] ? [
                    'approval_type' => 'School',
                    'status' => (string) ($approvals['school']['status'] ?? ''),
                    'reviewer_name' => (string) ($approvals['school']['reviewer_name'] ?? ''),
                    'reviewer_role' => (string) ($approvals['school']['reviewer_role'] ?? ''),
                    'approved_at' => (string) ($approvals['school']['approved_at'] ?? ''),
                    'notes' => (string) ($approvals['school']['notes'] ?? ''),
                ] : null,
                $approvals['teacher'] ? [
                    'approval_type' => 'Teacher',
                    'status' => (string) ($approvals['teacher']['status'] ?? ''),
                    'reviewer_name' => (string) ($approvals['teacher']['reviewer_name'] ?? ''),
                    'reviewer_role' => (string) ($approvals['teacher']['reviewer_role'] ?? ''),
                    'approved_at' => (string) ($approvals['teacher']['approved_at'] ?? ''),
                    'notes' => (string) ($approvals['teacher']['notes'] ?? ''),
                ] : null,
            ]));
            if ($approvalRows !== []) {
                $tables[] = [
                    'title' => 'School / Teacher Approvals',
                    'columns' => ['Type', 'Status', 'Reviewer', 'Role', 'Approved At', 'Notes'],
                    'rows' => $approvalRows,
                ];
            }
        }
    } elseif ($role === 'parent') {
        $parent = new_school_fetch_parent_by_user_id($userId);
        if ($parent) {
            $student = new_school_fetch_student_by_id((int) $parent['student_id']);
            $sections[] = $section('Parent Registration', [
                $field('Parent Full Name', $parent['parent_full_name']),
                $field('Relationship', $parent['relationship_to_student']),
                $field('Phone Number', $parent['phone_number']),
                $field('Email', $parent['email']),
                $field('Home Address', $parent['home_address']),
                $field('Consented At', $parent['consented_at'] ?? null),
                $field('Approved At', $parent['approved_at'] ?? null),
            ]);
            if ($student) {
                $sections[] = $section('Linked Student', [
                    $field('Student Name', $student['full_name']),
                    $field('Participant ID', $student['participant_id']),
                    $field('School Name', $student['school_name']),
                    $field('Grade Level', $student['grade_level']),
                    $field('Parent Consent', $student['parent_consent_status']),
                    $field('School Approval', $student['school_approval_status']),
                    $field('Teacher Approval', $student['teacher_approval_status']),
                    $field('Submission Status', $student['submission_status']),
                    $field('Overall Status', $student['overall_status']),
                ]);
                $sections[] = $section('Progress', [
                    $field('Interview Count', new_school_student_interview_count((int) $student['id'])),
                    $field('Submission Ready', !new_school_submission_is_locked($student, new_school_student_interview_count((int) $student['id']))),
                ]);
            }
        }
    } elseif ($role === 'school') {
        $school = new_school_fetch_school_by_user_id($userId);
        if ($school) {
            $sections[] = $section('School Registration', [
                $field('School Name', $school['school_name']),
                $field('School Address', $school['school_address']),
                $field('School District', $school['school_district']),
                $field('Main Phone', $school['main_phone']),
                $field('Principal Name', $school['principal_name']),
                $field('Administrator Name', $school['administrator_name']),
                $field('Administrator Email', $school['administrator_email']),
                $field('Administrator Phone', $school['administrator_phone']),
                $field('Status', $school['status']),
            ]);

            $assignedStudents = array_map(
                static fn(array $row): array => [
                    'name' => (string) ($row['full_name'] ?? ''),
                    'grade_level' => (string) ($row['grade_level'] ?? ''),
                    'overall_status' => (string) ($row['overall_status'] ?? ''),
                    'parent_consent_status' => (string) ($row['parent_consent_status'] ?? ''),
                    'school_approval_status' => (string) ($row['school_approval_status'] ?? ''),
                    'teacher_approval_status' => (string) ($row['teacher_approval_status'] ?? ''),
                    'submission_status' => (string) ($row['submission_status'] ?? ''),
                ],
                array_slice(new_school_fetch_students_for_school($school), 0, 12)
            );
            if ($assignedStudents !== []) {
                $tables[] = [
                    'title' => 'Assigned Students',
                    'columns' => ['Name', 'Grade', 'Overall Status', 'Parent', 'School', 'Teacher', 'Submission'],
                    'rows' => $assignedStudents,
                ];
            }
        }
    } elseif ($role === 'teacher') {
        $teacher = new_school_fetch_teacher_by_user_id($userId);
        if ($teacher) {
            $sections[] = $section('Teacher Registration', [
                $field('Teacher Name', $teacher['teacher_full_name']),
                $field('School Email', $teacher['school_email']),
                $field('Phone Number', $teacher['phone_number']),
                $field('Department', $teacher['role_department']),
                $field('Grade Level Supported', $teacher['grade_level_supported']),
                $field('Linked School', $teacher['linked_school_name'] ?? null),
                $field('Status', $teacher['status']),
            ]);

            $assignedStudents = array_map(
                static fn(array $row): array => [
                    'name' => (string) ($row['full_name'] ?? ''),
                    'grade_level' => (string) ($row['grade_level'] ?? ''),
                    'overall_status' => (string) ($row['overall_status'] ?? ''),
                    'parent_consent_status' => (string) ($row['parent_consent_status'] ?? ''),
                    'school_approval_status' => (string) ($row['school_approval_status'] ?? ''),
                    'teacher_approval_status' => (string) ($row['teacher_approval_status'] ?? ''),
                    'submission_status' => (string) ($row['submission_status'] ?? ''),
                ],
                array_slice(new_school_fetch_students_for_teacher($teacher), 0, 12)
            );
            if ($assignedStudents !== []) {
                $tables[] = [
                    'title' => 'Assigned Students',
                    'columns' => ['Name', 'Grade', 'Overall Status', 'Parent', 'School', 'Teacher', 'Submission'],
                    'rows' => $assignedStudents,
                ];
            }
        }
    }

    return [
        'user' => $user,
        'sections' => $sections,
        'tables' => $tables,
    ];
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

    // First-party page-view telemetry is a fire-and-forget beacon (fires on every
    // route change, sometimes before the CSRF token is bootstrapped). It records
    // nothing of consequence and already swallows its own errors — exempt it from
    // CSRF so it never 500s a normal page load.
    $route = trim((string) ($_GET['r'] ?? ''), '/');
    if ($route === 'analytics/track') {
        return;
    }

    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if ($token === '' || !hash_equals(csrf_token(), $token)) {
        // 403 (not 419): Apache rewrites the non-standard 419 status to 500, which
        // defeats the client's CSRF-refresh retry. The `csrf` marker lets the client
        // recognise this as a token failure and re-bootstrap + retry.
        json(['error' => 'Invalid CSRF token.', 'csrf' => true], 403);
    }
}

/* ---- Website traffic tracking (first-party page views) ---- */
function site_visits_ensure_schema(): void
{
    static $ready = false;
    if ($ready) {
        return;
    }
    db()->exec(
        "CREATE TABLE IF NOT EXISTS site_visits (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            visitor_token VARCHAR(64) NOT NULL,
            user_id INT DEFAULT NULL,
            path VARCHAR(512) NOT NULL,
            referrer VARCHAR(512) DEFAULT NULL,
            user_agent VARCHAR(255) DEFAULT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_visits_created (created_at),
            INDEX idx_visits_visitor (visitor_token),
            INDEX idx_visits_user (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    // Self-heal: add user_id to older installs that predate the logged-in linkage.
    try {
        $has = (int) db()->query("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'site_visits' AND COLUMN_NAME = 'user_id'")->fetchColumn();
        if ($has === 0) {
            db()->exec("ALTER TABLE site_visits ADD COLUMN user_id INT DEFAULT NULL, ADD INDEX idx_visits_user (user_id)");
        }
    } catch (\Throwable $e) { /* best-effort */ }
    $ready = true;
}

/* ---------- Community media gallery (public + admin) ---------- */

/** Self-healing schema for the community gallery submission + file tables. */
function gallery_ensure_schema(): void
{
    static $ready = false;
    if ($ready) return;
    $pdo = db();
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS gallery_submissions (
            id             INT AUTO_INCREMENT PRIMARY KEY,
            user_id        INT DEFAULT NULL,
            submitter_name VARCHAR(160) NOT NULL,
            submitter_email VARCHAR(160) NOT NULL,
            organization   VARCHAR(180) DEFAULT NULL,
            message        TEXT DEFAULT NULL,
            overall_status ENUM('pending_review','partially_approved','approved','rejected') NOT NULL DEFAULT 'pending_review',
            created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_gallery_submissions_status (overall_status, created_at),
            INDEX idx_gallery_submissions_user (user_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS gallery_submission_files (
            id               INT AUTO_INCREMENT PRIMARY KEY,
            submission_id    INT NOT NULL,
            original_name    VARCHAR(255) NOT NULL,
            display_title    VARCHAR(180) NOT NULL,
            file_url         VARCHAR(255) NOT NULL,
            mime_type        VARCHAR(120) NOT NULL,
            media_kind       ENUM('image','video') NOT NULL,
            size_bytes       BIGINT NOT NULL DEFAULT 0,
            approval_status  ENUM('pending_review','approved','rejected') NOT NULL DEFAULT 'pending_review',
            reviewed_by_user_id INT DEFAULT NULL,
            reviewed_by_name VARCHAR(160) DEFAULT NULL,
            reviewed_at      TIMESTAMP NULL DEFAULT NULL,
            approved_at      TIMESTAMP NULL DEFAULT NULL,
            rejected_at      TIMESTAMP NULL DEFAULT NULL,
            created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_gallery_files_submission (submission_id, created_at),
            INDEX idx_gallery_files_status (approval_status, media_kind, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $ready = true;
}

/** Build one admin gallery row: the submission fields + its already-formatted files. */
function gallery_admin_submission_row(array $s, array $files): array
{
    return [
        'id'              => (int) $s['id'],
        'user_id'         => isset($s['user_id']) && $s['user_id'] !== null ? (int) $s['user_id'] : null,
        'submitter_name'  => (string) $s['submitter_name'],
        'submitter_email' => (string) $s['submitter_email'],
        'organization'    => ($s['organization'] ?? '') !== '' ? (string) $s['organization'] : null,
        'message'         => ($s['message'] ?? '') !== '' ? (string) $s['message'] : null,
        'overall_status'  => (string) $s['overall_status'],
        'created_at'      => $s['created_at'] ?? null,
        'updated_at'      => $s['updated_at'] ?? null,
        'files'           => $files,
    ];
}

/** Public gallery payload: approved image + video files with contributor credit. */
function gallery_public_payload(): array
{
    gallery_ensure_schema();
    $rows = db()->query(
        'SELECT f.id, f.submission_id, f.display_title, f.original_name, f.file_url, f.mime_type,
                f.media_kind, f.size_bytes, s.submitter_name AS credit_name, s.organization AS credit_organization,
                s.created_at AS submitted_at, f.approved_at
         FROM gallery_submission_files f
         JOIN gallery_submissions s ON s.id = f.submission_id
         WHERE f.approval_status = "approved"
         ORDER BY f.approved_at DESC, f.id DESC'
    )->fetchAll() ?: [];
    $items = array_map(static fn(array $r): array => [
        'id'                  => (int) $r['id'],
        'submission_id'       => (int) $r['submission_id'],
        'display_title'       => (string) $r['display_title'],
        'original_name'       => (string) $r['original_name'],
        'file_url'            => (string) $r['file_url'],
        'mime_type'           => (string) $r['mime_type'],
        'media_kind'          => (string) $r['media_kind'],
        'size_bytes'          => (int) $r['size_bytes'],
        'credit_name'         => (string) $r['credit_name'],
        'credit_organization' => ($r['credit_organization'] ?? '') !== '' ? (string) $r['credit_organization'] : null,
        'submitted_at'        => $r['submitted_at'] ?? null,
        'approved_at'         => $r['approved_at'] ?? null,
    ], $rows);
    return ['items' => $items];
}

/** Record one page view. Best-effort: callers swallow errors so tracking never breaks a page. */
function site_visits_record(string $path, string $visitorToken, ?string $referrer, ?string $userAgent, ?int $userId = null): void
{
    $path = trim($path);
    $visitorToken = trim($visitorToken);
    if ($path === '' || $visitorToken === '') {
        return;
    }
    site_visits_ensure_schema();
    $stmt = db()->prepare('INSERT INTO site_visits (visitor_token, user_id, path, referrer, user_agent) VALUES (?, ?, ?, ?, ?)');
    $stmt->execute([
        substr($visitorToken, 0, 64),
        $userId ?: null,
        substr($path, 0, 512),
        ($referrer !== null && $referrer !== '') ? substr($referrer, 0, 512) : null,
        ($userAgent !== null && $userAgent !== '') ? substr($userAgent, 0, 255) : null,
    ]);
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

function storefront_inventory_defaults(): array
{
    $shipNow = 'Ships in 2-4 business days from the FC collection team.';
    $shipSoon = 'Preview item only. Fulfillment timing is announced at launch.';

    return [
        'hoodie-legacy' => [
            'name' => 'Founder Hoodie - Legacy Black',
            'category' => 'Hoodies',
            'tagline' => 'Heavyweight fleece built for statement days and everyday wear.',
            'description' => 'Heavyweight fleece hoodie with the embroidered FC emblem.',
            'details' => 'A premium hoodie designed to carry the Frantz Coutard signature look into daily rotation. It blends a clean front presentation with a substantial feel that fits the collection\'s purpose-driven identity.',
            'feature_list' => implode("\n", ['Heavyweight fleece body', 'Embroidered FC emblem', 'Relaxed everyday fit', 'Core collection staple']),
            'spec_list' => implode("\n", ['Category: Hoodie', 'Fit: Relaxed', 'Finish: Embroidered front logo', 'Collection: Core legacy line']),
            'shipping_note' => $shipNow,
            'image' => '/assets/merch-hoodie.webp',
            'price' => 68.0,
            'stock' => 24,
            'threshold' => 5,
            'restock_note' => 'Core collection stock',
            'visibility' => 'live',
            'sort_order' => 1,
        ],
        'tee-emblem' => [
            'name' => 'Premium Tee - FC Emblem',
            'category' => 'T-Shirts',
            'tagline' => 'A clean everyday tee with the FC emblem front and center.',
            'description' => 'Soft cotton tee with the FC emblem and an everyday fit.',
            'details' => 'This foundational tee keeps the collection simple, sharp, and wearable. It is built for repeat wear and anchors the merch line with a minimal brand-first statement.',
            'feature_list' => implode("\n", ['Soft cotton feel', 'Signature FC emblem', 'Everyday fit', 'Easy layering piece']),
            'spec_list' => implode("\n", ['Category: T-Shirt', 'Fit: Everyday standard', 'Style: Minimal front emblem', 'Collection: Core legacy line']),
            'shipping_note' => $shipNow,
            'image' => '/assets/merch-tee.webp',
            'price' => 34.0,
            'stock' => 48,
            'threshold' => 8,
            'restock_note' => 'Core collection stock',
            'visibility' => 'live',
            'sort_order' => 2,
        ],
        'cap-gold' => [
            'name' => 'Signature Cap - Gold FC',
            'category' => 'Caps',
            'tagline' => 'Structured cap with a gold monogram finish.',
            'description' => 'Structured cap with gold FC monogram and adjustable fit.',
            'details' => 'A crisp cap created for community events, travel, and everyday styling. The gold FC monogram gives the piece a more elevated look without losing versatility.',
            'feature_list' => implode("\n", ['Gold FC monogram', 'Structured crown', 'Adjustable fit', 'Easy everyday styling']),
            'spec_list' => implode("\n", ['Category: Cap', 'Fit: Adjustable', 'Style: Gold monogram front', 'Collection: Core legacy line']),
            'shipping_note' => $shipNow,
            'image' => '/assets/merch-cap.webp',
            'price' => 28.0,
            'stock' => 40,
            'threshold' => 6,
            'restock_note' => 'Core collection stock',
            'visibility' => 'live',
            'sort_order' => 3,
        ],
        'book-nts' => [
            'name' => 'From Nothing to Something - Hardcover',
            'category' => 'Books',
            'tagline' => 'A founder story built around resilience, purpose, and momentum.',
            'description' => 'Hardcover guide to the From Nothing to Something story.',
            'details' => 'A hardcover companion for readers who want the deeper founder narrative behind the ecosystem. It sits in the collection as both a story object and a conversation starter.',
            'feature_list' => implode("\n", ['Hardcover format', 'Founder story focus', 'Display-worthy edition', 'Gift-ready piece']),
            'spec_list' => implode("\n", ['Category: Book', 'Format: Hardcover', 'Theme: Founder journey', 'Collection: Reading line']),
            'shipping_note' => $shipNow,
            'image' => '/assets/brand-signature-white.webp',
            'price' => 24.0,
            'stock' => 64,
            'threshold' => 10,
            'restock_note' => 'Core collection stock',
            'visibility' => 'live',
            'sort_order' => 4,
        ],
        'pin-ltd' => [
            'name' => 'Limited Edition FC Lapel Pin',
            'category' => 'Collectibles',
            'tagline' => 'A small collectible piece for launch supporters and loyal buyers.',
            'description' => 'Gold enamel FC pin for collectors and launch supporters.',
            'details' => 'A collectible accessory designed for supporters who want a smaller-format piece from the collection. It works as a subtle brand signal across jackets, bags, and display setups.',
            'feature_list' => implode("\n", ['Gold enamel finish', 'Collector-friendly piece', 'Compact accessory format', 'Supporter favorite']),
            'spec_list' => implode("\n", ['Category: Collectible', 'Finish: Enamel', 'Use: Jacket, bag, display', 'Collection: Accessories line']),
            'shipping_note' => $shipNow,
            'image' => '/assets/merch-collectible.webp',
            'price' => 18.0,
            'stock' => 70,
            'threshold' => 10,
            'restock_note' => 'Core collection stock',
            'visibility' => 'live',
            'sort_order' => 5,
        ],
        'hoodie-c2l' => [
            'name' => 'From Community to Legacy Hoodie',
            'category' => 'Hoodies',
            'tagline' => 'A future drop built around the collection\'s legacy theme.',
            'description' => 'Premium brushed hoodie reserved for a future drop.',
            'details' => 'This upcoming hoodie is positioned as a premium follow-up piece for supporters who want the next visual chapter in the FC collection. It is visible now as a preview-only drop.',
            'feature_list' => implode("\n", ['Premium brushed finish', 'Legacy theme direction', 'Future public drop', 'Preview-only visibility']),
            'spec_list' => implode("\n", ['Category: Hoodie', 'Status: Upcoming', 'Collection: Future drop', 'Visibility: Preview only']),
            'shipping_note' => $shipSoon,
            'image' => '/assets/merch-hoodie.webp',
            'price' => 72.0,
            'stock' => 18,
            'threshold' => 4,
            'restock_note' => 'Upcoming drop',
            'visibility' => 'upcoming',
            'sort_order' => 6,
        ],
        'tee-tech' => [
            'name' => 'Technology For Good Tee',
            'category' => 'T-Shirts',
            'tagline' => 'A mission-first tee previewing the tech-for-good line.',
            'description' => 'A future tee drop centered on the tech-for-good mission.',
            'details' => 'An upcoming release dedicated to the platform\'s technology-for-good message. It is designed as a public preview item until the main release window opens.',
            'feature_list' => implode("\n", ['Mission-led messaging', 'Future tee release', 'Public preview status', 'Collection expansion piece']),
            'spec_list' => implode("\n", ['Category: T-Shirt', 'Status: Upcoming', 'Theme: Technology for good', 'Visibility: Preview only']),
            'shipping_note' => $shipSoon,
            'image' => '/assets/merch-tee.webp',
            'price' => 32.0,
            'stock' => 44,
            'threshold' => 8,
            'restock_note' => 'Upcoming drop',
            'visibility' => 'upcoming',
            'sort_order' => 7,
        ],
        'tee-vision' => [
            'name' => 'Visionary Tee',
            'category' => 'T-Shirts',
            'tagline' => 'A statement piece reserved for a later release window.',
            'description' => 'Statement tee reserved for a later release window.',
            'details' => 'A future statement tee for supporters who prefer a louder visual from the collection. It remains visible as a preview so the line can feel more complete before launch.',
            'feature_list' => implode("\n", ['Statement-forward graphic direction', 'Future release item', 'Preview-only storefront', 'Built for the next drop window']),
            'spec_list' => implode("\n", ['Category: T-Shirt', 'Status: Upcoming', 'Style: Statement piece', 'Visibility: Preview only']),
            'shipping_note' => $shipSoon,
            'image' => '/assets/merch-tee.webp',
            'price' => 30.0,
            'stock' => 36,
            'threshold' => 6,
            'restock_note' => 'Upcoming drop',
            'visibility' => 'upcoming',
            'sort_order' => 8,
        ],
        'cap-builder' => [
            'name' => 'Community Builder Cap',
            'category' => 'Caps',
            'tagline' => 'A future community release built around clean cap styling.',
            'description' => 'Structured cap saved for a future community release.',
            'details' => 'An upcoming cap that extends the accessories line with a community-focused angle. It is staged as a preview product until the release date is locked.',
            'feature_list' => implode("\n", ['Structured cap profile', 'Community-focused drop', 'Future release item', 'Preview-only availability']),
            'spec_list' => implode("\n", ['Category: Cap', 'Status: Upcoming', 'Collection: Accessories expansion', 'Visibility: Preview only']),
            'shipping_note' => $shipSoon,
            'image' => '/assets/merch-cap.webp',
            'price' => 26.0,
            'stock' => 32,
            'threshold' => 5,
            'restock_note' => 'Upcoming drop',
            'visibility' => 'upcoming',
            'sort_order' => 9,
        ],
        'book-blueprint' => [
            'name' => 'The Legacy Blueprint - eBook',
            'category' => 'Books',
            'tagline' => 'A future digital guide for readers who want the playbook.',
            'description' => 'Digital companion guide for a future resource release.',
            'details' => 'A digital companion resource previewed in the storefront for future launch planning. It is intended for buyers who want a more practical founder-framework resource.',
            'feature_list' => implode("\n", ['Digital-first format', 'Founder playbook direction', 'Future release resource', 'Preview-only visibility']),
            'spec_list' => implode("\n", ['Category: Book', 'Format: eBook', 'Status: Upcoming', 'Visibility: Preview only']),
            'shipping_note' => 'Digital delivery instructions will be shared at launch.',
            'image' => '/assets/brand-signature-white.webp',
            'price' => 14.0,
            'stock' => 96,
            'threshold' => 12,
            'restock_note' => 'Upcoming drop',
            'visibility' => 'upcoming',
            'sort_order' => 10,
        ],
        'print-signed' => [
            'name' => 'Signed Founder\'s Print',
            'category' => 'Art Prints',
            'tagline' => 'A premium collector print reserved for a later release.',
            'description' => 'Signed founder print reserved for a premium future drop.',
            'details' => 'A premium art-print style collectible created for supporters who want a display-focused piece from the brand. It stays preview-only until the signed release is scheduled.',
            'feature_list' => implode("\n", ['Signed print concept', 'Collector-focused release', 'Premium future drop', 'Display-ready item']),
            'spec_list' => implode("\n", ['Category: Art Print', 'Status: Upcoming', 'Collection: Premium drop', 'Visibility: Preview only']),
            'shipping_note' => $shipSoon,
            'image' => '/assets/brand-signature-white.webp',
            'price' => 48.0,
            'stock' => 16,
            'threshold' => 4,
            'restock_note' => 'Upcoming drop',
            'visibility' => 'upcoming',
            'sort_order' => 11,
        ],
    ];
}

function storefront_inventory_has_column(string $column): bool
{
    static $cache = [];
    if (array_key_exists($column, $cache)) {
        return $cache[$column];
    }

    try {
        $stmt = db()->prepare(
            'SELECT COUNT(*)
             FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = ?
               AND COLUMN_NAME = ?'
        );
        $stmt->execute(['store_inventory', $column]);
        $cache[$column] = (int) $stmt->fetchColumn() > 0;
    } catch (Throwable $e) {
        $cache[$column] = false;
    }

    return $cache[$column];
}

function storefront_ensure_inventory_catalog_schema(): void
{
    static $ready = false;
    if ($ready) {
        return;
    }

    db()->exec(
        "CREATE TABLE IF NOT EXISTS store_inventory (
            product_id VARCHAR(40) PRIMARY KEY,
            name VARCHAR(160) DEFAULT NULL,
            category VARCHAR(80) DEFAULT NULL,
            tagline VARCHAR(180) DEFAULT NULL,
            description TEXT DEFAULT NULL,
            details TEXT DEFAULT NULL,
            feature_list TEXT DEFAULT NULL,
            spec_list TEXT DEFAULT NULL,
            shipping_note VARCHAR(180) DEFAULT NULL,
            image VARCHAR(255) DEFAULT NULL,
            price DECIMAL(10,2) DEFAULT NULL,
            stock INT NOT NULL DEFAULT 0,
            low_stock_threshold INT NOT NULL DEFAULT 5,
            restock_note VARCHAR(180) DEFAULT NULL,
            visibility ENUM('live','upcoming','hidden') NOT NULL DEFAULT 'live',
            sort_order INT NOT NULL DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    db()->exec(
        "CREATE TABLE IF NOT EXISTS store_inventory_state (
            state_key VARCHAR(64) PRIMARY KEY,
            state_value VARCHAR(255) DEFAULT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $columns = [
        'name' => "ALTER TABLE store_inventory ADD COLUMN name VARCHAR(160) DEFAULT NULL AFTER product_id",
        'category' => "ALTER TABLE store_inventory ADD COLUMN category VARCHAR(80) DEFAULT NULL AFTER name",
        'tagline' => "ALTER TABLE store_inventory ADD COLUMN tagline VARCHAR(180) DEFAULT NULL AFTER category",
        'description' => "ALTER TABLE store_inventory ADD COLUMN description TEXT DEFAULT NULL AFTER tagline",
        'details' => "ALTER TABLE store_inventory ADD COLUMN details TEXT DEFAULT NULL AFTER description",
        'feature_list' => "ALTER TABLE store_inventory ADD COLUMN feature_list TEXT DEFAULT NULL AFTER details",
        'spec_list' => "ALTER TABLE store_inventory ADD COLUMN spec_list TEXT DEFAULT NULL AFTER feature_list",
        'shipping_note' => "ALTER TABLE store_inventory ADD COLUMN shipping_note VARCHAR(180) DEFAULT NULL AFTER spec_list",
        'image' => "ALTER TABLE store_inventory ADD COLUMN image VARCHAR(255) DEFAULT NULL AFTER shipping_note",
        'price' => "ALTER TABLE store_inventory ADD COLUMN price DECIMAL(10,2) DEFAULT NULL AFTER image",
        'visibility' => "ALTER TABLE store_inventory ADD COLUMN visibility ENUM('live','upcoming','hidden') NOT NULL DEFAULT 'live' AFTER restock_note",
        'sort_order' => "ALTER TABLE store_inventory ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER visibility",
    ];

    foreach ($columns as $column => $sql) {
        if (!storefront_inventory_has_column($column)) {
            db()->exec($sql);
        }
    }

    $ready = true;
}

function storefront_inventory_has_catalog_columns(): bool
{
    storefront_ensure_inventory_catalog_schema();
    return storefront_inventory_has_column('visibility');
}

function storefront_inventory_seed_marker_exists(?PDO $pdo = null): bool
{
    $pdo ??= db();
    storefront_ensure_inventory_catalog_schema();
    $stmt = $pdo->prepare('SELECT 1 FROM store_inventory_state WHERE state_key = ? LIMIT 1');
    $stmt->execute(['defaults_seeded']);
    return (bool) $stmt->fetchColumn();
}

function storefront_mark_inventory_seeded(?PDO $pdo = null): void
{
    $pdo ??= db();
    storefront_ensure_inventory_catalog_schema();
    $stmt = $pdo->prepare(
        'INSERT INTO store_inventory_state (state_key, state_value)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE state_value = VALUES(state_value)'
    );
    $stmt->execute(['defaults_seeded', '1']);
}

function storefront_seed_inventory_defaults(?PDO $pdo = null): void
{
    $pdo ??= db();
    storefront_ensure_inventory_catalog_schema();
    if (storefront_inventory_seed_marker_exists($pdo)) {
        return;
    }

    $countStmt = $pdo->query('SELECT COUNT(*) FROM store_inventory');
    if ($countStmt && (int) $countStmt->fetchColumn() > 0) {
        storefront_mark_inventory_seeded($pdo);
        return;
    }

    $defaults = storefront_inventory_defaults();

    $seed = $pdo->prepare(
        'INSERT IGNORE INTO store_inventory
           (product_id, name, category, tagline, description, details, feature_list, spec_list, shipping_note, image, price, stock, low_stock_threshold, restock_note, visibility, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    foreach ($defaults as $productId => $cfg) {
        $seed->execute([
            $productId,
            $cfg['name'] ?? null,
            $cfg['category'] ?? null,
            $cfg['tagline'] ?? null,
            $cfg['description'] ?? null,
            $cfg['details'] ?? null,
            $cfg['feature_list'] ?? null,
            $cfg['spec_list'] ?? null,
            $cfg['shipping_note'] ?? null,
            $cfg['image'] ?? null,
            (float) ($cfg['price'] ?? 0),
            (int) ($cfg['stock'] ?? 0),
            (int) ($cfg['threshold'] ?? 5),
            $cfg['restock_note'] ?? null,
            $cfg['visibility'] ?? 'live',
            (int) ($cfg['sort_order'] ?? 0),
        ]);
    }

    storefront_mark_inventory_seeded($pdo);
}

function storefront_inventory_rows(bool $includeHidden = false): array
{
    storefront_seed_inventory_defaults();
    $defaults = storefront_inventory_defaults();
    $rows = [];

    $sql = 'SELECT product_id, name, category, tagline, description, details, feature_list, spec_list, shipping_note,
                   image, price, stock, low_stock_threshold, restock_note, visibility, sort_order, updated_at
            FROM store_inventory';
    if (!$includeHidden) {
        $sql .= ' WHERE visibility <> "hidden"';
    }
    $sql .= ' ORDER BY sort_order ASC, product_id ASC';

    foreach (db()->query($sql)->fetchAll() as $row) {
        $productId = (string) $row['product_id'];
        $meta = $defaults[$productId] ?? [];
        $name = trim((string) ($row['name'] ?? '')) !== '' ? (string) $row['name'] : (string) ($meta['name'] ?? $productId);
        $category = trim((string) ($row['category'] ?? '')) !== '' ? (string) $row['category'] : (string) ($meta['category'] ?? '');
        $tagline = trim((string) ($row['tagline'] ?? '')) !== '' ? (string) $row['tagline'] : ($meta['tagline'] ?? null);
        $description = trim((string) ($row['description'] ?? '')) !== '' ? (string) $row['description'] : ($meta['description'] ?? null);
        $details = trim((string) ($row['details'] ?? '')) !== '' ? (string) $row['details'] : ($meta['details'] ?? null);
        $featureList = trim((string) ($row['feature_list'] ?? '')) !== '' ? (string) $row['feature_list'] : ($meta['feature_list'] ?? null);
        $specList = trim((string) ($row['spec_list'] ?? '')) !== '' ? (string) $row['spec_list'] : ($meta['spec_list'] ?? null);
        $shippingNote = trim((string) ($row['shipping_note'] ?? '')) !== '' ? (string) $row['shipping_note'] : ($meta['shipping_note'] ?? null);
        $image = trim((string) ($row['image'] ?? '')) !== '' ? (string) $row['image'] : ($meta['image'] ?? null);
        $price = $row['price'] !== null && $row['price'] !== '' ? (float) $row['price'] : (float) ($meta['price'] ?? 0);
        $stock = (int) ($row['stock'] ?? 0);
        $threshold = (int) ($row['low_stock_threshold'] ?? ($meta['threshold'] ?? 5));
        $visibility = (string) ($row['visibility'] ?? ($meta['visibility'] ?? 'live'));
        $stockStatus = inventory_status_label($stock, $threshold);
        $rows[] = [
            'product_id' => $productId,
            'name' => $name,
            'category' => $category,
            'tagline' => $tagline,
            'description' => $description,
            'details' => $details,
            'feature_list' => $featureList,
            'spec_list' => $specList,
            'shipping_note' => $shippingNote,
            'image' => $image,
            'price' => round($price, 2),
            'stock' => $stock,
            'low_stock_threshold' => $threshold,
            'visibility' => $visibility,
            'stock_status' => $stockStatus,
            'status' => $stockStatus,
            'restock_note' => $row['restock_note'] !== null && $row['restock_note'] !== ''
                ? (string) $row['restock_note']
                : ($meta['restock_note'] ?? null),
            'sort_order' => (int) ($row['sort_order'] ?? ($meta['sort_order'] ?? 0)),
            'updated_at' => $row['updated_at'] ?? null,
        ];
    }

    return $rows;
}

function storefront_catalog(bool $includeHidden = true): array
{
    $catalog = [];
    foreach (storefront_inventory_rows($includeHidden) as $row) {
        $catalog[(string) $row['product_id']] = $row;
    }
    return $catalog;
}

function storefront_orders_has_column(string $column): bool
{
    static $cache = [];
    if (array_key_exists($column, $cache)) {
        return $cache[$column];
    }

    try {
        $stmt = db()->prepare('SHOW COLUMNS FROM orders LIKE ?');
        $stmt->execute([$column]);
        $cache[$column] = (bool) $stmt->fetch();
    } catch (Throwable $e) {
        $cache[$column] = false;
    }

    return $cache[$column];
}

function storefront_ensure_orders_payment_schema(): void
{
    static $ready = false;
    if ($ready) {
        return;
    }

    $columns = [
        'payment_provider' => "ALTER TABLE orders ADD COLUMN payment_provider VARCHAR(40) DEFAULT NULL AFTER payment_method",
        'payment_status' => "ALTER TABLE orders ADD COLUMN payment_status ENUM('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending' AFTER payment_provider",
        'payment_session_id' => "ALTER TABLE orders ADD COLUMN payment_session_id VARCHAR(120) DEFAULT NULL AFTER payment_status",
        'payment_intent_id' => "ALTER TABLE orders ADD COLUMN payment_intent_id VARCHAR(120) DEFAULT NULL AFTER payment_session_id",
        'payment_confirmed_at' => "ALTER TABLE orders ADD COLUMN payment_confirmed_at TIMESTAMP NULL DEFAULT NULL AFTER payment_intent_id",
        'payment_url' => "ALTER TABLE orders ADD COLUMN payment_url TEXT DEFAULT NULL AFTER payment_confirmed_at",
        'payment_error' => "ALTER TABLE orders ADD COLUMN payment_error TEXT DEFAULT NULL AFTER payment_url",
    ];

    foreach ($columns as $column => $sql) {
        if (!storefront_orders_has_column($column)) {
            db()->exec($sql);
        }
    }

    $ready = true;
}

function storefront_public_base_url(): string
{
    $configured = trim((string) (env('APP_URL', '') ?: (env('FRONTEND_URL', '') ?: '')));
    if ($configured !== '') {
        return rtrim($configured, '/');
    }

    $origin = trim((string) ($_SERVER['HTTP_ORIGIN'] ?? ''));
    if ($origin !== '') {
        return rtrim($origin, '/');
    }

    $host = trim((string) ($_SERVER['HTTP_HOST'] ?? 'localhost'));
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    return $scheme . '://' . $host;
}

function storefront_stripe_secret_key(): string
{
    return trim((string) env('STRIPE_SECRET_KEY', ''));
}

function storefront_stripe_enabled(): bool
{
    return storefront_stripe_secret_key() !== '';
}

function storefront_stripe_api_request(string $method, string $path, array $payload = []): array
{
    $secret = storefront_stripe_secret_key();
    if ($secret === '') {
        return [
            'ok' => false,
            'status' => 0,
            'data' => null,
            'error' => 'Stripe checkout is not configured.',
        ];
    }

    $body = $payload !== [] ? http_build_query($payload, '', '&', PHP_QUERY_RFC3986) : null;
    $headers = [
        'Authorization: Bearer ' . $secret,
        'Content-Type: application/x-www-form-urlencoded',
        'Accept: application/json',
    ];

    $response = mail_http_request('https://api.stripe.com' . $path, $method, $body, $headers);
    $decoded = json_decode($response['body'], true);

    return [
        'ok' => $response['ok'],
        'status' => $response['status'],
        'data' => is_array($decoded) ? $decoded : null,
        'error' => $response['error'] !== '' ? $response['error'] : ($response['body'] !== '' ? $response['body'] : 'Stripe request failed.'),
    ];
}

function storefront_stripe_checkout_session(array $items, array $order, array $catalog, array $customer): array
{
    $successUrl = storefront_public_base_url() . '/store?checkout=success&order=' . rawurlencode((string) $order['order_no']) . '&session_id={CHECKOUT_SESSION_ID}';
    $cancelUrl = storefront_public_base_url() . '/store?checkout=cancelled&order=' . rawurlencode((string) $order['order_no']);

    $payload = [
        'mode' => 'payment',
        'success_url' => $successUrl,
        'cancel_url' => $cancelUrl,
        'client_reference_id' => (string) $order['order_no'],
        'customer_email' => (string) $customer['email'],
        'billing_address_collection' => 'required',
        'shipping_address_collection[allowed_countries][0]' => 'US',
        'metadata[order_no]' => (string) $order['order_no'],
        'metadata[customer_name]' => (string) $customer['name'],
        'metadata[customer_email]' => (string) $customer['email'],
        'metadata[source]' => 'merchandise_store',
        'payment_method_types[0]' => 'card',
    ];

    foreach ($items as $index => $item) {
        $productId = (string) $item['id'];
        $qty = max(1, (int) ($item['qty'] ?? 1));
        $catalogItem = $catalog[$productId] ?? [];
        $itemName = trim((string) ($catalogItem['name'] ?? $productId));
        $itemDesc = trim((string) ($catalogItem['description'] ?? ''));
        $price = (float) ($catalogItem['price'] ?? 0);

        $payload["line_items[$index][quantity]"] = $qty;
        $payload["line_items[$index][price_data][currency]"] = storefront_currency();
        $payload["line_items[$index][price_data][unit_amount]"] = (int) round($price * 100);
        $payload["line_items[$index][price_data][product_data][name]"] = $itemName;
        if ($itemDesc !== '') {
            $payload["line_items[$index][price_data][product_data][description]"] = $itemDesc;
        }
        $payload["line_items[$index][price_data][product_data][metadata][product_id]"] = $productId;
    }

    $response = storefront_stripe_api_request('POST', '/v1/checkout/sessions', $payload);
    if (!$response['ok'] || !is_array($response['data'])) {
        $message = is_string($response['error']) && $response['error'] !== '' ? $response['error'] : 'Stripe checkout could not be created.';
        if (is_array($response['data']) && isset($response['data']['error']['message'])) {
            $message = (string) $response['data']['error']['message'];
        }
        return ['ok' => false, 'error' => $message];
    }

    return [
        'ok' => true,
        'session' => $response['data'],
    ];
}

function storefront_stripe_checkout_session_detail(string $sessionId): array
{
    return storefront_stripe_api_request('GET', '/v1/checkout/sessions/' . rawurlencode($sessionId) . '?expand[]=payment_intent');
}

/* ==================== Razorpay ==================== */
function storefront_razorpay_key_id(): string { return trim((string) env('RAZORPAY_KEY_ID', '')); }
function storefront_razorpay_secret(): string { return trim((string) env('RAZORPAY_KEY_SECRET', '')); }
function storefront_razorpay_enabled(): bool { return storefront_razorpay_key_id() !== '' && storefront_razorpay_secret() !== ''; }

/** Create a Razorpay Order (amount in minor units, e.g. paise/cents). */
function storefront_razorpay_create_order(int $amountMinor, string $currency, string $orderNo): array
{
    if (!storefront_razorpay_enabled()) return ['ok' => false, 'error' => 'Razorpay is not configured.'];
    $auth = base64_encode(storefront_razorpay_key_id() . ':' . storefront_razorpay_secret());
    $body = json_encode(['amount' => $amountMinor, 'currency' => strtoupper($currency), 'receipt' => $orderNo, 'notes' => ['order_no' => $orderNo]]);
    $res = mail_http_request('https://api.razorpay.com/v1/orders', 'POST', $body, ['Authorization: Basic ' . $auth, 'Content-Type: application/json', 'Accept: application/json']);
    $data = json_decode($res['body'], true);
    if (!$res['ok'] || !is_array($data) || empty($data['id'])) {
        $msg = is_array($data) && isset($data['error']['description']) ? (string) $data['error']['description'] : 'Razorpay order could not be created.';
        return ['ok' => false, 'error' => $msg];
    }
    return ['ok' => true, 'order' => $data];
}

/** Verify a Razorpay payment signature: HMAC_SHA256(order_id|payment_id, secret). */
function storefront_razorpay_verify_signature(string $rzpOrderId, string $paymentId, string $signature): bool
{
    if (!storefront_razorpay_enabled() || $signature === '') return false;
    $expected = hash_hmac('sha256', $rzpOrderId . '|' . $paymentId, storefront_razorpay_secret());
    return hash_equals($expected, $signature);
}

/* ==================== PayPal (Orders v2, approve+capture) ==================== */
function storefront_paypal_client_id(): string { return trim((string) env('PAYPAL_CLIENT_ID', '')); }
function storefront_paypal_secret(): string { return trim((string) env('PAYPAL_SECRET', '')); }
function storefront_paypal_enabled(): bool { return storefront_paypal_client_id() !== '' && storefront_paypal_secret() !== ''; }
function storefront_paypal_base(): string { return strtolower((string) env('PAYPAL_ENV', 'sandbox')) === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'; }

function storefront_paypal_access_token(): array
{
    if (!storefront_paypal_enabled()) return ['ok' => false, 'error' => 'PayPal is not configured.'];
    $auth = base64_encode(storefront_paypal_client_id() . ':' . storefront_paypal_secret());
    $res = mail_http_request(storefront_paypal_base() . '/v1/oauth2/token', 'POST', 'grant_type=client_credentials', ['Authorization: Basic ' . $auth, 'Content-Type: application/x-www-form-urlencoded', 'Accept: application/json']);
    $data = json_decode($res['body'], true);
    if (!$res['ok'] || empty($data['access_token'])) return ['ok' => false, 'error' => 'Could not authenticate with PayPal.'];
    return ['ok' => true, 'token' => (string) $data['access_token']];
}

/** Create a PayPal order; returns its id + the buyer approval redirect URL. */
function storefront_paypal_create_order(float $amount, string $currency, string $orderNo): array
{
    $tok = storefront_paypal_access_token();
    if (!$tok['ok']) return ['ok' => false, 'error' => $tok['error']];
    $return = storefront_public_base_url() . '/store?checkout=paypal&order=' . rawurlencode($orderNo);
    $cancel = storefront_public_base_url() . '/store?checkout=cancelled&order=' . rawurlencode($orderNo);
    $body = json_encode([
        'intent' => 'CAPTURE',
        'purchase_units' => [['reference_id' => $orderNo, 'custom_id' => $orderNo, 'amount' => ['currency_code' => strtoupper($currency), 'value' => number_format($amount, 2, '.', '')]]],
        'application_context' => ['brand_name' => 'Frantz Coutard Store', 'user_action' => 'PAY_NOW', 'return_url' => $return, 'cancel_url' => $cancel],
    ]);
    $res = mail_http_request(storefront_paypal_base() . '/v2/checkout/orders', 'POST', $body, ['Authorization: Bearer ' . $tok['token'], 'Content-Type: application/json', 'Accept: application/json']);
    $data = json_decode($res['body'], true);
    if (!$res['ok'] || empty($data['id'])) return ['ok' => false, 'error' => 'PayPal order could not be created.'];
    $approve = '';
    foreach (($data['links'] ?? []) as $l) { if (($l['rel'] ?? '') === 'approve') $approve = (string) $l['href']; }
    return ['ok' => true, 'id' => (string) $data['id'], 'approve_url' => $approve];
}

/** Capture an approved PayPal order. */
function storefront_paypal_capture_order(string $paypalOrderId): array
{
    $tok = storefront_paypal_access_token();
    if (!$tok['ok']) return ['ok' => false, 'error' => $tok['error']];
    $res = mail_http_request(storefront_paypal_base() . '/v2/checkout/orders/' . rawurlencode($paypalOrderId) . '/capture', 'POST', '{}', ['Authorization: Bearer ' . $tok['token'], 'Content-Type: application/json', 'Accept: application/json']);
    $data = json_decode($res['body'], true);
    if (!$res['ok'] || !is_array($data)) return ['ok' => false, 'error' => 'PayPal capture failed.'];
    return ['ok' => true, 'data' => $data, 'status' => (string) ($data['status'] ?? '')];
}

/* ==================== Payment provider registry ==================== */
function storefront_currency(): string { return strtolower((string) env('STORE_CURRENCY', 'usd')); }

/** Enabled providers, in display order. */
function storefront_payment_methods(): array
{
    $m = [];
    if (storefront_stripe_enabled()) $m[] = 'stripe';
    if (storefront_razorpay_enabled()) $m[] = 'razorpay';
    if (storefront_paypal_enabled()) $m[] = 'paypal';
    return $m;
}

/** Public payment config for the storefront (enabled methods + public keys). */
function storefront_payment_config(): array
{
    return [
        'methods' => storefront_payment_methods(),
        'currency' => storefront_currency(),
        'razorpay_key_id' => storefront_razorpay_enabled() ? storefront_razorpay_key_id() : '',
        'paypal_client_id' => storefront_paypal_enabled() ? storefront_paypal_client_id() : '',
    ];
}

/** Idempotently mark an order paid (used by razorpay-verify + paypal-capture). */
function storefront_mark_order_paid(string $orderNo, string $provider, string $method, string $intentId, string $sessionId = ''): void
{
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $lk = $pdo->prepare('SELECT payment_status FROM orders WHERE order_no = ? LIMIT 1 FOR UPDATE');
        $lk->execute([$orderNo]);
        $cur = $lk->fetchColumn();
        if ($cur === false) { $pdo->rollBack(); json(['error' => 'Order not found.'], 404); }
        if ((string) $cur === 'paid') { $pdo->commit(); return; }
        $pdo->prepare(
            'UPDATE orders SET status = ?, payment_status = ?, payment_provider = ?, payment_method = ?,
                    payment_intent_id = ?, payment_session_id = COALESCE(NULLIF(?, ""), payment_session_id),
                    payment_confirmed_at = NOW(), updated_at = NOW()
             WHERE order_no = ?'
        )->execute(['paid', 'paid', $provider, $method, $intentId !== '' ? $intentId : null, $sessionId, $orderNo]);
        $pdo->commit();
    } catch (\Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
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

function sponsor_organization_types(): array
{
    return [
        'Corporation',
        'Small Business',
        'Nonprofit',
        'Foundation',
        'College / University',
        'Healthcare Organization',
        'Financial Institution',
        'Government Agency',
        'Community Organization',
        'Other',
    ];
}

function sponsor_interest_options(): array
{
    return [
        'Attend Awards Ceremony',
        'Speaking Opportunity',
        'Student Mentorship Opportunities',
        'Scholarship Naming Opportunity',
        'School Grant Naming Opportunity',
        'Future Internship Opportunities',
        'Community Partnership Opportunities',
    ];
}

function sponsor_payment_status_options(): array
{
    return ['pending_check', 'check_received', 'payment_confirmed'];
}

function sponsor_approval_status_options(): array
{
    return ['pending_review', 'approved', 'rejected', 'published'];
}

function sponsor_payment_instruction_lines(): array
{
    return [
        'MAKE CHECK PAYABLE TO:',
        'Trend Catch Network Inc.',
        '',
        'MAIL CHECK TO:',
        'Attention: FrantzCoutard.com',
        'Leave It Better Than You Found It',
        'Suite 1400',
        '118-35 Queens Blvd',
        'Forest Hills, NY 11375',
        '',
        'IMPORTANT:',
        'Please include your organization name, contact person, email address, and sponsorship level with your check.',
    ];
}

function sponsor_payment_instruction_text(): string
{
    return implode("\n", sponsor_payment_instruction_lines());
}

function sponsor_ensure_schema(): void
{
    static $ready = false;
    if ($ready) {
        return;
    }

    db()->exec(
        "CREATE TABLE IF NOT EXISTS sponsor_programs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            slug VARCHAR(160) NOT NULL UNIQUE,
            name VARCHAR(220) NOT NULL,
            edition_name VARCHAR(220) DEFAULT NULL,
            headline VARCHAR(220) NOT NULL,
            subheadline TEXT NOT NULL,
            registration_opens DATE DEFAULT NULL,
            winners_announced DATE DEFAULT NULL,
            school_impact_grant_amount DECIMAL(12,2) NOT NULL DEFAULT 25000.00,
            student_scholarship_amount DECIMAL(12,2) NOT NULL DEFAULT 10000.00,
            educator_award_label VARCHAR(220) NOT NULL,
            age_range VARCHAR(40) NOT NULL DEFAULT '11-19',
            grade_range VARCHAR(40) NOT NULL DEFAULT '6-12',
            is_active TINYINT(1) NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_sponsor_programs_active (is_active, registration_opens, winners_announced)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    db()->exec(
        "CREATE TABLE IF NOT EXISTS sponsorship_levels (
            id INT AUTO_INCREMENT PRIMARY KEY,
            program_id INT NOT NULL,
            slug VARCHAR(80) NOT NULL,
            name VARCHAR(120) NOT NULL,
            minimum_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
            sort_order INT NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_sponsorship_level (program_id, slug),
            CONSTRAINT fk_sponsorship_levels_program
                FOREIGN KEY (program_id) REFERENCES sponsor_programs(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    db()->exec(
        "CREATE TABLE IF NOT EXISTS sponsor_applications (
            id INT AUTO_INCREMENT PRIMARY KEY,
            program_id INT NOT NULL,
            organization_name VARCHAR(180) NOT NULL,
            contact_person VARCHAR(160) NOT NULL,
            title_position VARCHAR(160) DEFAULT NULL,
            email_address VARCHAR(160) NOT NULL,
            phone_number VARCHAR(60) NOT NULL,
            website VARCHAR(255) DEFAULT NULL,
            street_address VARCHAR(255) NOT NULL,
            city VARCHAR(120) NOT NULL,
            state VARCHAR(120) NOT NULL,
            zip_code VARCHAR(30) NOT NULL,
            organization_type VARCHAR(120) NOT NULL,
            logo_url VARCHAR(255) DEFAULT NULL,
            company_bio TEXT NOT NULL,
            support_reason TEXT NOT NULL,
            sponsorship_level_slug VARCHAR(80) NOT NULL,
            sponsorship_level_name VARCHAR(120) NOT NULL,
            sponsorship_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
            custom_amount TINYINT(1) NOT NULL DEFAULT 0,
            interests_json LONGTEXT DEFAULT NULL,
            public_description TEXT DEFAULT NULL,
            admin_notes TEXT DEFAULT NULL,
            payment_status ENUM('pending_check','check_received','payment_confirmed') NOT NULL DEFAULT 'pending_check',
            approval_status ENUM('pending_review','approved','rejected','published') NOT NULL DEFAULT 'pending_review',
            reviewed_by_user_id INT DEFAULT NULL,
            reviewed_at TIMESTAMP NULL DEFAULT NULL,
            approved_at TIMESTAMP NULL DEFAULT NULL,
            rejected_at TIMESTAMP NULL DEFAULT NULL,
            check_received_at TIMESTAMP NULL DEFAULT NULL,
            payment_confirmed_at TIMESTAMP NULL DEFAULT NULL,
            published_at TIMESTAMP NULL DEFAULT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_sponsor_applications_program (program_id, created_at),
            INDEX idx_sponsor_applications_status (approval_status, payment_status, created_at),
            INDEX idx_sponsor_applications_level (sponsorship_level_slug, sponsorship_amount),
            CONSTRAINT fk_sponsor_applications_program
                FOREIGN KEY (program_id) REFERENCES sponsor_programs(id) ON DELETE CASCADE,
            CONSTRAINT fk_sponsor_applications_reviewer
                FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    sponsor_seed_defaults();
    $ready = true;
}

function sponsor_seed_defaults(): void
{
    $pdo = db();
    $stmt = $pdo->prepare(
        'INSERT INTO sponsor_programs
            (slug, name, edition_name, headline, subheadline, registration_opens, winners_announced, school_impact_grant_amount, student_scholarship_amount, educator_award_label, age_range, grade_range, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            edition_name = VALUES(edition_name),
            headline = VALUES(headline),
            subheadline = VALUES(subheadline),
            registration_opens = VALUES(registration_opens),
            winners_announced = VALUES(winners_announced),
            school_impact_grant_amount = VALUES(school_impact_grant_amount),
            student_scholarship_amount = VALUES(student_scholarship_amount),
            educator_award_label = VALUES(educator_award_label),
            age_range = VALUES(age_range),
            grade_range = VALUES(grade_range),
            is_active = VALUES(is_active),
            updated_at = NOW()'
    );
    $stmt->execute([
        'leave-it-better-than-you-found-it-2026',
        'Leave It Better Than You Found It',
        '1st Annual Student Impact Challenge',
        'Support New York’s Next Generation of Problem Solvers',
        'Help students ages 11–19 develop leadership, entrepreneurship, communication, and problem-solving skills while creating positive change in their communities.',
        '2026-06-25',
        '2026-12-22',
        25000,
        10000,
        'All-Inclusive Educator Recognition Award',
        '11-19',
        '6-12',
    ]);

    $programStmt = $pdo->prepare(
        'SELECT id, slug, name, edition_name, headline, subheadline, registration_opens, winners_announced,
                school_impact_grant_amount, student_scholarship_amount, educator_award_label, age_range, grade_range, is_active
         FROM sponsor_programs
         WHERE slug = ?
         LIMIT 1'
    );
    $programStmt->execute(['leave-it-better-than-you-found-it-2026']);
    $program = $programStmt->fetch();
    if (!$program) {
        return;
    }
    $levelStmt = $pdo->prepare(
        'INSERT IGNORE INTO sponsorship_levels (program_id, slug, name, minimum_amount, sort_order)
         VALUES (?, ?, ?, ?, ?)'
    );
    $levels = [
        ['community_partner', 'Community Partner', 1000, 1],
        ['silver_sponsor', 'Silver Sponsor', 5000, 2],
        ['gold_sponsor', 'Gold Sponsor', 10000, 3],
        ['presenting_sponsor', 'Presenting Sponsor', 25000, 4],
        ['custom_sponsorship', 'Custom Sponsorship Amount', 0, 5],
    ];
    foreach ($levels as [$slug, $name, $minimum, $order]) {
        $levelStmt->execute([(int) $program['id'], $slug, $name, $minimum, $order]);
    }

    $pdo->exec('UPDATE sponsor_programs SET is_active = CASE WHEN id = ' . (int) $program['id'] . ' THEN 1 ELSE 0 END');
}

function sponsor_current_program(): array
{
    sponsor_ensure_schema();
    $stmt = db()->query(
        'SELECT id, slug, name, edition_name, headline, subheadline, registration_opens, winners_announced,
                school_impact_grant_amount, student_scholarship_amount, educator_award_label, age_range, grade_range, is_active
         FROM sponsor_programs
         WHERE is_active = 1
         ORDER BY id DESC
         LIMIT 1'
    );
    $program = $stmt->fetch();
    if ($program) {
        return $program;
    }

    return [
        'id' => 0,
        'slug' => 'leave-it-better-than-you-found-it-2026',
        'name' => 'Leave It Better Than You Found It',
        'edition_name' => '1st Annual Student Impact Challenge',
        'headline' => 'Support New York’s Next Generation of Problem Solvers',
        'subheadline' => 'Help students ages 11–19 develop leadership, entrepreneurship, communication, and problem-solving skills while creating positive change in their communities.',
        'registration_opens' => '2026-06-25',
        'winners_announced' => '2026-12-22',
        'school_impact_grant_amount' => 25000,
        'student_scholarship_amount' => 10000,
        'educator_award_label' => 'All-Inclusive Educator Recognition Award',
        'age_range' => '11-19',
        'grade_range' => '6-12',
        'is_active' => 1,
    ];
}

function sponsor_program_levels(int $programId): array
{
    sponsor_ensure_schema();
    $stmt = db()->prepare(
        'SELECT id, slug, name, minimum_amount, sort_order
         FROM sponsorship_levels
         WHERE program_id = ?
         ORDER BY sort_order ASC, id ASC'
    );
    $stmt->execute([$programId]);
    return $stmt->fetchAll();
}

function sponsor_level_index(int $programId): array
{
    $index = [];
    foreach (sponsor_program_levels($programId) as $level) {
        $index[(string) $level['slug']] = $level;
    }
    return $index;
}

function sponsor_decode_json(?string $jsonText): array
{
    if (!$jsonText) {
        return [];
    }
    $decoded = json_decode($jsonText, true);
    return is_array($decoded) ? array_values($decoded) : [];
}

function sponsor_normalize_url(string $url): ?string
{
    $url = trim($url);
    if ($url === '') {
        return null;
    }
    if (!preg_match('#^https?://#i', $url)) {
        $url = 'https://' . $url;
    }
    return filter_var($url, FILTER_VALIDATE_URL) ? $url : null;
}

function sponsor_public_description(string $bio, string $fallback = ''): string
{
    $source = trim($fallback) !== '' ? trim($fallback) : trim($bio);
    if ($source === '') {
        return '';
    }
    if (function_exists('mb_substr')) {
        return mb_substr($source, 0, 220);
    }
    return substr($source, 0, 220);
}

function sponsor_current_program_payload(): array
{
    $program = sponsor_current_program();
    $levels = sponsor_program_levels((int) $program['id']);

    $countStmt = db()->prepare(
        "SELECT COUNT(*) FROM sponsor_applications
         WHERE program_id = ? AND approval_status = 'published'"
    );
    $countStmt->execute([(int) $program['id']]);

    return [
        'program' => [
            'id' => (int) $program['id'],
            'slug' => (string) $program['slug'],
            'name' => (string) $program['name'],
            'edition_name' => $program['edition_name'],
            'headline' => (string) $program['headline'],
            'subheadline' => (string) $program['subheadline'],
            'registration_opens' => $program['registration_opens'],
            'winners_announced' => $program['winners_announced'],
            'school_impact_grant_amount' => (float) $program['school_impact_grant_amount'],
            'student_scholarship_amount' => (float) $program['student_scholarship_amount'],
            'educator_award_label' => (string) $program['educator_award_label'],
            'age_range' => (string) $program['age_range'],
            'grade_range' => (string) $program['grade_range'],
            'is_active' => (int) $program['is_active'],
            'levels' => $levels,
            'published_sponsor_count' => (int) $countStmt->fetchColumn(),
        ],
        'organizationTypes' => sponsor_organization_types(),
        'interestOptions' => sponsor_interest_options(),
        'paymentInstructions' => sponsor_payment_instruction_lines(),
    ];
}

function sponsor_application_admin_row(array $row): array
{
    if ($row === []) {
        return [];
    }

    return [
        'id' => (int) $row['id'],
        'program_id' => (int) $row['program_id'],
        'program_name' => $row['program_name'] ?? null,
        'program_edition_name' => $row['program_edition_name'] ?? null,
        'organization_name' => (string) $row['organization_name'],
        'contact_person' => (string) $row['contact_person'],
        'title_position' => $row['title_position'] ?? null,
        'email_address' => (string) $row['email_address'],
        'phone_number' => (string) $row['phone_number'],
        'website' => $row['website'] ?: null,
        'street_address' => (string) $row['street_address'],
        'city' => (string) $row['city'],
        'state' => (string) $row['state'],
        'zip_code' => (string) $row['zip_code'],
        'organization_type' => (string) $row['organization_type'],
        'logo_url' => $row['logo_url'] ?: null,
        'company_bio' => (string) $row['company_bio'],
        'support_reason' => (string) $row['support_reason'],
        'sponsorship_level_slug' => (string) $row['sponsorship_level_slug'],
        'sponsorship_level_name' => (string) $row['sponsorship_level_name'],
        'sponsorship_amount' => (float) $row['sponsorship_amount'],
        'custom_amount' => (int) $row['custom_amount'],
        'interests' => sponsor_decode_json($row['interests_json'] ?? null),
        'public_description' => $row['public_description'] ?? null,
        'admin_notes' => $row['admin_notes'] ?? null,
        'payment_status' => (string) $row['payment_status'],
        'approval_status' => (string) $row['approval_status'],
        'reviewed_by_user_id' => isset($row['reviewed_by_user_id']) && $row['reviewed_by_user_id'] !== null ? (int) $row['reviewed_by_user_id'] : null,
        'reviewed_by_name' => $row['reviewed_by_name'] ?? null,
        'reviewed_at' => $row['reviewed_at'] ?? null,
        'approved_at' => $row['approved_at'] ?? null,
        'rejected_at' => $row['rejected_at'] ?? null,
        'check_received_at' => $row['check_received_at'] ?? null,
        'payment_confirmed_at' => $row['payment_confirmed_at'] ?? null,
        'published_at' => $row['published_at'] ?? null,
        'created_at' => $row['created_at'] ?? null,
        'updated_at' => $row['updated_at'] ?? null,
        'level_minimum_amount' => isset($row['level_minimum_amount']) ? (float) $row['level_minimum_amount'] : null,
        'level_sort_order' => isset($row['level_sort_order']) && $row['level_sort_order'] !== null ? (int) $row['level_sort_order'] : null,
    ];
}

function sponsor_public_sponsors_payload(): array
{
    $program = sponsor_current_program();
    $levels = sponsor_program_levels((int) $program['id']);

    $stmt = db()->prepare(
        "SELECT sa.id, sa.organization_name, sa.website, sa.logo_url, sa.company_bio, sa.public_description,
                sa.sponsorship_level_slug, sa.sponsorship_level_name, sa.sponsorship_amount, sa.created_at,
                sl.sort_order
         FROM sponsor_applications sa
         LEFT JOIN sponsorship_levels sl
           ON sl.program_id = sa.program_id AND sl.slug = sa.sponsorship_level_slug
         WHERE sa.program_id = ? AND sa.approval_status = 'published'
         ORDER BY COALESCE(sl.sort_order, 999) ASC, sa.sponsorship_amount DESC, sa.organization_name ASC"
    );
    $stmt->execute([(int) $program['id']]);
    $rows = $stmt->fetchAll();

    $grouped = [];
    foreach ($levels as $level) {
        $grouped[(string) $level['slug']] = [
            'slug' => (string) $level['slug'],
            'name' => (string) $level['name'],
            'minimum_amount' => (float) $level['minimum_amount'],
            'sort_order' => (int) $level['sort_order'],
            'sponsors' => [],
        ];
    }

    foreach ($rows as $row) {
        $slug = (string) $row['sponsorship_level_slug'];
        if (!isset($grouped[$slug])) {
            $grouped[$slug] = [
                'slug' => $slug,
                'name' => (string) $row['sponsorship_level_name'],
                'minimum_amount' => 0,
                'sort_order' => (int) ($row['sort_order'] ?? 999),
                'sponsors' => [],
            ];
        }
        $grouped[$slug]['sponsors'][] = [
            'id' => (int) $row['id'],
            'organization_name' => (string) $row['organization_name'],
            'website' => $row['website'] ?: null,
            'logo_url' => $row['logo_url'] ?: null,
            'sponsorship_level_slug' => $slug,
            'sponsorship_level_name' => (string) $row['sponsorship_level_name'],
            'sponsorship_amount' => (float) $row['sponsorship_amount'],
            'short_description' => sponsor_public_description((string) ($row['company_bio'] ?? ''), (string) ($row['public_description'] ?? '')),
            'badge' => 'Founding Sponsor',
            'created_at' => $row['created_at'],
        ];
    }

    uasort($grouped, static fn(array $a, array $b): int => (int) $a['sort_order'] <=> (int) $b['sort_order']);

    return [
        'program' => [
            'id' => (int) $program['id'],
            'slug' => (string) $program['slug'],
            'name' => (string) $program['name'],
            'edition_name' => $program['edition_name'],
            'headline' => (string) $program['headline'],
            'subheadline' => (string) $program['subheadline'],
            'registration_opens' => $program['registration_opens'],
            'winners_announced' => $program['winners_announced'],
            'school_impact_grant_amount' => (float) $program['school_impact_grant_amount'],
            'student_scholarship_amount' => (float) $program['student_scholarship_amount'],
            'educator_award_label' => (string) $program['educator_award_label'],
            'age_range' => (string) $program['age_range'],
            'grade_range' => (string) $program['grade_range'],
            'is_active' => (int) $program['is_active'],
            'levels' => $levels,
        ],
        'tiers' => array_values($grouped),
    ];
}

function sponsor_confirmation_email_body(array $application, array $program): string
{
    return implode("\n", [
        'Thank you for your sponsorship interest.',
        '',
        'We received your application for the ' . ($program['edition_name'] ?: $program['name']) . '.',
        '',
        'Organization: ' . $application['organization_name'],
        'Contact Person: ' . $application['contact_person'],
        'Sponsorship Level: ' . $application['sponsorship_level_name'],
        'Sponsorship Amount: $' . number_format((float) $application['sponsorship_amount'], 2),
        '',
        'Next Steps:',
        '1. Mail your sponsorship check using the instructions below.',
        '2. Our team will review your application and confirm when your payment is received.',
        '3. Approved and published sponsors will be recognized publicly on the Founding Sponsors page.',
        '',
        sponsor_payment_instruction_text(),
        '',
        'Contact Information:',
        trim((string) env('NOTIFY_EMAIL', '')) !== '' ? trim((string) env('NOTIFY_EMAIL', '')) : mail_from_address(),
        '',
        'Thank you,',
        'FrantzCoutard.com',
    ]);
}

function sponsor_send_confirmation_email(array $application, array $program): void
{
    $subject = 'Thank You For Your Sponsorship Interest';
    $bodyText = sponsor_confirmation_email_body($application, $program);
    try {
        $built = email_admin_notification($subject, $bodyText);
        queue_themed_mail('sponsor_interest', (string) $application['email_address'], $built);
    } catch (Throwable $e) {
        // Sponsor applications should not fail when email delivery is unavailable.
    }
}

function new_school_generate_participant_id(): string
{
    $pdo = db();

    for ($attempt = 0; $attempt < 20; $attempt++) {
        $candidate = (string) random_int(10000000, 99999999);
        $stmt = $pdo->prepare('SELECT 1 FROM new_school_students WHERE participant_id = ? LIMIT 1');
        $stmt->execute([$candidate]);
        if (!$stmt->fetchColumn()) {
            return $candidate;
        }
    }

    return (string) random_int(10000000, 99999999);
}

function new_school_generate_qr_token(): string
{
    return bin2hex(random_bytes(16));
}

function new_school_qr_url(string $token): string
{
    return '/new-school/parent/' . rawurlencode($token);
}

/** Unique share code for a student's referral link (10 hex chars). */
function new_school_generate_referral_code(): string
{
    $pdo = db();
    for ($i = 0; $i < 20; $i++) {
        $code = bin2hex(random_bytes(5));
        $stmt = $pdo->prepare('SELECT 1 FROM new_school_students WHERE referral_code = ? LIMIT 1');
        $stmt->execute([$code]);
        if (!$stmt->fetchColumn()) {
            return $code;
        }
    }
    return bin2hex(random_bytes(8));
}

/** Resolve a referral code to the referrer's student id (null if unknown). */
function new_school_referrer_id_by_code(string $code): ?int
{
    $code = trim($code);
    if ($code === '') {
        return null;
    }
    $stmt = db()->prepare('SELECT id FROM new_school_students WHERE referral_code = ? LIMIT 1');
    $stmt->execute([$code]);
    $id = $stmt->fetchColumn();
    return $id ? (int) $id : null;
}

/* ============================================================================
 * Points engine (drives student + teacher rankings).
 *  - Each interview/project a student submits: student +5, their teacher +2 (auto).
 *  - On admin approval: admin awards a bonus — student up to 15, teacher up to 8 (default 3).
 * Points live in an idempotent ledger (one row per recipient/source/kind) so re-approving
 * REPLACES the bonus rather than stacking. A recipient's total = SUM(points).
 * ==========================================================================*/
const NS_POINTS_STUDENT_AUTO = 5;
const NS_POINTS_TEACHER_AUTO = 2;
const NS_POINTS_STUDENT_BONUS_MAX = 15;
const NS_POINTS_TEACHER_BONUS_MAX = 8;
const NS_POINTS_TEACHER_BONUS_DEFAULT = 3;
// Referral: the referrer earns this once the friend they invited is teacher-approved.
const NS_POINTS_STUDENT_REFERRAL = 10;

/* ============================================================
   Terms & Conditions acceptance audit
   ============================================================ */

// Current version strings + document labels. Bump on text changes; historical rows
// keep the version that was in force when accepted.
const TERMS_CHALLENGE_VERSION        = 'Interim Terms v1 – June 2026';
const TERMS_GENERAL_PLATFORM_VERSION = 'Interim Terms v1 – June 2026';
const TERMS_WEBSITE_VERSION          = 'Interim Website Terms v1';
const TERMS_WEBSITE_LABEL            = 'Terms of Use & Privacy Notice';
const TERMS_GENERAL_PLATFORM_LABEL   = 'General Platform Terms';
const TERMS_CHALLENGE_LABELS = [
    'student' => 'Student Challenge Terms',
    'parent'  => 'Parent / Guardian Challenge Terms',
    'teacher' => 'Teacher Challenge Terms',
    'school'  => 'School Challenge Terms',
];

function terms_acceptances_ensure_schema(): void
{
    static $ready = false;
    if ($ready) {
        return;
    }
    db()->exec(
        "CREATE TABLE IF NOT EXISTS terms_acceptances (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            user_id INT DEFAULT NULL,
            user_name VARCHAR(180) NOT NULL,
            email VARCHAR(160) NOT NULL,
            role VARCHAR(40) DEFAULT NULL,
            accept_type ENUM('challenge_role','general_platform','website') NOT NULL,
            terms_version VARCHAR(120) NOT NULL,
            signature_name VARCHAR(180) DEFAULT NULL,
            document_label VARCHAR(200) DEFAULT NULL,
            ip_address VARCHAR(45) DEFAULT NULL,
            user_agent VARCHAR(500) DEFAULT NULL,
            accepted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_terms_user (user_id, accepted_at),
            INDEX idx_terms_email (email, accepted_at),
            INDEX idx_terms_type_version (accept_type, terms_version, accepted_at),
            CONSTRAINT fk_terms_acceptances_user
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $ready = true;
}

/**
 * Record one Terms acceptance audit row. Captures IP/UA server-side and resolves
 * user_id from current_user() when not supplied. NEVER throws — auditing must never
 * break the primary user action. Returns the inserted id, or 0 on no-op/failure.
 */
function record_terms_acceptance(array $args): int
{
    $acceptType   = (string) ($args['accept_type'] ?? '');
    $termsVersion = trim((string) ($args['terms_version'] ?? ''));
    if (!in_array($acceptType, ['challenge_role', 'general_platform', 'website'], true) || $termsVersion === '') {
        return 0;
    }

    $user = null;
    if (array_key_exists('user_id', $args) && $args['user_id'] !== null) {
        $userId = (int) $args['user_id'];
    } else {
        $user = current_user();
        $userId = $user ? (int) $user['id'] : null;
    }

    $userName = trim((string) ($args['user_name'] ?? ($user['full_name'] ?? '')));
    $email    = strtolower(trim((string) ($args['email'] ?? ($user['email'] ?? ''))));
    $role     = (isset($args['role']) && $args['role'] !== null && $args['role'] !== '') ? (string) $args['role'] : null;
    $signature = (isset($args['signature_name']) && trim((string) $args['signature_name']) !== '')
        ? trim((string) $args['signature_name'])
        : ($userName !== '' ? $userName : null);
    $documentLabel = (isset($args['document_label']) && trim((string) $args['document_label']) !== '')
        ? trim((string) $args['document_label'])
        : null;

    if ($userName === '' || $email === '') {
        return 0;
    }

    try {
        terms_acceptances_ensure_schema();
        $stmt = db()->prepare(
            'INSERT INTO terms_acceptances
                (user_id, user_name, email, role, accept_type, terms_version,
                 signature_name, document_label, ip_address, user_agent)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $userId,
            substr($userName, 0, 180),
            substr($email, 0, 160),
            $role !== null ? substr($role, 0, 40) : null,
            $acceptType,
            substr($termsVersion, 0, 120),
            $signature !== null ? substr($signature, 0, 180) : null,
            $documentLabel !== null ? substr($documentLabel, 0, 200) : null,
            client_ip(),
            client_user_agent(),
        ]);
        return (int) db()->lastInsertId();
    } catch (Throwable $e) {
        error_log('record_terms_acceptance() failed: ' . $e->getMessage());
        return 0;
    }
}

/** Record the three acceptance rows (challenge role + general platform + website) for a registration. */
function record_registration_terms(int $userId, string $name, string $email, string $role, string $signature, array $body): void
{
    $challengeVersion = field($body, 'terms_version') ?: TERMS_CHALLENGE_VERSION;
    $websiteVersion = field($body, 'website_terms_version') ?: TERMS_WEBSITE_VERSION;
    $base = [
        'user_id' => $userId,
        'user_name' => $name,
        'email' => $email,
        'role' => $role,
        'signature_name' => $signature !== '' ? $signature : $name,
    ];
    record_terms_acceptance($base + ['accept_type' => 'challenge_role', 'terms_version' => $challengeVersion, 'document_label' => TERMS_CHALLENGE_LABELS[$role] ?? 'Challenge Terms']);
    record_terms_acceptance($base + ['accept_type' => 'general_platform', 'terms_version' => TERMS_GENERAL_PLATFORM_VERSION, 'document_label' => TERMS_GENERAL_PLATFORM_LABEL]);
    record_terms_acceptance($base + ['accept_type' => 'website', 'terms_version' => $websiteVersion, 'document_label' => TERMS_WEBSITE_LABEL]);
}

/**
 * Parent approval chain columns on new_school_parents (lazy migration).
 * link_status: pending_student → student confirms → pending_teacher → teacher approves → approved.
 * CREATE/ALTER causes an implicit COMMIT, so never call inside a transaction.
 */
function new_school_parents_ensure_link_columns(): void
{
    static $ready = false;
    if ($ready) {
        return;
    }
    try {
        $has = db()->query("SHOW COLUMNS FROM new_school_parents LIKE 'link_status'")->fetchColumn();
        if (!$has) {
            db()->exec(
                "ALTER TABLE new_school_parents
                 ADD COLUMN link_status ENUM('pending_student','pending_teacher','approved','rejected') NOT NULL DEFAULT 'pending_student' AFTER consent_checked,
                 ADD COLUMN student_confirmed_at TIMESTAMP NULL DEFAULT NULL AFTER link_status"
            );
            // Existing (previously auto-approved) parents keep access.
            db()->exec("UPDATE new_school_parents SET link_status = 'approved' WHERE approved_at IS NOT NULL");
        }
    } catch (\Throwable $e) {
        // best-effort; column may already exist
    }
    $ready = true;
}

/**
 * Admin ⇄ user chat. One thread per non-admin user (thread_user_id = users.id);
 * any admin replies. "Clear chat" is one-sided: each side stores a cleared_at and
 * only sees messages newer than its own marker (the other side keeps the history).
 */
function new_school_chat_ensure_schema(): void
{
    static $ready = false;
    if ($ready) {
        return;
    }
    db()->exec(
        "CREATE TABLE IF NOT EXISTS new_school_chat_messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            thread_user_id INT NOT NULL,
            sender ENUM('user','admin') NOT NULL,
            sender_user_id INT NULL,
            body TEXT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_ns_chat_thread (thread_user_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    db()->exec(
        "CREATE TABLE IF NOT EXISTS new_school_chat_clears (
            thread_user_id INT NOT NULL,
            side ENUM('user','admin') NOT NULL,
            cleared_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (thread_user_id, side)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $ready = true;
}

/** Messages in a thread visible to one side (respecting that side's clear marker). */
function new_school_chat_fetch(int $threadUserId, string $side): array
{
    $stmt = db()->prepare('SELECT cleared_at FROM new_school_chat_clears WHERE thread_user_id = ? AND side = ? LIMIT 1');
    $stmt->execute([$threadUserId, $side]);
    $clearedAt = $stmt->fetchColumn();
    if ($clearedAt !== false) {
        $q = db()->prepare('SELECT id, sender, body, created_at FROM new_school_chat_messages WHERE thread_user_id = ? AND created_at > ? ORDER BY created_at ASC, id ASC');
        $q->execute([$threadUserId, (string) $clearedAt]);
    } else {
        $q = db()->prepare('SELECT id, sender, body, created_at FROM new_school_chat_messages WHERE thread_user_id = ? ORDER BY created_at ASC, id ASC');
        $q->execute([$threadUserId]);
    }
    return $q->fetchAll();
}

/** Record a one-sided clear marker (hides earlier messages for that side only). */
function new_school_chat_clear(int $threadUserId, string $side): void
{
    db()->prepare('INSERT INTO new_school_chat_clears (thread_user_id, side, cleared_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE cleared_at = NOW()')
        ->execute([$threadUserId, $side]);
}

/* ============================================================================
 * Scholarship intake questionnaire.
 * Each student answers a short set of essay questions ONCE before they can log
 * interviews or submit their final project. Answers (a JSON array of
 * {key, question, answer}) are stored per student and shown to the admin
 * alongside every interview/project the student submits.
 * ==========================================================================*/

// Max words allowed per answer (owner-specified limit).
const NS_SCHOLARSHIP_WORD_LIMIT = 500;

function new_school_scholarship_ensure_schema(): void
{
    static $ready = false;
    if ($ready) {
        return;
    }
    db()->exec(
        "CREATE TABLE IF NOT EXISTS new_school_scholarship_answers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            student_id INT NOT NULL,
            answers LONGTEXT NOT NULL,
            completed_at TIMESTAMP NULL DEFAULT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_ns_scholarship_student (student_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $ready = true;
}

/** Count words in an answer (used to enforce the per-answer limit). */
function new_school_word_count(string $text): int
{
    $trimmed = trim($text);
    if ($trimmed === '') {
        return 0;
    }
    return count(preg_split('/\s+/u', $trimmed) ?: []);
}

/** Decoded scholarship record for a student, or null if not answered yet. */
function new_school_scholarship_fetch(int $studentId): ?array
{
    new_school_scholarship_ensure_schema();
    $stmt = db()->prepare('SELECT answers, completed_at FROM new_school_scholarship_answers WHERE student_id = ? LIMIT 1');
    $stmt->execute([$studentId]);
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }
    $decoded = json_decode((string) $row['answers'], true);
    return [
        'answers' => is_array($decoded) ? $decoded : [],
        'completed_at' => $row['completed_at'],
        'completed' => !empty($row['completed_at']),
    ];
}

/** True once the student has finished the questionnaire. */
function new_school_scholarship_completed(int $studentId): bool
{
    $record = new_school_scholarship_fetch($studentId);
    return $record !== null && !empty($record['completed']);
}

/**
 * Validate + persist a student's answers. $items is a list of
 * {key, question, answer}. Throws RuntimeException (422-friendly) on bad input.
 */
function new_school_scholarship_save(int $studentId, array $items): array
{
    new_school_scholarship_ensure_schema();
    $clean = [];
    foreach ($items as $item) {
        if (!is_array($item)) {
            continue;
        }
        $key = trim((string) ($item['key'] ?? ''));
        $question = trim((string) ($item['question'] ?? ''));
        $answer = trim((string) ($item['answer'] ?? ''));
        if ($key === '' || $question === '') {
            continue;
        }
        if ($answer === '') {
            throw new RuntimeException('Please answer every question before you finish.');
        }
        if (new_school_word_count($answer) > NS_SCHOLARSHIP_WORD_LIMIT) {
            throw new RuntimeException('Each answer must be ' . NS_SCHOLARSHIP_WORD_LIMIT . ' words or fewer.');
        }
        $clean[] = ['key' => $key, 'question' => $question, 'answer' => $answer];
    }
    if ($clean === []) {
        throw new RuntimeException('Please answer the scholarship questions before you finish.');
    }
    $json = json_encode($clean, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    db()->prepare(
        'INSERT INTO new_school_scholarship_answers (student_id, answers, completed_at)
         VALUES (?, ?, NOW())
         ON DUPLICATE KEY UPDATE answers = VALUES(answers), completed_at = NOW(), updated_at = NOW()'
    )->execute([$studentId, $json]);

    return new_school_scholarship_fetch($studentId) ?? ['answers' => $clean, 'completed' => true, 'completed_at' => null];
}

/** Map of student_id => decoded scholarship record, for the admin summary. */
function new_school_fetch_scholarship_by_student_ids(array $studentIds): array
{
    new_school_scholarship_ensure_schema();
    $studentIds = array_values(array_filter(array_map('intval', $studentIds), static fn(int $id): bool => $id > 0));
    if ($studentIds === []) {
        return [];
    }
    $stmt = db()->prepare(
        'SELECT student_id, answers, completed_at FROM new_school_scholarship_answers
         WHERE student_id IN (' . new_school_placeholder_list(count($studentIds)) . ')'
    );
    $stmt->execute($studentIds);
    $out = [];
    foreach ($stmt->fetchAll() as $row) {
        $decoded = json_decode((string) $row['answers'], true);
        $out[(int) $row['student_id']] = [
            'answers' => is_array($decoded) ? $decoded : [],
            'completed_at' => $row['completed_at'],
            'completed' => !empty($row['completed_at']),
        ];
    }
    return $out;
}

function new_school_points_ensure_schema(): void
{
    static $ready = false;
    if ($ready) {
        return;
    }
    db()->exec(
        "CREATE TABLE IF NOT EXISTS new_school_points (
            id INT AUTO_INCREMENT PRIMARY KEY,
            recipient_role ENUM('student','teacher') NOT NULL,
            recipient_id INT NOT NULL,
            source_type ENUM('interview','project','referral') NOT NULL,
            source_id INT NOT NULL,
            kind ENUM('auto','bonus') NOT NULL,
            points INT NOT NULL DEFAULT 0,
            awarded_by_user_id INT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_points_source (recipient_role, recipient_id, source_type, source_id, kind),
            INDEX idx_points_recipient (recipient_role, recipient_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $ready = true;
}

function new_school_points_award(string $role, int $recipientId, string $sourceType, int $sourceId, string $kind, int $points, ?int $awardedBy = null): void
{
    if ($recipientId <= 0 || $sourceId <= 0) {
        return;
    }
    if (!in_array($role, ['student', 'teacher'], true)
        || !in_array($sourceType, ['interview', 'project', 'referral'], true)
        || !in_array($kind, ['auto', 'bonus'], true)) {
        return;
    }
    new_school_points_ensure_schema();
    $stmt = db()->prepare(
        'INSERT INTO new_school_points (recipient_role, recipient_id, source_type, source_id, kind, points, awarded_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            updated_at = IF(points <> VALUES(points) OR NOT (awarded_by_user_id <=> VALUES(awarded_by_user_id)), NOW(), updated_at),
            points = VALUES(points),
            awarded_by_user_id = VALUES(awarded_by_user_id)'
    );
    $stmt->execute([$role, $recipientId, $sourceType, $sourceId, $kind, $points, $awardedBy]);
    // Only invalidate the rankings cache when this actually inserted or changed a row.
    // Auto-awards (e.g. the referral award) re-run on every dashboard load, so an
    // unconditional dirty flag would rebuild the cache on each page view for no reason.
    if ($stmt->rowCount() > 0) {
        $GLOBALS['__ns_points_dirty'] = true;
    }
}

function new_school_points_clear(string $sourceType, int $sourceId, string $kind): void
{
    if ($sourceId <= 0) {
        return;
    }
    new_school_points_ensure_schema();
    $stmt = db()->prepare('DELETE FROM new_school_points WHERE source_type = ? AND source_id = ? AND kind = ?');
    $stmt->execute([$sourceType, $sourceId, $kind]);
    // Only invalidate the rankings cache when a row was actually removed — this is called
    // on every status refresh, so a blind dirty flag would rebuild the cache for nothing.
    if ($stmt->rowCount() > 0) {
        $GLOBALS['__ns_points_dirty'] = true;
    }
}

function new_school_points_teacher_for_student(int $studentId): int
{
    $stmt = db()->prepare('SELECT teacher_id FROM new_school_students WHERE id = ? LIMIT 1');
    $stmt->execute([$studentId]);
    $row = $stmt->fetch();
    return $row ? (int) ($row['teacher_id'] ?? 0) : 0;
}

function new_school_points_award_auto(int $studentId, string $sourceType, int $sourceId): void
{
    if ($studentId <= 0 || $sourceId <= 0) {
        return;
    }
    new_school_points_award('student', $studentId, $sourceType, $sourceId, 'auto', NS_POINTS_STUDENT_AUTO);
    $teacherId = new_school_points_teacher_for_student($studentId);
    if ($teacherId > 0) {
        new_school_points_award('teacher', $teacherId, $sourceType, $sourceId, 'auto', NS_POINTS_TEACHER_AUTO);
    }
}

function new_school_points_award_bonus(int $studentId, string $sourceType, int $sourceId, int $studentPoints, int $teacherPoints, ?int $awardedBy = null): void
{
    if ($studentId <= 0 || $sourceId <= 0) {
        return;
    }
    $studentPoints = max(0, min(NS_POINTS_STUDENT_BONUS_MAX, $studentPoints));
    $teacherPoints = max(0, min(NS_POINTS_TEACHER_BONUS_MAX, $teacherPoints));
    new_school_points_award('student', $studentId, $sourceType, $sourceId, 'bonus', $studentPoints, $awardedBy);
    $teacherId = new_school_points_teacher_for_student($studentId);
    if ($teacherId > 0) {
        new_school_points_award('teacher', $teacherId, $sourceType, $sourceId, 'bonus', $teacherPoints, $awardedBy);
    }
}

function new_school_points_totals_map(string $role): array
{
    static $cache = [];
    if (!empty($GLOBALS['__ns_points_dirty'])) {
        $cache = [];
        $GLOBALS['__ns_points_dirty'] = false;
    }
    if (array_key_exists($role, $cache)) {
        return $cache[$role];
    }
    new_school_points_ensure_schema();
    $stmt = db()->prepare('SELECT recipient_id, COALESCE(SUM(points), 0) AS total FROM new_school_points WHERE recipient_role = ? GROUP BY recipient_id');
    $stmt->execute([$role]);
    $map = [];
    foreach ($stmt->fetchAll() as $row) {
        $map[(int) $row['recipient_id']] = (int) $row['total'];
    }
    $cache[$role] = $map;
    return $map;
}

function new_school_points_total(string $role, int $recipientId): int
{
    $map = new_school_points_totals_map($role);
    return (int) ($map[$recipientId] ?? 0);
}

/* ---------------- 215-point automatic dashboard model (Phase 2) ---------------- */

/** Supporting-material types => label. 5 points each, 6 types = 30 max. */
function ns_supporting_material_types(): array
{
    return [
        'business_card'          => 'Business Card',
        'photo'                  => 'Photo',
        'storefront_photo'       => 'Storefront Photo',
        'website_screenshot'     => 'Website Screenshot',
        'social_media_screenshot' => 'Social Media Screenshot',
        'flyer'                  => 'Flyer / Menu / Brochure',
    ];
}

/** Admin bonus points a student has been granted (ledger, kind='bonus'). */
function new_school_student_admin_bonus(int $studentId): int
{
    new_school_points_ensure_schema();
    $stmt = db()->prepare(
        "SELECT COALESCE(SUM(points), 0) FROM new_school_points WHERE recipient_role = 'student' AND kind = 'bonus' AND recipient_id = ?"
    );
    $stmt->execute([$studentId]);
    return (int) $stmt->fetchColumn();
}

/** Bulk map student_id => admin bonus total (for rankings). Cached per request. */
function new_school_student_bonus_map(): array
{
    static $cache = null;
    if ($cache !== null && empty($GLOBALS['__ns_points_dirty'])) {
        return $cache;
    }
    new_school_points_ensure_schema();
    $map = [];
    foreach (db()->query("SELECT recipient_id, COALESCE(SUM(points),0) AS t FROM new_school_points WHERE recipient_role='student' AND kind='bonus' GROUP BY recipient_id")->fetchAll() as $r) {
        $map[(int) $r['recipient_id']] = (int) $r['t'];
    }
    $cache = $map;
    return $map;
}

/** True when a submission row carries a completed AI / community bonus item. */
function ns_submission_has_ai(?array $sub): bool
{
    return $sub !== null && (trim((string) ($sub['ai_url'] ?? '')) !== '' || trim((string) ($sub['ai_note'] ?? '')) !== '');
}
function ns_submission_has_community(?array $sub): bool
{
    return $sub !== null && (trim((string) ($sub['community_url'] ?? '')) !== '' || trim((string) ($sub['community_note'] ?? '')) !== '');
}

/**
 * Compute the 215-point automatic breakdown from prepared parts.
 * Uses the student's workflow gates (parent/school/teacher = 'approved'), the count
 * of signed ("verified") interviews, distinct supporting-material types, and the
 * submission's video / written / AI / community items.
 */
function new_school_automatic_parts(array $student, int $verifiedInterviews, int $materialTypes, ?array $sub): array
{
    return [
        'registered'   => true, // an existing student record = registered + email verified
        'parent_ok'    => (string) ($student['parent_consent_status'] ?? '') === 'approved',
        'school_ok'    => (string) ($student['school_approval_status'] ?? '') === 'approved',
        'teacher_ok'   => (string) ($student['teacher_approval_status'] ?? '') === 'approved',
        'verified_interviews' => max(0, $verifiedInterviews),
        'material_types'      => max(0, $materialTypes),
        'has_video'     => $sub !== null && trim((string) ($sub['video_url'] ?? '')) !== '',
        'has_written'   => $sub !== null && trim((string) ($sub['written_url'] ?? '')) !== '',
        'has_ai'        => ns_submission_has_ai($sub),
        'has_community' => ns_submission_has_community($sub),
    ];
}

function new_school_automatic_breakdown(array $p): array
{
    $rows = [
        ['registration',    'Student Registration',   $p['registered'] ? 5 : 0, 5],
        ['parent_consent',  'Parent Consent',          $p['parent_ok'] ? 10 : 0, 10],
        ['school_verified', 'School Verified',          $p['school_ok'] ? 10 : 0, 10],
        ['teacher_verified','Teacher Verified',         $p['teacher_ok'] ? 10 : 0, 10],
        ['interviews',      'Business Interviews',      min(10, (int) $p['verified_interviews']) * 10, 100],
        ['materials',       'Supporting Materials',     min(6, (int) $p['material_types']) * 5, 30],
        ['video',           'Video Upload',             $p['has_video'] ? 20 : 0, 20],
        ['written',         'Written Report',           $p['has_written'] ? 20 : 0, 20],
        ['ai_bonus',        'AI Demonstration (bonus)', $p['has_ai'] ? 10 : 0, 10],
        ['community_bonus', 'Community Service (bonus)', $p['has_community'] ? 10 : 0, 10],
    ];
    $breakdown = [];
    $total = 0;
    $maxTotal = 0;
    foreach ($rows as [$key, $label, $points, $max]) {
        $breakdown[] = ['key' => $key, 'label' => $label, 'points' => $points, 'max' => $max];
        $total += $points;
        $maxTotal += $max;
    }
    // Sum of the category maxima (5+10+10+10+100+30+20+20+10+10 = 225). The spec's
    // headline "215" under-counts one bonus; we expose the true achievable maximum.
    return ['breakdown' => $breakdown, 'total' => $total, 'max' => $maxTotal];
}

/**
 * Full dashboard points for one student: the 215 automatic breakdown + admin bonus.
 * `total` (= automatic + bonus) is the number shown on the dashboard, used for the
 * leaderboard, and fed into the judge final score.
 */
function new_school_dashboard_points(int $studentId, ?array $student = null): array
{
    if ($student === null) {
        $student = new_school_fetch_student_by_id($studentId);
    }
    if (!$student) {
        return ['breakdown' => [], 'automatic_total' => 0, 'admin_bonus' => 0, 'total' => 0, 'max' => 215];
    }

    $verified = 0;
    try {
        $vStmt = db()->prepare("SELECT COUNT(*) FROM new_school_business_interviews WHERE student_id = ? AND signature IS NOT NULL AND signature <> ''");
        $vStmt->execute([$studentId]);
        $verified = (int) $vStmt->fetchColumn();
    } catch (\Throwable $e) { /* signature column may not exist pre-migration */ }

    $mTypes = 0;
    try {
        $mStmt = db()->prepare('SELECT COUNT(DISTINCT material_type) FROM new_school_supporting_materials WHERE student_id = ?');
        $mStmt->execute([$studentId]);
        $mTypes = (int) $mStmt->fetchColumn();
    } catch (\Throwable $e) { /* table may not exist pre-migration */ }

    $sub = new_school_fetch_submission_by_student_id($studentId);
    $parts = new_school_automatic_parts($student, $verified, $mTypes, $sub);
    $bd = new_school_automatic_breakdown($parts);
    $bonus = new_school_student_admin_bonus($studentId);

    return [
        'breakdown' => $bd['breakdown'],
        'automatic_total' => $bd['total'],
        'admin_bonus' => $bonus,
        'total' => $bd['total'] + $bonus,
        'max' => $bd['max'],
    ];
}

/* ---------------- Judge scoring (multi-judge rubric) ---------------- */

const NS_JUDGE_MAX_TOTAL = 135;

/** Rubric categories => [label, max points]. Order defines display order. */
function ns_judge_categories(): array
{
    return [
        'problem'             => ['Problem Identification', 20],
        'solution'            => ['Quality of Solution', 50],
        'creativity'          => ['Creativity & Innovation', 20],
        'supporting_evidence' => ['Supporting Evidence', 10],
        'community_impact'    => ['Community Impact', 20],
        'presentation'        => ['Presentation', 15],
    ];
}

/** Self-healing schema for the judge tables (safe if the migration hasn't run). */
function new_school_judge_ensure_schema(): void
{
    static $ready = false;
    if ($ready) {
        return;
    }
    $pdo = db();
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS new_school_judges (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL UNIQUE,
            display_name VARCHAR(120) NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS new_school_judge_scores (
            id INT AUTO_INCREMENT PRIMARY KEY,
            submission_id INT NOT NULL,
            judge_user_id INT NOT NULL,
            problem TINYINT UNSIGNED NOT NULL DEFAULT 0,
            solution TINYINT UNSIGNED NOT NULL DEFAULT 0,
            creativity TINYINT UNSIGNED NOT NULL DEFAULT 0,
            supporting_evidence TINYINT UNSIGNED NOT NULL DEFAULT 0,
            community_impact TINYINT UNSIGNED NOT NULL DEFAULT 0,
            presentation TINYINT UNSIGNED NOT NULL DEFAULT 0,
            total INT NOT NULL DEFAULT 0,
            notes TEXT DEFAULT NULL,
            status ENUM('draft','submitted') NOT NULL DEFAULT 'draft',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_judge_submission (submission_id, judge_user_id),
            KEY idx_judge_scores_submission (submission_id, status),
            KEY idx_judge_scores_judge (judge_user_id, status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $ready = true;
}

/** Clamp raw category inputs to their maxima and return [values, total]. */
function ns_judge_clamp_scores(array $scores): array
{
    $values = [];
    $total = 0;
    foreach (ns_judge_categories() as $key => [$label, $max]) {
        $v = max(0, min((int) $max, (int) ($scores[$key] ?? 0)));
        $values[$key] = $v;
        $total += $v;
    }
    return [$values, $total];
}

/** Insert or update one judge's score row for a submission (idempotent). */
function new_school_judge_score_upsert(int $submissionId, int $judgeUserId, array $scores, string $notes, string $status): array
{
    new_school_judge_ensure_schema();
    new_school_workflow_ensure_schema();
    [$values, $total] = ns_judge_clamp_scores($scores);
    $status = $status === 'submitted' ? 'submitted' : 'draft';

    // Capture the prior total for the audit trail.
    $prevStmt = db()->prepare('SELECT total FROM new_school_judge_scores WHERE submission_id = ? AND judge_user_id = ? LIMIT 1');
    $prevStmt->execute([$submissionId, $judgeUserId]);
    $prev = $prevStmt->fetchColumn();
    $oldTotal = $prev === false ? null : (int) $prev;

    $stmt = db()->prepare(
        'INSERT INTO new_school_judge_scores
            (submission_id, judge_user_id, problem, solution, creativity, supporting_evidence, community_impact, presentation, total, notes, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            problem = VALUES(problem), solution = VALUES(solution), creativity = VALUES(creativity),
            supporting_evidence = VALUES(supporting_evidence), community_impact = VALUES(community_impact),
            presentation = VALUES(presentation), total = VALUES(total), notes = VALUES(notes),
            status = VALUES(status), updated_at = NOW()'
    );
    $stmt->execute([
        $submissionId, $judgeUserId,
        $values['problem'], $values['solution'], $values['creativity'],
        $values['supporting_evidence'], $values['community_impact'], $values['presentation'],
        $total, $notes !== '' ? $notes : null, $status,
    ]);

    // Audit trail: log every create/update with the category detail.
    try {
        $detail = json_encode(['scores' => $values, 'status' => $status], JSON_UNESCAPED_SLASHES);
        db()->prepare(
            'INSERT INTO new_school_judge_score_audit (submission_id, judge_user_id, action, old_total, new_total, detail)
             VALUES (?, ?, ?, ?, ?, ?)'
        )->execute([$submissionId, $judgeUserId, $oldTotal === null ? 'create' : 'update', $oldTotal, $total, $detail]);
    } catch (\Throwable $e) { /* audit is best-effort */ }

    return ['scores' => $values, 'total' => $total, 'status' => $status];
}

/** Average of submitted judge totals for a submission (null if none submitted). */
function new_school_judge_average(int $submissionId): ?float
{
    new_school_judge_ensure_schema();
    $stmt = db()->prepare(
        "SELECT AVG(total) FROM new_school_judge_scores WHERE submission_id = ? AND status = 'submitted'"
    );
    $stmt->execute([$submissionId]);
    $avg = $stmt->fetchColumn();
    return ($avg === null || $avg === false) ? null : round((float) $avg, 2);
}

/**
 * Final competition score for a submission.
 * automatic  = current automatic dashboard points for the student (swappable later)
 * judge_average = average of submitted judge totals (0-135), or null
 * final = automatic + round(judge_average)
 */
function new_school_final_score(int $submissionId, ?int $studentId = null): array
{
    if ($studentId === null) {
        $stmt = db()->prepare('SELECT student_id FROM new_school_submissions WHERE id = ? LIMIT 1');
        $stmt->execute([$submissionId]);
        $studentId = (int) $stmt->fetchColumn();
    }
    $automatic = $studentId > 0 ? new_school_dashboard_points($studentId)['total'] : 0;
    $avg = new_school_judge_average($submissionId);
    $final = $automatic + ($avg !== null ? (int) round($avg) : 0);
    return ['automatic' => $automatic, 'judge_average' => $avg, 'final' => $final];
}

/** All judges' score rows for a submission (admin breakdown), newest first. */
function new_school_judge_scores_for_submission(int $submissionId): array
{
    new_school_judge_ensure_schema();
    $stmt = db()->prepare(
        'SELECT js.*, u.full_name AS judge_name, u.email AS judge_email
         FROM new_school_judge_scores js
         JOIN users u ON u.id = js.judge_user_id
         WHERE js.submission_id = ?
         ORDER BY js.status DESC, js.updated_at DESC'
    );
    $stmt->execute([$submissionId]);
    return $stmt->fetchAll() ?: [];
}

/* ---------------- Judge workflow: settings, assignment, certification, reports ---------------- */

/** Self-healing schema for the workflow tables. */
function new_school_workflow_ensure_schema(): void
{
    static $ready = false;
    if ($ready) {
        return;
    }
    $pdo = db();
    $pdo->exec("CREATE TABLE IF NOT EXISTS new_school_settings (setting_key VARCHAR(64) NOT NULL PRIMARY KEY, setting_value VARCHAR(255) DEFAULT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("CREATE TABLE IF NOT EXISTS new_school_judge_assignments (id INT AUTO_INCREMENT PRIMARY KEY, judge_user_id INT NOT NULL, submission_id INT NOT NULL, status ENUM('assigned','recused') NOT NULL DEFAULT 'assigned', recuse_reason VARCHAR(255) DEFAULT NULL, assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY uniq_judge_assignment (judge_user_id, submission_id), KEY idx_assignment_judge (judge_user_id, status), KEY idx_assignment_submission (submission_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("CREATE TABLE IF NOT EXISTS new_school_judge_score_audit (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, submission_id INT NOT NULL, judge_user_id INT NOT NULL, action VARCHAR(20) NOT NULL DEFAULT 'update', old_total INT DEFAULT NULL, new_total INT DEFAULT NULL, detail TEXT DEFAULT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY idx_audit_submission (submission_id, created_at), KEY idx_audit_judge (judge_user_id, created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("CREATE TABLE IF NOT EXISTS new_school_reports (id INT AUTO_INCREMENT PRIMARY KEY, submission_id INT DEFAULT NULL, reporter_user_id INT DEFAULT NULL, reason VARCHAR(80) NOT NULL, notes TEXT DEFAULT NULL, status ENUM('open','reviewed','dismissed') NOT NULL DEFAULT 'open', created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, KEY idx_reports_status (status, created_at), KEY idx_reports_submission (submission_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $ready = true;
}

/** Read a challenge setting (string) with a default. */
function ns_setting_get(string $key, string $default = ''): string
{
    new_school_workflow_ensure_schema();
    $stmt = db()->prepare('SELECT setting_value FROM new_school_settings WHERE setting_key = ? LIMIT 1');
    $stmt->execute([$key]);
    $v = $stmt->fetchColumn();
    return $v === false || $v === null ? $default : (string) $v;
}

/** Write a challenge setting. */
function ns_setting_set(string $key, string $value): void
{
    new_school_workflow_ensure_schema();
    db()->prepare('INSERT INTO new_school_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()')
        ->execute([$key, $value]);
}

function ns_anonymous_judging(): bool
{
    return filter_var(ns_setting_get('anonymous_judging', 'false'), FILTER_VALIDATE_BOOLEAN);
}
function ns_results_published(): bool
{
    return filter_var(ns_setting_get('results_published', 'false'), FILTER_VALIDATE_BOOLEAN);
}

/* ---------------- Submission window (admin-editable deadline) ----------------
 * Registration and dashboards stay open always. This deadline only controls
 * whether students can still ADD business interviews or SUBMIT their project.
 */
function ns_submission_open_date(): string
{
    return ns_setting_get('submission_open_date', '2026-06-27');
}
function ns_submission_deadline(): string
{
    return ns_setting_get('submission_deadline', '2026-08-25');
}
function ns_submission_mode(): string
{
    $m = ns_setting_get('submission_mode', 'auto');
    return in_array($m, ['auto', 'open', 'closed'], true) ? $m : 'auto';
}
/** True when students can still submit interviews/projects (manual override wins over the date window). */
function ns_submissions_open(): bool
{
    $mode = ns_submission_mode();
    if ($mode === 'open') {
        return true;
    }
    if ($mode === 'closed') {
        return false;
    }
    // auto: today must fall within [open date, deadline] inclusive (YYYY-MM-DD compares lexically).
    $today = date('Y-m-d');
    return $today >= ns_submission_open_date() && $today <= ns_submission_deadline();
}

/* ---------------- Public results / winners / award ceremony ---------------- */
/** Admin toggle: are the winners revealed on the public site yet? */
function ns_winners_published(): bool
{
    return filter_var(ns_setting_get('winners_published', 'false'), FILTER_VALIDATE_BOOLEAN);
}
/** Which lifecycle phase the public Results section should show. */
function ns_challenge_phase(): string
{
    if (ns_winners_published()) {
        return 'results';
    }
    if (date('Y-m-d') > ns_submission_deadline()) {
        return 'judging';
    }
    return 'challenge';
}
/** Admin-editable award ceremony details shown once winners are published. */
function ns_award_ceremony(): array
{
    return [
        'date' => ns_setting_get('ceremony_date', ''),
        'venue' => ns_setting_get('ceremony_venue', ''),
        'description' => ns_setting_get('ceremony_description', ''),
        'link' => ns_setting_get('ceremony_link', ''),
    ];
}
function ns_award_ceremony_save(array $c): array
{
    ns_setting_set('ceremony_date', mb_substr(trim((string) ($c['date'] ?? '')), 0, 120));
    ns_setting_set('ceremony_venue', mb_substr(trim((string) ($c['venue'] ?? '')), 0, 200));
    ns_setting_set('ceremony_description', mb_substr(trim((string) ($c['description'] ?? '')), 0, 600));
    $link = trim((string) ($c['link'] ?? ''));
    if ($link !== '' && !preg_match('#^https?://#i', $link)) {
        $link = 'https://' . $link;
    }
    ns_setting_set('ceremony_link', mb_substr($link, 0, 300));
    return ns_award_ceremony();
}

/* ==================== Our Partners page (dynamic directory) ==================== */

/** Self-healing schema for the partners directory + its editable page content. */
function partners_ensure_schema(): void
{
    static $ready = false;
    if ($ready) {
        return;
    }
    $pdo = db();
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS partners (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(160) NOT NULL,
            logo_url VARCHAR(400) DEFAULT NULL,
            partner_type VARCHAR(60) DEFAULT NULL,
            industry VARCHAR(60) DEFAULT NULL,
            borough VARCHAR(60) DEFAULT NULL,
            county VARCHAR(60) DEFAULT NULL,
            location VARCHAR(120) DEFAULT NULL,
            partner_since VARCHAR(12) DEFAULT NULL,
            website VARCHAR(300) DEFAULT NULL,
            blurb TEXT DEFAULT NULL,
            is_featured TINYINT(1) NOT NULL DEFAULT 0,
            is_media_partner TINYINT(1) NOT NULL DEFAULT 0,
            status ENUM('draft','published') NOT NULL DEFAULT 'published',
            sort_order INT NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_partners_status (status, sort_order)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS partner_settings (
            setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
            setting_value TEXT DEFAULT NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $ready = true;
    partner_seed_defaults();
}

function partner_setting_get(string $key, string $default = ''): string
{
    $stmt = db()->prepare('SELECT setting_value FROM partner_settings WHERE setting_key = ? LIMIT 1');
    $stmt->execute([$key]);
    $v = $stmt->fetchColumn();
    return $v === false || $v === null ? $default : (string) $v;
}
function partner_setting_set(string $key, string $value): void
{
    db()->prepare('INSERT INTO partner_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()')
        ->execute([$key, $value]);
}

/** Seed the partner directory + page content once (no-op if data already present). */
function partner_seed_defaults(): void
{
    $pdo = db();
    if ((int) $pdo->query('SELECT COUNT(*) FROM partners')->fetchColumn() === 0) {
        // Mirrors the current /partner page. Logos are added later via the admin
        // (uploads), so logo_url is left null and the UI shows an initials placeholder.
        // Columns: name, type, industry, borough, county, location, since, media, featured, blurb
        $seed = [
            ['JPMorganChase', 'Founding Partner', 'Financial', 'Manhattan', '', 'New York, NY', '2021', 0, 0, 'Building stronger futures and creating opportunity for all.'],
            ['EmblemHealth', 'Presenting Sponsor', 'Healthcare', 'Manhattan', '', 'New York, NY', '2023', 0, 1, 'EmblemHealth is committed to improving the health and well-being of our communities through innovative programs and strong partnerships. Impact areas: Health · Education · Youth.'],
            ['Montefiore', 'Presenting Sponsor', 'Healthcare', 'Bronx', '', 'Bronx, NY', '2022', 0, 0, ''],
            ['Verizon', 'Presenting Sponsor', 'Technology', 'Manhattan', '', 'New York, NY', '2022', 0, 0, ''],
            ['Con Edison', 'Presenting Sponsor', 'Utilities', 'Manhattan', '', 'New York, NY', '2022', 0, 0, ''],
            ['Wells Fargo', 'Presenting Sponsor', 'Financial', 'Manhattan', '', 'New York, NY', '2022', 0, 0, ''],
            ['PIX11', 'Media Partner', 'Television', 'Manhattan', '', 'New York, NY', '2021', 1, 0, ''],
            ['1010 WINS', 'Media Partner', 'Radio & News', 'Manhattan', '', 'New York, NY', '2023', 1, 0, ''],
            ['amNewYork', 'Media Partner', 'Media', 'Manhattan', '', 'New York, NY', '2023', 1, 0, ''],
            ['Schneps Media', 'Media Partner', 'Media', 'Manhattan', '', 'New York, NY', '2023', 1, 0, ''],
            ['BronxNet', 'Media Partner', 'Television', 'Bronx', '', 'Bronx, NY', '2022', 1, 0, ''],
            ['Yonkers Public Schools', 'School Partner', 'Education', '', 'Westchester', 'Yonkers, NY', '2022', 0, 0, '2,800+ Students Engaged · 120+ Interviews Completed'],
            ['Google', 'Business Partner', 'Technology', 'Manhattan', '', 'New York, NY', '2023', 0, 0, ''],
            ['Westchester County Government', 'Government Partner', 'Government', '', 'Westchester', 'White Plains, NY', '2022', 0, 0, ''],
            ['Barclays Center', 'Venue Partner', 'Sports & Entertainment', 'Brooklyn', '', 'Brooklyn, NY', '2023', 0, 0, ''],
        ];
        $ins = $pdo->prepare(
            'INSERT INTO partners (name, partner_type, industry, borough, county, location, partner_since, is_media_partner, is_featured, blurb, status, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "published", ?)'
        );
        foreach ($seed as $i => $r) {
            $ins->execute([$r[0], $r[1], $r[2], $r[3] ?: null, $r[4] ?: null, $r[5], $r[6], $r[7], $r[8], $r[9] ?: null, $i]);
        }
    }
    if ((int) $pdo->query('SELECT COUNT(*) FROM partner_settings')->fetchColumn() === 0) {
        partner_setting_set('hero_title', 'Our Partners');
        partner_setting_set('hero_subtitle', 'Building Stronger Communities Together');
        partner_setting_set('hero_tagline', "Every organization displayed here has chosen to invest in innovation, education, entrepreneurship, and stronger local communities. Together, we're creating opportunities that benefit students, schools, businesses, and neighborhoods throughout New York.");
        partner_setting_set('stats_json', json_encode([
            ['label' => 'Sponsors', 'value' => '32'],
            ['label' => 'Schools', 'value' => '145'],
            ['label' => 'Businesses', 'value' => '680'],
            ['label' => 'Media Partners', 'value' => '18'],
            ['label' => 'Government', 'value' => '9'],
            ['label' => 'Community', 'value' => '11'],
        ]));
        partner_setting_set('cta_title', 'Stronger Together');
        partner_setting_set('cta_text', 'Join the growing network of organizations that are helping us create opportunities, inspire students, and build stronger communities.');
        partner_setting_set('cta_button_label', 'Partner With Us');
        partner_setting_set('cta_button_link', '/become-a-founding-sponsor');
    }
}

/** Editable page content (hero + impact stats + CTA). */
function partner_page_payload(): array
{
    $stats = json_decode(partner_setting_get('stats_json', '[]'), true);
    return [
        'hero' => [
            'title' => partner_setting_get('hero_title', 'Our Partners'),
            'subtitle' => partner_setting_get('hero_subtitle', 'Building Stronger Communities Together'),
            'tagline' => partner_setting_get('hero_tagline', ''),
            'image' => partner_setting_get('hero_image', ''),
        ],
        'stats' => is_array($stats) ? $stats : [],
        'cta' => [
            'title' => partner_setting_get('cta_title', 'Partner With Us'),
            'text' => partner_setting_get('cta_text', ''),
            'button_label' => partner_setting_get('cta_button_label', 'Become a Partner'),
            'button_link' => partner_setting_get('cta_button_link', '/become-a-founding-sponsor'),
        ],
    ];
}

/** Persist page content from an admin payload; returns the fresh payload. */
function partner_page_save(array $b): array
{
    partner_setting_set('hero_title', mb_substr(trim((string) ($b['hero']['title'] ?? '')), 0, 120));
    partner_setting_set('hero_subtitle', mb_substr(trim((string) ($b['hero']['subtitle'] ?? '')), 0, 160));
    partner_setting_set('hero_tagline', mb_substr(trim((string) ($b['hero']['tagline'] ?? '')), 0, 300));
    partner_setting_set('hero_image', mb_substr(trim((string) ($b['hero']['image'] ?? '')), 0, 400));
    $stats = [];
    foreach ((array) ($b['stats'] ?? []) as $s) {
        if (!is_array($s)) continue;
        $label = mb_substr(trim((string) ($s['label'] ?? '')), 0, 60);
        $value = mb_substr(trim((string) ($s['value'] ?? '')), 0, 40);
        if ($label !== '' || $value !== '') $stats[] = ['label' => $label, 'value' => $value];
        if (count($stats) >= 6) break;
    }
    partner_setting_set('stats_json', json_encode($stats));
    partner_setting_set('cta_title', mb_substr(trim((string) ($b['cta']['title'] ?? '')), 0, 120));
    partner_setting_set('cta_text', mb_substr(trim((string) ($b['cta']['text'] ?? '')), 0, 400));
    partner_setting_set('cta_button_label', mb_substr(trim((string) ($b['cta']['button_label'] ?? '')), 0, 60));
    partner_setting_set('cta_button_link', mb_substr(trim((string) ($b['cta']['button_link'] ?? '')), 0, 300));
    return partner_page_payload();
}

/** Public payload: published partners + distinct filter values. */
function partner_public_payload(): array
{
    $rows = db()->query(
        "SELECT id, name, logo_url, partner_type, industry, borough, county, location, partner_since, website, blurb, is_featured, is_media_partner, sort_order
         FROM partners WHERE status = 'published' ORDER BY is_featured DESC, sort_order ASC, name ASC"
    )->fetchAll();
    $uniq = static function (string $col) use ($rows): array {
        $vals = array_values(array_unique(array_filter(array_map(static fn(array $r): string => trim((string) ($r[$col] ?? '')), $rows))));
        sort($vals);
        return $vals;
    };
    return [
        'page' => partner_page_payload(),
        'partners' => $rows,
        'types' => $uniq('partner_type'),
        'industries' => $uniq('industry'),
        'boroughs' => $uniq('borough'),
        'counties' => $uniq('county'),
    ];
}

/** Normalize + bound a partner record from an admin request body. */
function partner_values_from_body(array $b): array
{
    $link = trim((string) ($b['website'] ?? ''));
    if ($link !== '' && !preg_match('#^https?://#i', $link)) {
        $link = 'https://' . $link;
    }
    return [
        'name' => mb_substr(trim((string) ($b['name'] ?? '')), 0, 160),
        'logo_url' => mb_substr(trim((string) ($b['logo_url'] ?? '')), 0, 400) ?: null,
        'partner_type' => mb_substr(trim((string) ($b['partner_type'] ?? '')), 0, 60) ?: null,
        'industry' => mb_substr(trim((string) ($b['industry'] ?? '')), 0, 60) ?: null,
        'borough' => mb_substr(trim((string) ($b['borough'] ?? '')), 0, 60) ?: null,
        'county' => mb_substr(trim((string) ($b['county'] ?? '')), 0, 60) ?: null,
        'location' => mb_substr(trim((string) ($b['location'] ?? '')), 0, 120) ?: null,
        'partner_since' => mb_substr(trim((string) ($b['partner_since'] ?? '')), 0, 12) ?: null,
        'website' => mb_substr($link, 0, 300) ?: null,
        'blurb' => mb_substr(trim((string) ($b['blurb'] ?? '')), 0, 2000) ?: null,
        'is_featured' => !empty($b['is_featured']) ? 1 : 0,
        'is_media_partner' => !empty($b['is_media_partner']) ? 1 : 0,
        'status' => (($b['status'] ?? 'published') === 'draft') ? 'draft' : 'published',
        'sort_order' => (int) ($b['sort_order'] ?? 0),
    ];
}

/* ==================== Business dashboard (ecosystem role) ==================== */

/**
 * Widen the users.role ENUM so the ecosystem roles (business, sponsor, partner,
 * media, volunteer) can be stored. Self-healing + guarded so the ALTER runs at
 * most once per request and is skipped entirely once the column already lists
 * the new values.
 */
function roles_ensure_enum(): void
{
    static $ready = false;
    if ($ready) return;
    try {
        $col = db()->query(
            "SELECT COLUMN_TYPE FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role' LIMIT 1"
        )->fetchColumn();
        if (is_string($col) && stripos($col, "'business'") === false) {
            db()->exec(
                "ALTER TABLE users MODIFY role
                 ENUM('member','vip','editor','admin','super_admin','student','parent','school','teacher','judge','business','sponsor','partner','media','volunteer')
                 NOT NULL DEFAULT 'member'"
            );
        }
        $ready = true;
    } catch (Throwable $e) {
        if (app_debug()) error_log('roles_ensure_enum failed: ' . $e->getMessage());
    }
}

/** Require a signed-in business account (admins allowed for support). */
function require_business(): array
{
    $u = require_login();
    if (!in_array($u['role'], ['business', 'admin', 'super_admin'], true)) {
        json(['error' => 'Business account required.'], 403);
    }
    return $u;
}

/** Self-healing schema for business accounts, their opportunity requests, and the interview link column. */
function business_ensure_schema(): void
{
    static $ready = false;
    if ($ready) return;
    $pdo = db();
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS business_accounts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL UNIQUE,
            business_name VARCHAR(160) NOT NULL,
            category VARCHAR(80) DEFAULT NULL,
            borough VARCHAR(60) DEFAULT NULL,
            contact_name VARCHAR(120) DEFAULT NULL,
            contact_phone VARCHAR(40) DEFAULT NULL,
            website VARCHAR(255) DEFAULT NULL,
            about TEXT DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_business_name (business_name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    // Opportunity requests a business raises (implementation help / contact school /
    // internship-hiring / volunteer). They are NOT ratings — the business cannot score
    // students. Every request goes to the Admin for review + consent handling.
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS business_requests (
            id INT AUTO_INCREMENT PRIMARY KEY,
            business_user_id INT NOT NULL,
            request_type VARCHAR(24) NOT NULL,
            submission_id INT DEFAULT NULL,
            student_id INT DEFAULT NULL,
            student_name VARCHAR(120) DEFAULT NULL,
            school_name VARCHAR(180) DEFAULT NULL,
            message TEXT DEFAULT NULL,
            status VARCHAR(16) NOT NULL DEFAULT 'pending',
            admin_note TEXT DEFAULT NULL,
            reviewed_by_user_id INT DEFAULT NULL,
            reviewed_at TIMESTAMP NULL DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_breq_biz (business_user_id),
            INDEX idx_breq_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    // Self-heal extra columns on the interview table:
    //  - business_user_id : explicit admin link (name/phone/website mismatch fallback)
    //  - business_website : the business URL the student recorded (used for matching)
    $addCol = static function (string $col, string $def) use ($pdo): void {
        try {
            $has = $pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'new_school_business_interviews'
                   AND COLUMN_NAME = " . $pdo->quote($col)
            )->fetchColumn();
            if ((int) $has === 0) {
                $pdo->exec("ALTER TABLE new_school_business_interviews ADD COLUMN $col $def");
            }
        } catch (Throwable $e) {
            if (app_debug()) error_log("business interview column $col: " . $e->getMessage());
        }
    };
    $addCol('business_user_id', 'INT DEFAULT NULL');
    $addCol('business_website', 'VARCHAR(255) DEFAULT NULL');
    $ready = true;
}

/** Business account row for a user id (or null). */
function business_account_for_user(int $userId): ?array
{
    business_ensure_schema();
    $stmt = db()->prepare('SELECT * FROM business_accounts WHERE user_id = ? LIMIT 1');
    $stmt->execute([$userId]);
    $row = $stmt->fetch();
    return $row ?: null;
}

/** Normalized business-name key for matching (lowercased, trimmed, collapsed spaces). */
function business_name_key(string $name): string
{
    return preg_replace('/\s+/u', ' ', mb_strtolower(trim($name)));
}

/** Digits-only phone key (drops spaces, dashes, brackets, +) for matching. */
function business_phone_key(string $phone): string
{
    return preg_replace('/\D+/', '', $phone);
}

/** Normalized website key: lowercased host+path without scheme / www / trailing slash. */
function business_url_key(string $url): string
{
    $u = strtolower(trim($url));
    $u = preg_replace('#^https?://#', '', $u);
    $u = preg_replace('#^www\.#', '', $u);
    return rtrim($u, '/');
}

/**
 * The interviews that belong to a business account: explicitly linked rows OR
 * (unlinked rows whose business_name matches by normalized name). Each row is
 * enriched with the student + school and — when the student has SUBMITTED a
 * solution — the solution fields. Draft solutions stay hidden.
 */
function business_matched_interviews(array $account): array
{
    business_ensure_schema();
    $uid = (int) $account['user_id'];
    // An interview belongs to this business if it is explicitly linked (business_user_id),
    // OR — for unlinked interviews — the student-entered name, phone, or website matches
    // this account (all normalized: case/space-insensitive name, digits-only phone,
    // scheme/www/slash-insensitive website). Any one match is enough.
    $key = business_name_key((string) $account['business_name']);
    $phoneKey = business_phone_key((string) ($account['contact_phone'] ?? ''));
    $webKey = business_url_key((string) ($account['website'] ?? ''));
    $stmt = db()->prepare(
        "SELECT bi.id, bi.visit_number, bi.business_name, bi.owner_name, bi.business_category,
                bi.business_address, bi.business_phone, bi.business_website, bi.date_of_visit, bi.main_challenge, bi.student_notes,
                (bi.signature IS NOT NULL AND bi.signature <> '') AS verified,
                s.id AS student_id, s.full_name AS student_name, s.school_name, s.grade_level, s.age,
                sub.id AS submission_id, sub.status AS submission_status,
                sub.problem_identified, sub.proposed_solution, sub.how_it_helps,
                sub.expected_impact, sub.video_url, sub.written_url
         FROM new_school_business_interviews bi
         JOIN new_school_students s ON s.id = bi.student_id
         LEFT JOIN new_school_submissions sub ON sub.student_id = bi.student_id
         WHERE bi.business_user_id = ?
            OR (bi.business_user_id IS NULL AND (
                  LOWER(TRIM(bi.business_name)) = ?
               OR (? <> '' AND REGEXP_REPLACE(COALESCE(bi.business_phone, ''), '[^0-9]', '') = ?)
               OR (? <> '' AND TRIM(TRAILING '/' FROM REGEXP_REPLACE(LOWER(TRIM(COALESCE(bi.business_website, ''))), '^(https?://)?(www[.])?', '')) = ?)
            ))
         ORDER BY bi.date_of_visit DESC, bi.id DESC"
    );
    $stmt->execute([$uid, $key, $phoneKey, $phoneKey, $webKey, $webKey]);

    $submitted = ['submitted', 'approved', 'winner'];
    $out = [];
    foreach ($stmt->fetchAll() as $r) {
        $hasSolution = $r['submission_id'] && in_array((string) $r['submission_status'], $submitted, true);
        $age = (int) $r['age'];
        $materials = [];
        if ($hasSolution && function_exists('new_school_fetch_materials')) {
            foreach (new_school_fetch_materials((int) $r['student_id']) as $mat) {
                $materials[] = [
                    'label' => ucwords(str_replace('_', ' ', (string) ($mat['material_type'] ?? 'File'))),
                    'url' => (string) ($mat['file_url'] ?? ''),
                ];
            }
        }
        $out[] = [
            'id' => (int) $r['id'],
            'visit_number' => (int) $r['visit_number'],
            'business_name' => $r['business_name'],
            'owner_name' => $r['owner_name'],
            'business_category' => $r['business_category'],
            'business_address' => $r['business_address'],
            'business_phone' => $r['business_phone'],
            'business_website' => $r['business_website'],
            'date_of_visit' => $r['date_of_visit'],
            'main_challenge' => $r['main_challenge'],
            'verified' => (bool) $r['verified'],
            'student_id' => (int) $r['student_id'],
            'student_name' => $r['student_name'],
            'school_name' => $r['school_name'],
            'grade_level' => $r['grade_level'],
            'student_age' => $age,
            // Internship/hiring may only be requested for students aged 16-19 (spec rule).
            'internship_eligible' => $age >= 16 && $age <= 19,
            'solution' => $hasSolution ? [
                'submission_id' => (int) $r['submission_id'],
                'status' => $r['submission_status'],
                'problem_identified' => $r['problem_identified'],
                'proposed_solution' => $r['proposed_solution'],
                'how_it_helps' => $r['how_it_helps'],
                'expected_impact' => $r['expected_impact'],
                'video_url' => $r['video_url'],
                'written_url' => $r['written_url'],
                'materials' => $materials,
            ] : null,
            'solution_pending' => (bool) ($r['submission_id'] && !$hasSolution),
        ];
    }
    return $out;
}

/** The four opportunity-request types a business can raise. */
function business_request_types(): array { return ['implementation', 'contact_school', 'internship', 'volunteer']; }

/** This business's own requests, newest first. */
function business_requests_for_user(int $userId): array
{
    business_ensure_schema();
    $stmt = db()->prepare('SELECT id, request_type, submission_id, student_id, student_name, school_name, message, status, admin_note, UNIX_TIMESTAMP(created_at) AS created_ts FROM business_requests WHERE business_user_id = ? ORDER BY created_at DESC');
    $stmt->execute([$userId]);
    return array_map(static fn(array $r): array => [
        'id' => (int) $r['id'],
        'request_type' => $r['request_type'],
        'submission_id' => $r['submission_id'] !== null ? (int) $r['submission_id'] : null,
        'student_id' => $r['student_id'] !== null ? (int) $r['student_id'] : null,
        'student_name' => $r['student_name'],
        'school_name' => $r['school_name'],
        'message' => (string) ($r['message'] ?? ''),
        'status' => $r['status'],
        'admin_note' => (string) ($r['admin_note'] ?? ''),
        'created_ts' => (int) $r['created_ts'],
    ], $stmt->fetchAll());
}

/**
 * Create an opportunity request. Solution/student-targeted requests must point at
 * one of THIS business's matched interviews; internship/hiring is restricted to
 * students aged 16-19. Nothing is granted here — the request goes to the Admin.
 */
function business_create_request(array $user, array $b): array
{
    business_ensure_schema();
    $account = business_account_for_user((int) $user['id']);
    if (!$account) json(['error' => 'Complete your business profile first.'], 400);
    $type = (string) field($b, 'request_type');
    if (!in_array($type, business_request_types(), true)) json(['error' => 'Unknown request type.'], 422);

    $subId = isset($b['submission_id']) ? (int) $b['submission_id'] : 0;
    $studentId = isset($b['student_id']) ? (int) $b['student_id'] : 0;
    $studentName = null;
    $schoolName = null;

    if (in_array($type, ['implementation', 'internship'], true)) {
        $match = null;
        foreach (business_matched_interviews($account) as $i) {
            if ($type === 'implementation' && $i['solution'] && (int) $i['solution']['submission_id'] === $subId) { $match = $i; break; }
            if ($type === 'internship' && (int) $i['student_id'] === $studentId) { $match = $i; break; }
        }
        if (!$match) json(['error' => 'That student or solution is not linked to your business.'], 403);
        if ($type === 'internship' && empty($match['internship_eligible'])) {
            json(['error' => 'Internship/hiring can only be requested for students aged 16-19.'], 422);
        }
        $studentId = (int) $match['student_id'];
        $subId = $type === 'implementation' ? (int) $match['solution']['submission_id'] : 0;
        $studentName = $match['student_name'];
        $schoolName = $match['school_name'];
    } elseif ($type === 'contact_school') {
        $schoolName = mb_substr(trim((string) field($b, 'school_name')), 0, 180) ?: null;
        if (!$schoolName && $studentId) {
            foreach (business_matched_interviews($account) as $i) {
                if ((int) $i['student_id'] === $studentId) { $schoolName = $i['school_name']; $studentName = $i['student_name']; break; }
            }
        }
    }
    // 'volunteer' needs no target.

    db()->prepare(
        'INSERT INTO business_requests (business_user_id, request_type, submission_id, student_id, student_name, school_name, message, status)
         VALUES (?,?,?,?,?,?,?, "pending")'
    )->execute([
        (int) $user['id'], $type, $subId ?: null, $studentId ?: null, $studentName, $schoolName,
        mb_substr(trim((string) field($b, 'message')), 0, 2000) ?: null,
    ]);
    if (function_exists('notify')) {
        notify('New business request: ' . $type, $account['business_name'] . ' submitted a "' . $type . '" request for admin review.');
    }
    return ['id' => (int) db()->lastInsertId(), 'requests' => business_requests_for_user((int) $user['id'])];
}

/** Full dashboard payload for a signed-in business user (access + review + requests; NO rating). */
function business_dashboard_payload(array $user): array
{
    $userId = (int) $user['id'];
    $account = business_account_for_user($userId);
    if (!$account) {
        return ['profile' => null, 'interviews' => [], 'impact' => ['interviews' => 0, 'students' => 0, 'solutions' => 0], 'requests' => []];
    }
    $interviews = business_matched_interviews($account);
    $students = [];
    $solutions = 0;
    foreach ($interviews as $i) {
        $students[$i['student_name'] . '|' . $i['school_name']] = true;
        if ($i['solution']) $solutions++;
    }
    return [
        'profile' => [
            'business_name' => $account['business_name'],
            'category' => $account['category'],
            'borough' => $account['borough'],
            'contact_name' => $account['contact_name'],
            'contact_phone' => $account['contact_phone'],
            'website' => $account['website'],
            'about' => $account['about'],
        ],
        'interviews' => $interviews,
        'impact' => [
            'interviews' => count($interviews),
            'students' => count($students),
            'solutions' => $solutions,
        ],
        'requests' => business_requests_for_user($userId),
    ];
}

/** Admin: all business requests (pending first), with the business name joined in. */
function business_requests_all(): array
{
    business_ensure_schema();
    $rows = db()->query(
        "SELECT r.*, UNIX_TIMESTAMP(r.created_at) AS created_ts, ba.business_name
         FROM business_requests r
         LEFT JOIN business_accounts ba ON ba.user_id = r.business_user_id
         ORDER BY (r.status = 'pending') DESC, r.created_at DESC"
    )->fetchAll();
    return array_map(static fn(array $r): array => [
        'id' => (int) $r['id'],
        'business_name' => (string) ($r['business_name'] ?? ('Business #' . $r['business_user_id'])),
        'request_type' => $r['request_type'],
        'student_name' => $r['student_name'],
        'school_name' => $r['school_name'],
        'submission_id' => $r['submission_id'] !== null ? (int) $r['submission_id'] : null,
        'message' => (string) ($r['message'] ?? ''),
        'status' => $r['status'],
        'admin_note' => (string) ($r['admin_note'] ?? ''),
        'created_ts' => (int) $r['created_ts'],
    ], $rows);
}

/** Admin: set a request's status + note. */
function business_request_update(int $id, string $status, string $note, int $adminId): void
{
    business_ensure_schema();
    if (!in_array($status, ['pending', 'approved', 'declined', 'info_needed'], true)) json(['error' => 'Invalid status.'], 422);
    db()->prepare('UPDATE business_requests SET status=?, admin_note=?, reviewed_by_user_id=?, reviewed_at=NOW() WHERE id=?')
        ->execute([$status, mb_substr($note, 0, 2000) ?: null, $adminId, $id]);
}

/* ==================== Ecosystem accounts (sponsor / partner / media / volunteer) ==================== */

/** Live challenge impact counters shared by sponsor + media dashboards. */
function challenge_impact_stats(): array
{
    $pdo = db();
    $c = static fn(string $sql): int => (int) $pdo->query($sql)->fetchColumn();
    return [
        'students' => $c('SELECT COUNT(*) FROM new_school_students'),
        'schools' => $c('SELECT COUNT(*) FROM new_school_schools'),
        'teachers' => $c('SELECT COUNT(*) FROM new_school_teachers'),
        'businesses' => $c("SELECT COUNT(DISTINCT LOWER(TRIM(business_name))) FROM new_school_business_interviews WHERE business_name <> ''"),
        'interviews' => $c('SELECT COUNT(*) FROM new_school_business_interviews'),
        'solutions' => $c("SELECT COUNT(*) FROM new_school_submissions WHERE status IN ('submitted','approved','winner')"),
        'problems' => $c("SELECT COUNT(DISTINCT LOWER(TRIM(main_challenge))) FROM new_school_business_interviews WHERE main_challenge <> ''"),
        'scholarships' => (function () { try { return (int) db()->query('SELECT COUNT(DISTINCT student_id) FROM new_school_scholarship_answers WHERE completed_at IS NOT NULL')->fetchColumn(); } catch (\Throwable $e) { return 0; } })(),
    ];
}

/** The ecosystem roles that share the generic account model. */
function ecosystem_roles(): array { return ['sponsor', 'partner', 'media', 'volunteer']; }

/** Self-healing schema for the shared ecosystem_accounts table. */
function ecosystem_ensure_schema(): void
{
    static $ready = false;
    if ($ready) return;
    db()->exec(
        "CREATE TABLE IF NOT EXISTS ecosystem_accounts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL UNIQUE,
            role VARCHAR(20) NOT NULL,
            org_name VARCHAR(160) NOT NULL,
            contact_name VARCHAR(120) DEFAULT NULL,
            contact_phone VARCHAR(40) DEFAULT NULL,
            website VARCHAR(255) DEFAULT NULL,
            about TEXT DEFAULT NULL,
            details TEXT DEFAULT NULL,
            referral_code VARCHAR(24) DEFAULT NULL,
            referred_by_code VARCHAR(24) DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_eco_role (role),
            INDEX idx_eco_refby (referred_by_code)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    $ready = true;
}

/** Require a signed-in account of the given ecosystem role (admins allowed). */
function require_ecosystem(string $role): array
{
    $u = require_login();
    if ((string) $u['role'] !== $role && !in_array((string) $u['role'], ['admin', 'super_admin'], true)) {
        json(['error' => ucfirst($role) . ' account required.'], 403);
    }
    return $u;
}

/** Ecosystem account row for a user id, with details decoded (or null). */
function ecosystem_account_for_user(int $userId): ?array
{
    ecosystem_ensure_schema();
    $stmt = db()->prepare('SELECT * FROM ecosystem_accounts WHERE user_id = ? LIMIT 1');
    $stmt->execute([$userId]);
    $row = $stmt->fetch();
    if (!$row) return null;
    $row['details'] = !empty($row['details']) ? (json_decode((string) $row['details'], true) ?: []) : [];
    return $row;
}

function ecosystem_generate_ref_code(): string
{
    return strtoupper(substr(bin2hex(random_bytes(6)), 0, 8));
}

/** Extract the role-specific detail fields from a request body. */
function ecosystem_details_from_body(string $role, array $b): array
{
    $s = static fn(string $k, int $max = 120): string => mb_substr(trim((string) field($b, $k)), 0, $max);
    switch ($role) {
        case 'sponsor':   return ['tier' => $s('tier', 60), 'recognition_level' => $s('recognition_level', 60), 'logo_url' => $s('logo_url', 400)];
        case 'partner':   return ['partner_type' => $s('partner_type', 60), 'logo_url' => $s('logo_url', 400)];
        case 'media':     return ['outlet' => $s('outlet', 120), 'beat' => $s('beat', 120)];
        case 'volunteer': return ['volunteer_type' => $s('volunteer_type', 60), 'areas' => $s('areas', 200), 'availability' => $s('availability', 120)];
    }
    return [];
}

/** Self-register (or re-register) an ecosystem account; returns the sanitized user. */
function ecosystem_register(string $role, array $b): array
{
    if (!in_array($role, ecosystem_roles(), true)) json(['error' => 'Unknown account type.'], 404);
    roles_ensure_enum();
    ecosystem_ensure_schema();

    $fullName = trim((string) (field($b, 'full_name') ?: field($b, 'contact_name')));
    $email = require_email(field($b, 'email'));
    $pass = (string) field($b, 'password');
    $org = trim((string) (field($b, 'org_name') ?: field($b, 'organization')));
    if ($org === '') $org = $fullName; // volunteers may register as individuals
    if (mb_strlen($fullName) < 3) json(['error' => 'Your name is required (at least 3 characters).'], 422);
    if ($role !== 'volunteer' && trim((string) field($b, 'org_name')) === '') json(['error' => 'Organization name is required.'], 422);
    if (strlen($pass) < 6) json(['error' => 'Password must be at least 6 characters.'], 422);

    $user = new_school_upsert_user_account($fullName, $email, $pass, $role);
    $details = ecosystem_details_from_body($role, $b);
    $existing = ecosystem_account_for_user((int) $user['id']);
    $code = $existing['referral_code'] ?? ecosystem_generate_ref_code();
    $refBy = mb_substr(trim((string) field($b, 'ref')), 0, 24) ?: null;

    db()->prepare(
        'INSERT INTO ecosystem_accounts (user_id, role, org_name, contact_name, contact_phone, website, about, details, referral_code, referred_by_code)
         VALUES (?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE role=VALUES(role), org_name=VALUES(org_name), contact_name=VALUES(contact_name),
             contact_phone=VALUES(contact_phone), website=VALUES(website), about=VALUES(about),
             details=VALUES(details), updated_at=NOW()'
    )->execute([
        (int) $user['id'], $role, mb_substr($org, 0, 160), mb_substr($fullName, 0, 120),
        mb_substr(trim((string) field($b, 'contact_phone')), 0, 40) ?: null,
        mb_substr(trim((string) field($b, 'website')), 0, 255) ?: null,
        mb_substr(trim((string) field($b, 'about')), 0, 2000) ?: null,
        json_encode($details), $code, $refBy,
    ]);
    attribute_referral((int) $user['id'], $refBy); // partner-referral attribution (users.referred_by_code)
    return login_user($user);
}

/** Update the signed-in ecosystem account's editable profile. */
function ecosystem_profile_save(array $user, string $role, array $b): void
{
    ecosystem_ensure_schema();
    $org = trim((string) field($b, 'org_name')) ?: (string) $user['full_name'];
    db()->prepare(
        'UPDATE ecosystem_accounts SET org_name=?, contact_name=?, contact_phone=?, website=?, about=?, details=?, updated_at=NOW() WHERE user_id=?'
    )->execute([
        mb_substr($org, 0, 160),
        mb_substr(trim((string) field($b, 'contact_name')), 0, 120) ?: null,
        mb_substr(trim((string) field($b, 'contact_phone')), 0, 40) ?: null,
        mb_substr(trim((string) field($b, 'website')), 0, 255) ?: null,
        mb_substr(trim((string) field($b, 'about')), 0, 2000) ?: null,
        json_encode(ecosystem_details_from_body($role, $b)),
        (int) $user['id'],
    ]);
}

/** Role-specific dashboard payload for an ecosystem account. */
function ecosystem_dashboard_payload(string $role, array $user): array
{
    $acc = ecosystem_account_for_user((int) $user['id']);
    $profile = $acc ? [
        'org_name' => $acc['org_name'],
        'contact_name' => $acc['contact_name'],
        'contact_phone' => $acc['contact_phone'],
        'website' => $acc['website'],
        'about' => $acc['about'],
        'details' => $acc['details'] ?: (object) [],
    ] : null;
    $out = ['role' => $role, 'profile' => $profile, 'status' => (string) ($user['approval_status'] ?? 'pending')];

    if ($role === 'sponsor' || $role === 'media') {
        $out['impact'] = challenge_impact_stats();
    }
    if ($role === 'sponsor') {
        $out['ceremony'] = ns_award_ceremony();
        $out['reports'] = [
            ['label' => 'Founding Sponsor Kit (PDF)', 'url' => '/docs/founding_sponsor_kit.pdf'],
            ['label' => 'Sponsor Media Kit (PDF)', 'url' => '/docs/founding_sponsor_media_kit.pdf'],
        ];
    }
    if ($role === 'media') {
        $out['presskit'] = [
            ['label' => 'Media Kit 2026 (PDF)', 'url' => '/docs/leave_it_better_media_kit_2026.pdf'],
            ['label' => 'General Media Kit (PDF)', 'url' => '/docs/media_kit.pdf'],
            ['label' => 'Program One-Pager (PDF)', 'url' => '/docs/new_school_functionality.pdf'],
        ];
    }
    if ($role === 'partner') {
        $code = (string) ($acc['referral_code'] ?? '');
        $bd = ecosystem_referral_breakdown($code);
        $out['referral'] = ['code' => $code, 'count' => $bd['total'], 'by_role' => $bd['by_role']];
        $out['toolkit'] = [
            ['label' => 'Partnership Kit (PDF)', 'url' => '/docs/partnership_kit.pdf'],
            ['label' => 'Program One-Pager (PDF)', 'url' => '/docs/new_school_functionality.pdf'],
        ];
        $out['marketing'] = [
            ['label' => 'Program Logo Pack', 'url' => '/docs/founding_sponsor_kit.pdf'],
            ['label' => 'Social Media Kit', 'url' => '/docs/founding_sponsor_media_kit.pdf'],
        ];
    }
    // Shared ecosystem features (all roles): admin-issued documents, the account's
    // own requests, and announcements targeted to this role.
    $out['documents'] = ecosystem_documents_for_user((int) $user['id']);
    $out['requests'] = ecosystem_requests_for_user((int) $user['id']);
    $out['announcements'] = ecosystem_announcements_for_role($role);
    return $out;
}

/* ---- Shared ecosystem features: uploads, documents, requests, announcements ---- */

/** Store an uploaded file (images always; PDFs when $allowDocs). Returns its URL or sends a 422/500. */
function media_store_uploaded_file(string $fieldName = 'file', bool $allowDocs = false): string
{
    if (empty($_FILES[$fieldName]) || ($_FILES[$fieldName]['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        json(['error' => 'No file uploaded.'], 422);
    }
    $f = $_FILES[$fieldName];
    if ($f['size'] > 12 * 1024 * 1024) json(['error' => 'File must be 12MB or smaller.'], 422);
    $allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    if ($allowDocs) $allowed['application/pdf'] = 'pdf';
    $mime = function_exists('mime_content_type') ? mime_content_type($f['tmp_name']) : ($f['type'] ?? '');
    if (!isset($allowed[$mime])) json(['error' => $allowDocs ? 'Only PDF, JPG, PNG or WebP files are allowed.' : 'Only JPG, PNG or WebP images are allowed.'], 422);
    $dir = __DIR__ . '/uploads/media';
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) json(['error' => 'Could not create upload directory.'], 500);
    $name = 'media-' . bin2hex(random_bytes(8)) . '.' . $allowed[$mime];
    if (!move_uploaded_file($f['tmp_name'], $dir . '/' . $name)) json(['error' => 'Failed to save the uploaded file.'], 500);
    return '/api/uploads/media/' . $name;
}

function ecosystem_shared_ensure_schema(): void
{
    static $ready = false;
    if ($ready) return;
    $pdo = db();
    $pdo->exec("CREATE TABLE IF NOT EXISTS ecosystem_documents (
        id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, role VARCHAR(20) NOT NULL,
        doc_type VARCHAR(40) NOT NULL DEFAULT 'document', label VARCHAR(160) NOT NULL, file_url VARCHAR(400) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX idx_ecodoc_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS ecosystem_requests (
        id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, role VARCHAR(20) NOT NULL, req_type VARCHAR(30) NOT NULL,
        message TEXT DEFAULT NULL, status VARCHAR(16) NOT NULL DEFAULT 'pending', admin_note TEXT DEFAULT NULL,
        reviewed_by_user_id INT DEFAULT NULL, reviewed_at TIMESTAMP NULL DEFAULT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ecoreq_user (user_id), INDEX idx_ecoreq_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS ecosystem_announcements (
        id INT AUTO_INCREMENT PRIMARY KEY, audience VARCHAR(20) NOT NULL DEFAULT 'all', title VARCHAR(180) NOT NULL,
        body TEXT DEFAULT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX idx_ecoann_aud (audience)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $ready = true;
}

function ecosystem_documents_for_user(int $userId): array
{
    ecosystem_shared_ensure_schema();
    $s = db()->prepare('SELECT id, doc_type, label, file_url, UNIX_TIMESTAMP(created_at) AS created_ts FROM ecosystem_documents WHERE user_id = ? ORDER BY created_at DESC');
    $s->execute([$userId]);
    return array_map(static fn(array $r): array => ['id' => (int) $r['id'], 'doc_type' => $r['doc_type'], 'label' => $r['label'], 'url' => $r['file_url'], 'created_ts' => (int) $r['created_ts']], $s->fetchAll());
}

function ecosystem_requests_for_user(int $userId): array
{
    ecosystem_shared_ensure_schema();
    $s = db()->prepare('SELECT id, req_type, message, status, admin_note, UNIX_TIMESTAMP(created_at) AS created_ts FROM ecosystem_requests WHERE user_id = ? ORDER BY created_at DESC');
    $s->execute([$userId]);
    return array_map(static fn(array $r): array => ['id' => (int) $r['id'], 'req_type' => $r['req_type'], 'message' => (string) ($r['message'] ?? ''), 'status' => $r['status'], 'admin_note' => (string) ($r['admin_note'] ?? ''), 'created_ts' => (int) $r['created_ts']], $s->fetchAll());
}

/** Which request types each ecosystem role may raise. */
function ecosystem_request_type_allowed(string $role, string $type): bool
{
    $map = [
        'sponsor' => ['meeting', 'renewal', 'event'],
        'partner' => ['event', 'toolkit', 'refer'],
        'media' => ['interview', 'event', 'credentials'],
        'volunteer' => ['opportunity', 'event', 'availability'],
    ];
    return in_array($type, $map[$role] ?? [], true);
}

function ecosystem_create_request(array $user, string $role, array $b): array
{
    ecosystem_shared_ensure_schema();
    $type = (string) field($b, 'req_type');
    if (!ecosystem_request_type_allowed($role, $type)) json(['error' => 'Unknown request type.'], 422);
    db()->prepare('INSERT INTO ecosystem_requests (user_id, role, req_type, message) VALUES (?,?,?,?)')
        ->execute([(int) $user['id'], $role, $type, mb_substr(trim((string) field($b, 'message')), 0, 2000) ?: null]);
    if (function_exists('notify')) {
        $acc = ecosystem_account_for_user((int) $user['id']);
        notify('Ecosystem request: ' . $role . ' / ' . $type, (($acc['org_name'] ?? $user['full_name'])) . ' submitted a "' . $type . '" request for admin review.');
    }
    return ['requests' => ecosystem_requests_for_user((int) $user['id'])];
}

function ecosystem_announcements_for_role(string $role): array
{
    ecosystem_shared_ensure_schema();
    $s = db()->prepare("SELECT id, title, body, UNIX_TIMESTAMP(created_at) AS created_ts FROM ecosystem_announcements WHERE audience = 'all' OR audience = ? ORDER BY created_at DESC LIMIT 30");
    $s->execute([$role]);
    return array_map(static fn(array $r): array => ['id' => (int) $r['id'], 'title' => $r['title'], 'body' => (string) ($r['body'] ?? ''), 'created_ts' => (int) $r['created_ts']], $s->fetchAll());
}

function ecosystem_set_logo(array $user, string $url): array
{
    ecosystem_shared_ensure_schema();
    $acc = ecosystem_account_for_user((int) $user['id']);
    if (!$acc) json(['error' => 'Account not found.'], 404);
    $details = is_array($acc['details']) ? $acc['details'] : [];
    $details['logo_url'] = $url;
    db()->prepare('UPDATE ecosystem_accounts SET details = ?, updated_at = NOW() WHERE user_id = ?')->execute([json_encode($details), (int) $user['id']]);
    return ['logo_url' => $url];
}

/** Partner referral totals broken down by the role of each referred account. */
/** Ensure users.referred_by_code exists — the single source of truth for partner-referral
 *  attribution across every role (ecosystem, business, community, …). Self-healing. */
function referral_ensure_schema(): void
{
    static $ready = false;
    if ($ready) return;
    try {
        $has = db()->query(
            "SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'referred_by_code'"
        )->fetchColumn();
        if ((int) $has === 0) {
            db()->exec("ALTER TABLE users ADD COLUMN referred_by_code VARCHAR(24) DEFAULT NULL AFTER role");
            db()->exec("CREATE INDEX idx_users_refby ON users (referred_by_code)");
        }
    } catch (Throwable $e) {
        if (app_debug()) error_log('referral_ensure_schema: ' . $e->getMessage());
    }
    $ready = true;
}

/** Attribute a newly-registered user to a referrer's code (partner referral).
 *  First non-empty code wins; a user is never attributed to their own code. Codes are
 *  normalized to upper-case to match the generated ecosystem/partner codes. */
function attribute_referral(int $userId, ?string $code): void
{
    $code = strtoupper(trim((string) $code));
    if ($code === '' || $userId <= 0) return;
    referral_ensure_schema();
    try {
        // Ignore self-referral (the code belongs to this same user's ecosystem account).
        $own = db()->prepare('SELECT 1 FROM ecosystem_accounts WHERE user_id = ? AND UPPER(referral_code) = ? LIMIT 1');
        $own->execute([$userId, $code]);
        if ($own->fetchColumn()) return;
        db()->prepare(
            "UPDATE users SET referred_by_code = ?
             WHERE id = ? AND (referred_by_code IS NULL OR referred_by_code = '')"
        )->execute([mb_substr($code, 0, 24), $userId]);
    } catch (Throwable $e) {
        if (app_debug()) error_log('attribute_referral: ' . $e->getMessage());
    }
}

/** Count everyone a partner code referred, grouped by role — powers the Partner dashboard. */
function ecosystem_referral_breakdown(string $code): array
{
    $code = strtoupper(trim($code));
    if ($code === '') return ['total' => 0, 'by_role' => (object) []];
    referral_ensure_schema();
    $s = db()->prepare('SELECT role, COUNT(*) c FROM users WHERE UPPER(referred_by_code) = ? GROUP BY role');
    $s->execute([$code]);
    $by = []; $total = 0;
    foreach ($s->fetchAll() as $r) { $by[(string) $r['role']] = (int) $r['c']; $total += (int) $r['c']; }
    return ['total' => $total, 'by_role' => $by ?: (object) []];
}

/* ---- Admin side of the shared ecosystem features ---- */
function ecosystem_accounts_list(): array
{
    ecosystem_shared_ensure_schema();
    return db()->query("SELECT ea.user_id, ea.role, ea.org_name, u.email, u.approval_status FROM ecosystem_accounts ea JOIN users u ON u.id = ea.user_id ORDER BY ea.role, ea.org_name")->fetchAll() ?: [];
}
function ecosystem_requests_all(): array
{
    ecosystem_shared_ensure_schema();
    $rows = db()->query("SELECT r.*, UNIX_TIMESTAMP(r.created_at) AS created_ts, ea.org_name FROM ecosystem_requests r LEFT JOIN ecosystem_accounts ea ON ea.user_id = r.user_id ORDER BY (r.status = 'pending') DESC, r.created_at DESC")->fetchAll() ?: [];
    return array_map(static fn(array $r): array => ['id' => (int) $r['id'], 'org_name' => (string) ($r['org_name'] ?? ('User #' . $r['user_id'])), 'role' => $r['role'], 'req_type' => $r['req_type'], 'message' => (string) ($r['message'] ?? ''), 'status' => $r['status'], 'admin_note' => (string) ($r['admin_note'] ?? ''), 'created_ts' => (int) $r['created_ts']], $rows);
}
function ecosystem_request_update(int $id, string $status, string $note, int $adminId): void
{
    ecosystem_shared_ensure_schema();
    if (!in_array($status, ['pending', 'approved', 'declined', 'info_needed'], true)) json(['error' => 'Invalid status.'], 422);
    db()->prepare('UPDATE ecosystem_requests SET status = ?, admin_note = ?, reviewed_by_user_id = ?, reviewed_at = NOW() WHERE id = ?')->execute([$status, mb_substr($note, 0, 2000) ?: null, $adminId, $id]);
}
function ecosystem_document_add(int $userId, string $role, string $docType, string $label, string $url): void
{
    ecosystem_shared_ensure_schema();
    db()->prepare('INSERT INTO ecosystem_documents (user_id, role, doc_type, label, file_url) VALUES (?,?,?,?,?)')
        ->execute([$userId, $role, mb_substr($docType, 0, 40) ?: 'document', mb_substr($label, 0, 160) ?: 'Document', mb_substr($url, 0, 400)]);
}
function ecosystem_document_delete(int $id): void { ecosystem_shared_ensure_schema(); db()->prepare('DELETE FROM ecosystem_documents WHERE id = ?')->execute([$id]); }
function ecosystem_announcement_add(string $audience, string $title, string $body): void
{
    ecosystem_shared_ensure_schema();
    $audience = in_array($audience, ['all', 'sponsor', 'partner', 'media', 'volunteer'], true) ? $audience : 'all';
    db()->prepare('INSERT INTO ecosystem_announcements (audience, title, body) VALUES (?,?,?)')->execute([$audience, mb_substr($title, 0, 180), mb_substr($body, 0, 4000) ?: null]);
}
function ecosystem_announcements_all(): array
{
    ecosystem_shared_ensure_schema();
    return array_map(static fn(array $r): array => ['id' => (int) $r['id'], 'audience' => $r['audience'], 'title' => $r['title'], 'body' => (string) ($r['body'] ?? ''), 'created_ts' => (int) $r['created_ts']], db()->query('SELECT *, UNIX_TIMESTAMP(created_at) AS created_ts FROM ecosystem_announcements ORDER BY created_at DESC')->fetchAll() ?: []);
}
function ecosystem_announcement_delete(int $id): void { ecosystem_shared_ensure_schema(); db()->prepare('DELETE FROM ecosystem_announcements WHERE id = ?')->execute([$id]); }

/* ==================== Demo one-click login (presentations) ==================== */

/**
 * Demo mode lets anyone sign in as a ready-made account for any role from the
 * /demo page — for live presentations. Set DEMO_MODE=off in api/.env to disable
 * it in production (the endpoints then 404). Default: on.
 */
function demo_mode_enabled(): bool
{
    $v = strtolower((string) env('DEMO_MODE', 'on'));
    return !in_array($v, ['off', '0', 'false', 'no'], true);
}

/** Ordered role => label list for the demo page. */
function demo_roles(): array
{
    return [
        'admin' => 'Admin — Mission Control',
        'school' => 'School / Principal',
        'teacher' => 'Teacher',
        'student' => 'Student',
        'parent' => 'Parent',
        'judge' => 'Judge',
        'business' => 'Business',
        'sponsor' => 'Sponsor',
        'partner' => 'Partner',
        'media' => 'Media',
        'volunteer' => 'Volunteer',
        'member' => 'Community Member',
    ];
}

function demo_email(string $role): string { return 'demo.' . $role . '@frantzcoutard.demo'; }

/** Ensure an approved demo user for a role exists; returns the full user row. */
function demo_user(string $role, string $name): array
{
    $pdo = db();
    $email = demo_email($role);
    $hash = password_hash('demo1234', PASSWORD_DEFAULT);
    $find = $pdo->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
    $find->execute([$email]);
    if ($find->fetch()) {
        $pdo->prepare("UPDATE users SET full_name=?, role=?, password_hash=?, approval_status='approved', email_verified_at=COALESCE(email_verified_at, NOW()) WHERE email=?")
            ->execute([$name, $role, $hash, $email]);
    } else {
        $pdo->prepare("INSERT INTO users (full_name, email, password_hash, role, approval_status, email_verified_at) VALUES (?,?,?,?,'approved',NOW())")
            ->execute([$name, $email, $hash, $role]);
    }
    $find->execute([$email]);
    return $find->fetch();
}

/** Create/ensure every demo account + supporting entities (idempotent, once per request). */
function demo_ensure_accounts(): void
{
    static $ready = false;
    if ($ready) return;
    roles_ensure_enum();
    $pdo = db();

    demo_user('admin', 'Demo Admin');
    demo_user('member', 'Demo Member');

    // Business
    business_ensure_schema();
    $biz = demo_user('business', 'Demo Business Owner');
    $pdo->prepare(
        "INSERT INTO business_accounts (user_id, business_name, category, borough, contact_name, contact_phone, website, about)
         VALUES (?, 'Demo Cafe', 'Food & Beverage', 'Brooklyn', 'Demo Business Owner', '718-555-0100', 'https://example.com', 'A demo business account for presentations.')
         ON DUPLICATE KEY UPDATE business_name=VALUES(business_name)"
    )->execute([(int) $biz['id']]);

    // Ecosystem roles
    ecosystem_ensure_schema();
    $eco = [
        'sponsor' => ['Demo Sponsor Fund', ['tier' => 'Founding', 'recognition_level' => 'Gold', 'logo_url' => '']],
        'partner' => ['Demo Chamber of Commerce', ['partner_type' => 'Chamber of Commerce', 'logo_url' => '']],
        'media' => ['Demo News Network', ['outlet' => 'Demo News', 'beat' => 'Education']],
        'volunteer' => ['Demo Volunteer', ['volunteer_type' => 'Mentor', 'areas' => 'Business, Marketing', 'availability' => 'Weekends']],
    ];
    foreach ($eco as $role => $cfg) {
        $u = demo_user($role, 'Demo ' . ucfirst($role));
        $pdo->prepare(
            "INSERT INTO ecosystem_accounts (user_id, role, org_name, contact_name, website, details, referral_code)
             VALUES (?,?,?,?, 'https://example.com', ?, ?)
             ON DUPLICATE KEY UPDATE org_name=VALUES(org_name), details=VALUES(details)"
        )->execute([(int) $u['id'], $role, $cfg[0], 'Demo ' . ucfirst($role), json_encode($cfg[1]), ecosystem_generate_ref_code()]);
    }

    // Judge
    new_school_judge_ensure_schema();
    $judge = demo_user('judge', 'Demo Judge');
    $pdo->prepare("INSERT INTO new_school_judges (user_id, display_name) VALUES (?, 'Demo Judge') ON DUPLICATE KEY UPDATE display_name=VALUES(display_name)")
        ->execute([(int) $judge['id']]);

    // School → Teacher → Student → Parent chain (all fully approved)
    $school = demo_user('school', 'Demo Principal');
    $sid = (int) ($pdo->query('SELECT id FROM new_school_schools WHERE user_id = ' . (int) $school['id'])->fetchColumn() ?: 0);
    if ($sid === 0) {
        $pdo->prepare(
            "INSERT INTO new_school_schools (user_id, school_name, school_address, school_district, main_phone, principal_name, administrator_name, administrator_email, administrator_phone, status, origin, claim_status)
             VALUES (?, 'Demo Academy', '1 Demo Street, New York, NY', 'Demo District', '212-555-0000', 'Demo Principal', 'Demo Principal', ?, '212-555-0000', 'approved', 'principal', 'claimed')"
        )->execute([(int) $school['id'], demo_email('school')]);
        $sid = (int) $pdo->lastInsertId();
    } else {
        $pdo->prepare("UPDATE new_school_schools SET status='approved' WHERE id=?")->execute([$sid]);
    }

    $teacher = demo_user('teacher', 'Demo Teacher');
    $tid = (int) ($pdo->query('SELECT id FROM new_school_teachers WHERE user_id = ' . (int) $teacher['id'])->fetchColumn() ?: 0);
    if ($tid === 0) {
        $pdo->prepare(
            "INSERT INTO new_school_teachers (user_id, school_id, teacher_full_name, school_email, phone_number, role_department, grade_level_supported, status)
             VALUES (?,?, 'Demo Teacher', ?, '212-555-0001', 'STEM', '9-12', 'approved')"
        )->execute([(int) $teacher['id'], $sid, demo_email('teacher')]);
        $tid = (int) $pdo->lastInsertId();
    } else {
        $pdo->prepare("UPDATE new_school_teachers SET school_id=?, status='approved' WHERE id=?")->execute([$sid, $tid]);
    }

    $student = demo_user('student', 'Demo Student');
    $stid = (int) ($pdo->query('SELECT id FROM new_school_students WHERE user_id = ' . (int) $student['id'])->fetchColumn() ?: 0);
    if ($stid === 0) {
        $pdo->prepare(
            "INSERT INTO new_school_students
                (user_id, school_id, teacher_id, participant_id, qr_token, qr_url, referral_code, full_name, student_username, age, date_of_birth, email, phone_number, home_address, school_name, grade_level, parent_name, parent_phone, parent_email, parent_consent_status, school_approval_status, teacher_approval_status, submission_status, overall_status)
             VALUES (?,?,?,?,?,?,?, 'Demo Student', 'demo_student', 16, '2009-01-01', ?, '212-555-0002', '1 Demo Street, New York, NY', 'Demo Academy', '11th Grade', 'Demo Parent', '212-555-0003', ?, 'approved','approved','approved','eligible','eligible_to_submit')"
        )->execute([
            (int) $student['id'], $sid, $tid,
            new_school_generate_participant_id(), new_school_generate_qr_token(), new_school_qr_url(new_school_generate_qr_token()),
            new_school_generate_referral_code(), demo_email('student'), demo_email('parent'),
        ]);
        $stid = (int) $pdo->lastInsertId();
    } else {
        $pdo->prepare("UPDATE new_school_students SET school_id=?, teacher_id=?, parent_consent_status='approved', school_approval_status='approved', teacher_approval_status='approved', overall_status='eligible_to_submit' WHERE id=?")
            ->execute([$sid, $tid, $stid]);
    }

    $parent = demo_user('parent', 'Demo Parent');
    $hasParent = (int) ($pdo->query('SELECT COUNT(*) FROM new_school_parents WHERE user_id = ' . (int) $parent['id'])->fetchColumn());
    if ($hasParent === 0) {
        // Guard the UNIQUE student_id: only link if this student has no parent yet.
        $studentTaken = (int) $pdo->query('SELECT COUNT(*) FROM new_school_parents WHERE student_id = ' . $stid)->fetchColumn();
        if ($studentTaken === 0) {
            $linkCol = (bool) $pdo->query("SHOW COLUMNS FROM new_school_parents LIKE 'link_status'")->fetchColumn();
            if ($linkCol) {
                $pdo->prepare(
                    "INSERT INTO new_school_parents (user_id, student_id, parent_full_name, relationship_to_student, phone_number, email, home_address, consent_checked, digital_signature, link_status, approved_at)
                     VALUES (?,?, 'Demo Parent', 'Parent', '212-555-0003', ?, '1 Demo Street, New York, NY', 1, 'Demo Parent', 'approved', NOW())"
                )->execute([(int) $parent['id'], $stid, demo_email('parent')]);
            } else {
                $pdo->prepare(
                    "INSERT INTO new_school_parents (user_id, student_id, parent_full_name, relationship_to_student, phone_number, email, home_address, consent_checked, digital_signature, approved_at)
                     VALUES (?,?, 'Demo Parent', 'Parent', '212-555-0003', ?, '1 Demo Street, New York, NY', 1, 'Demo Parent', NOW())"
                )->execute([(int) $parent['id'], $stid, demo_email('parent')]);
            }
        }
    }

    $ready = true;
}

/** Public list of demo accounts for the /demo page. */
function demo_accounts_list(): array
{
    demo_ensure_accounts();
    $out = [];
    foreach (demo_roles() as $role => $label) {
        $out[] = ['role' => $role, 'label' => $label, 'email' => demo_email($role)];
    }
    return $out;
}

/** Log in as the demo account for a role; returns the sanitized user. */
function demo_login(string $role): array
{
    if (!array_key_exists($role, demo_roles())) json(['error' => 'Unknown demo role.'], 404);
    demo_ensure_accounts();
    $stmt = db()->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
    $stmt->execute([demo_email($role)]);
    $user = $stmt->fetch();
    if (!$user) json(['error' => 'Demo account unavailable.'], 500);
    return login_user($user);
}

/**
 * Editable challenge timeline (milestones shown on the public New School page).
 * Stored as JSON in new_school_settings['challenge_timeline']; falls back to the
 * default schedule when an admin hasn't customized it yet.
 */
function ns_challenge_timeline(): array
{
    $raw = ns_setting_get('challenge_timeline', '');
    if ($raw !== '') {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            $out = [];
            foreach ($decoded as $m) {
                if (!is_array($m)) continue;
                $phase = trim((string) ($m['phase'] ?? ''));
                $when = trim((string) ($m['when'] ?? ''));
                if ($phase === '' && $when === '') continue;
                $out[] = ['phase' => $phase, 'when' => $when, 'highlight' => !empty($m['highlight'])];
            }
            if ($out) return $out;
        }
    }
    return [
        ['phase' => 'Registration Opens',        'when' => 'June 27, 2026',                 'highlight' => false],
        ['phase' => 'Community Challenge Period', 'when' => 'July – 23 November 2026',        'highlight' => false],
        ['phase' => 'Judging & Review',           'when' => '24 November – 20 December 2026', 'highlight' => false],
        ['phase' => 'Winners Announced',          'when' => 'December 21, 2026',              'highlight' => true],
        ['phase' => 'Award Ceremony',             'when' => 'Early 2027',                     'highlight' => false],
    ];
}

/** Validate + persist a timeline (array of {phase, when, highlight}). Returns the saved list. */
function ns_challenge_timeline_save(array $items): array
{
    $clean = [];
    foreach ($items as $m) {
        if (!is_array($m)) continue;
        $phase = trim((string) ($m['phase'] ?? ''));
        $when = trim((string) ($m['when'] ?? ''));
        if ($phase === '' && $when === '') continue;
        $clean[] = ['phase' => mb_substr($phase, 0, 120), 'when' => mb_substr($when, 0, 120), 'highlight' => !empty($m['highlight'])];
        if (count($clean) >= 20) break;
    }
    // JSON_INVALID_UTF8_SUBSTITUTE: never fail (and silently wipe the setting) on a
    // stray byte; JSON_UNESCAPED_UNICODE keeps en-dashes/emoji readable in storage.
    $json = json_encode($clean, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    if ($json === false) {
        $json = json_encode($clean); // last-resort fallback
    }
    ns_setting_set('challenge_timeline', $json !== false ? $json : '[]');
    return ns_challenge_timeline();
}

/** True when this judge has any active (non-recused) assignments. */
function new_school_judge_has_assignments(int $judgeUserId): bool
{
    new_school_workflow_ensure_schema();
    $stmt = db()->prepare("SELECT 1 FROM new_school_judge_assignments WHERE judge_user_id = ? AND status = 'assigned' LIMIT 1");
    $stmt->execute([$judgeUserId]);
    return (bool) $stmt->fetchColumn();
}

/**
 * Every judge can review every submitted project automatically — no assignment
 * needed. The only thing that blocks a judge is an explicit self-recusal
 * (conflict of interest) on that submission.
 */
function new_school_judge_can_review(int $judgeUserId, int $submissionId): bool
{
    new_school_workflow_ensure_schema();
    $stmt = db()->prepare('SELECT status FROM new_school_judge_assignments WHERE judge_user_id = ? AND submission_id = ? LIMIT 1');
    $stmt->execute([$judgeUserId, $submissionId]);
    return $stmt->fetchColumn() !== 'recused';
}

/**
 * Rank submissions by Final Competition Score with the official tie-breakers
 * (Solution → Community → Creativity → Problem → Presentation, by average judge
 * category score). Returns rows with final/automatic/judge_average + rank.
 */
function new_school_final_results(): array
{
    new_school_judge_ensure_schema();
    $rows = db()->query(
        "SELECT sub.id AS submission_id, sub.student_id, s.full_name AS student_name, s.participant_id, s.school_name,
                AVG(CASE WHEN js.status='submitted' THEN js.total END) AS judge_avg,
                AVG(CASE WHEN js.status='submitted' THEN js.solution END) AS avg_solution,
                AVG(CASE WHEN js.status='submitted' THEN js.community_impact END) AS avg_community,
                AVG(CASE WHEN js.status='submitted' THEN js.creativity END) AS avg_creativity,
                AVG(CASE WHEN js.status='submitted' THEN js.problem END) AS avg_problem,
                AVG(CASE WHEN js.status='submitted' THEN js.presentation END) AS avg_presentation
         FROM new_school_submissions sub
         INNER JOIN new_school_students s ON s.id = sub.student_id
         LEFT JOIN new_school_judge_scores js ON js.submission_id = sub.id
         WHERE sub.status <> 'draft'
         GROUP BY sub.id, sub.student_id, s.full_name, s.participant_id, s.school_name"
    )->fetchAll() ?: [];

    foreach ($rows as &$r) {
        $auto = new_school_dashboard_points((int) $r['student_id'])['total'];
        $avg = $r['judge_avg'] !== null ? round((float) $r['judge_avg'], 2) : null;
        $r['automatic'] = $auto;
        $r['judge_average'] = $avg;
        $r['final'] = $auto + ($avg !== null ? (int) round($avg) : 0);
    }
    unset($r);

    usort($rows, static function (array $a, array $b): int {
        if ($a['final'] !== $b['final']) return $b['final'] <=> $a['final'];
        foreach (['avg_solution', 'avg_community', 'avg_creativity', 'avg_problem', 'avg_presentation'] as $k) {
            $av = (float) ($a[$k] ?? 0);
            $bv = (float) ($b[$k] ?? 0);
            if ($av !== $bv) return $bv <=> $av;
        }
        return strcasecmp((string) ($a['student_name'] ?? ''), (string) ($b['student_name'] ?? ''));
    });

    $rank = 0;
    foreach ($rows as $i => &$r) {
        $r['rank_position'] = $i + 1;
        $rank++;
    }
    unset($r);
    return $rows;
}

function new_school_student_performance_score(array $student): float
{
    $interviewCount = min(10, max(0, (int) ($student['interview_count'] ?? 0)));
    $score = $interviewCount * 6;

    if (($student['parent_consent_status'] ?? '') === 'approved') {
        $score += 12;
    }
    if (($student['school_approval_status'] ?? '') === 'approved') {
        $score += 12;
    }
    if (($student['teacher_approval_status'] ?? '') === 'approved') {
        $score += 12;
    }

    $submissionStatus = (string) ($student['submission_status'] ?? '');
    if ($submissionStatus === 'submitted') {
        $score += 14;
    } elseif ($submissionStatus === 'complete') {
        $score += 24;
    } elseif ($submissionStatus === 'winner') {
        $score += 34;
    }

    $submissionScore = (float) ($student['submission_score'] ?? 0);
    if ($submissionScore > 0) {
        $score += min(24, $submissionScore);
    }

    if ((int) ($student['has_submission'] ?? 0) > 0) {
        $score += 4;
    }

    return round($score, 2);
}

/**
 * Per-request cached bulk maps for the 215-model ranking (one query each, reused
 * across the many new_school_rank_students() calls in a single request — e.g.
 * new_school_rank_teachers() ranks each teacher's students). Guarded so a
 * pre-migration DB (missing columns/tables) degrades to 0 instead of erroring.
 */
function ns_verified_interview_map(): array
{
    static $m = null;
    if ($m !== null) {
        return $m;
    }
    $m = [];
    try {
        foreach (db()->query("SELECT student_id, COUNT(*) AS c FROM new_school_business_interviews WHERE signature IS NOT NULL AND signature <> '' GROUP BY student_id")->fetchAll() as $r) {
            $m[(int) $r['student_id']] = (int) $r['c'];
        }
    } catch (\Throwable $e) { /* signature column may not exist pre-migration */ }
    return $m;
}
function ns_material_type_map(): array
{
    static $m = null;
    if ($m !== null) {
        return $m;
    }
    $m = [];
    try {
        foreach (db()->query('SELECT student_id, COUNT(DISTINCT material_type) AS c FROM new_school_supporting_materials GROUP BY student_id')->fetchAll() as $r) {
            $m[(int) $r['student_id']] = (int) $r['c'];
        }
    } catch (\Throwable $e) { /* table may not exist pre-migration */ }
    return $m;
}
function ns_submission_flags_map(): array
{
    static $m = null;
    if ($m !== null) {
        return $m;
    }
    $m = [];
    try {
        foreach (db()->query('SELECT student_id, video_url, written_url, ai_note, ai_url, community_note, community_url FROM new_school_submissions')->fetchAll() as $r) {
            $m[(int) $r['student_id']] = $r;
        }
    } catch (\Throwable $e) {
        foreach (db()->query('SELECT student_id, video_url, written_url FROM new_school_submissions')->fetchAll() as $r) {
            $m[(int) $r['student_id']] = $r;
        }
    }
    return $m;
}
/** Bulk map student_id => average submitted judge score (for final-score ranking). */
function ns_student_judge_average_map(): array
{
    static $m = null;
    if ($m !== null) {
        return $m;
    }
    $m = [];
    try {
        $rows = db()->query(
            "SELECT sub.student_id, AVG(js.total) AS avg_total
             FROM new_school_submissions sub
             INNER JOIN new_school_judge_scores js ON js.submission_id = sub.id AND js.status = 'submitted'
             GROUP BY sub.student_id"
        )->fetchAll();
        foreach ($rows as $r) {
            $m[(int) $r['student_id']] = (float) $r['avg_total'];
        }
    } catch (\Throwable $e) { /* judge tables may not exist pre-migration */ }
    return $m;
}

function new_school_rank_students(array $students): array
{
    // Per-request cached bulk maps → the 215 total per student with no N+1 storm,
    // and no repeated full-table scans across the many rank calls in one request.
    $bonusMap = new_school_student_bonus_map();
    $vMap = ns_verified_interview_map();
    $mMap = ns_material_type_map();
    $sMap = ns_submission_flags_map();
    $jMap = ns_student_judge_average_map();

    $ranked = [];
    foreach ($students as $student) {
        if (!is_array($student)) {
            continue;
        }
        $sid = (int) ($student['id'] ?? 0);
        $student['performance_score'] = new_school_student_performance_score($student);
        $parts = new_school_automatic_parts($student, $vMap[$sid] ?? 0, $mMap[$sid] ?? 0, $sMap[$sid] ?? null);
        $student['automatic_points'] = new_school_automatic_breakdown($parts)['total'];
        // Automatic component = 215 automatic total + admin bonus.
        $student['student_points'] = $student['automatic_points'] + (int) ($bonusMap[$sid] ?? 0);
        // Judge component (average of submitted judge scores) + Final Competition Score.
        $avg = $jMap[$sid] ?? null;
        $student['judge_average'] = $avg !== null ? round($avg, 2) : null;
        $student['final_score'] = $student['student_points'] + ($avg !== null ? (int) round($avg) : 0);
        $ranked[] = $student;
    }

    usort($ranked, static function (array $left, array $right): int {
        // Primary: Final Competition Score (automatic + admin bonus + avg judge score).
        $leftFinal = (int) ($left['final_score'] ?? 0);
        $rightFinal = (int) ($right['final_score'] ?? 0);
        if ($leftFinal !== $rightFinal) {
            return $rightFinal <=> $leftFinal;
        }

        // Tie-break 1: automatic points (auto + admin bonus).
        $leftPoints = (int) ($left['student_points'] ?? 0);
        $rightPoints = (int) ($right['student_points'] ?? 0);
        if ($leftPoints !== $rightPoints) {
            return $rightPoints <=> $leftPoints;
        }

        $leftScore = (float) ($left['performance_score'] ?? 0);
        $rightScore = (float) ($right['performance_score'] ?? 0);
        if ($leftScore !== $rightScore) {
            return $rightScore <=> $leftScore;
        }

        $leftInterviews = (int) ($left['interview_count'] ?? 0);
        $rightInterviews = (int) ($right['interview_count'] ?? 0);
        if ($leftInterviews !== $rightInterviews) {
            return $rightInterviews <=> $leftInterviews;
        }

        $leftSubmitted = (int) ($left['has_submission'] ?? 0);
        $rightSubmitted = (int) ($right['has_submission'] ?? 0);
        if ($leftSubmitted !== $rightSubmitted) {
            return $rightSubmitted <=> $leftSubmitted;
        }

        $leftName = strtolower((string) ($left['full_name'] ?? ''));
        $rightName = strtolower((string) ($right['full_name'] ?? ''));
        return $leftName <=> $rightName;
    });

    foreach ($ranked as $index => &$student) {
        $student['rank_position'] = $index + 1;
    }
    unset($student);

    return $ranked;
}

function new_school_rank_teachers(array $teachers, array $students): array
{
    $teacherPointsMap = new_school_points_totals_map('teacher');
    $teacherGroups = [];
    foreach ($students as $student) {
        $teacherId = (int) ($student['teacher_id'] ?? 0);
        if ($teacherId <= 0) {
            continue;
        }
        $teacherGroups[$teacherId][] = $student;
    }

    $ranked = [];
    foreach ($teachers as $teacher) {
        if (!is_array($teacher)) {
            continue;
        }

        $teacherStudents = $teacherGroups[(int) $teacher['id']] ?? [];
        $rankedStudents = new_school_rank_students($teacherStudents);
        $topStudent = $rankedStudents[0] ?? null;
        $totalScore = 0.0;
        foreach ($rankedStudents as $student) {
            $totalScore += (float) ($student['performance_score'] ?? 0);
        }

        $teacher['students_total'] = count($teacherStudents);
        $teacher['teacher_points'] = (int) ($teacherPointsMap[(int) ($teacher['id'] ?? 0)] ?? 0);
        $teacher['ranking_score'] = round($totalScore, 2);
        $teacher['average_student_score'] = $teacherStudents !== [] ? round($totalScore / count($teacherStudents), 2) : 0;
        $teacher['top_student_name'] = $topStudent['full_name'] ?? null;
        $teacher['top_student_participant_id'] = $topStudent['participant_id'] ?? null;
        $teacher['top_student_score'] = $topStudent['performance_score'] ?? null;
        $teacher['top_student_rank'] = $topStudent['rank_position'] ?? null;
        $ranked[] = $teacher;
    }

    usort($ranked, static function (array $left, array $right): int {
        // Primary: teacher total points (auto +2 per student submission + admin bonus).
        $leftPoints = (int) ($left['teacher_points'] ?? 0);
        $rightPoints = (int) ($right['teacher_points'] ?? 0);
        if ($leftPoints !== $rightPoints) {
            return $rightPoints <=> $leftPoints;
        }

        $leftScore = (float) ($left['ranking_score'] ?? 0);
        $rightScore = (float) ($right['ranking_score'] ?? 0);
        if ($leftScore !== $rightScore) {
            return $rightScore <=> $leftScore;
        }

        $leftStudents = (int) ($left['students_total'] ?? 0);
        $rightStudents = (int) ($right['students_total'] ?? 0);
        if ($leftStudents !== $rightStudents) {
            return $rightStudents <=> $leftStudents;
        }

        $leftTop = (float) ($left['top_student_score'] ?? 0);
        $rightTop = (float) ($right['top_student_score'] ?? 0);
        if ($leftTop !== $rightTop) {
            return $rightTop <=> $leftTop;
        }

        $leftName = strtolower((string) ($left['teacher_full_name'] ?? ''));
        $rightName = strtolower((string) ($right['teacher_full_name'] ?? ''));
        return $leftName <=> $rightName;
    });

    foreach ($ranked as $index => &$teacher) {
        $teacher['rank_position'] = $index + 1;
    }
    unset($teacher);

    return $ranked;
}

function new_school_find_student_rank_position(array $students, int $studentId): ?int
{
    foreach ($students as $student) {
        if ((int) ($student['id'] ?? 0) === $studentId) {
            return (int) ($student['rank_position'] ?? 0) ?: null;
        }
    }

    return null;
}

function new_school_submission_is_locked(array $student, int $interviewCount): bool
{
    // Teacher approval is the only gate for a student (parent + school gates removed).
    return !(
        ($student['teacher_approval_status'] ?? '') === 'approved'
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
    // Teacher approval is the only participation gate for a student.
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
        ['label' => 'Teacher Approval', 'complete' => ($student['teacher_approval_status'] ?? '') === 'approved'],
        ['label' => '10 Business Interviews', 'complete' => $interviewCount >= 10],
        ['label' => 'Eligible To Submit', 'complete' => $interviewCount >= 10
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

/**
 * TrendCatch EDU intake: find a school by name, or create an unclaimed EDU-managed
 * school (no principal yet, status 'registered' so it stays out of the public dropdown
 * until an admin makes it live). Lets a teacher/student register before their school is
 * formally registered/approved. Returns the school row, or null if the name is blank.
 */
function new_school_find_or_create_edu_school(string $name, string $email = '', string $website = ''): ?array
{
    $name = trim($name);
    if ($name === '') {
        return null;
    }
    $existing = new_school_fetch_school_by_name($name);
    if ($existing) {
        return $existing;
    }
    $pdo = db();
    $stmt = $pdo->prepare(
        'INSERT INTO new_school_schools
            (user_id, school_name, school_address, school_district, main_phone,
             principal_name, administrator_name, administrator_email, administrator_phone,
             school_website, status, origin, claim_status)
         VALUES (NULL, ?, "", "", "", "", "", ?, "", ?, "registered", "trendcatch_edu", "unclaimed")'
    );
    $stmt->execute([$name, trim($email), trim($website)]);
    return new_school_fetch_school_by_id((int) $pdo->lastInsertId());
}

/** Total people (students + teachers + parents) linked to a school — the EDU counter. */
function new_school_school_user_count(int $schoolId): int
{
    $stmt = db()->prepare(
        'SELECT
            (SELECT COUNT(*) FROM new_school_students s WHERE s.school_id = ?)
          + (SELECT COUNT(*) FROM new_school_teachers t WHERE t.school_id = ?)
          + (SELECT COUNT(*) FROM new_school_parents p
               INNER JOIN new_school_students ps ON ps.id = p.student_id
               WHERE ps.school_id = ?) AS total'
    );
    $stmt->execute([$schoolId, $schoolId, $schoolId]);
    return (int) $stmt->fetchColumn();
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

/* ============================================================================
 * Role-based data redaction (privacy / data isolation).
 *
 * Teacher and school must NOT see student submission/interview CONTENT, and the
 * teacher must not see student PII. Only admin sees everything. These helpers are
 * a default-deny whitelist: any role that is not explicitly 'admin' (including an
 * unknown/empty kind) gets the most restricted view, so a future column can never
 * silently leak. Always redact at the call site, never inside the fetch/builder.
 * ==========================================================================*/

// Interview metadata visible to teacher + school (content fields are dropped).
const NS_INTERVIEW_SAFE_KEYS = [
    'id', 'student_id', 'visit_number', 'business_name', 'business_category',
    'date_of_visit', 'created_at', 'updated_at',
    'student_name', 'participant_id', 'grade_level', 'school_name',
];

// Submission status/score visible to teacher + school (project content is dropped).
const NS_SUBMISSION_SAFE_KEYS = [
    'id', 'student_id', 'status', 'score', 'rank_position', 'submission_date',
    'reviewed_at', 'created_at', 'updated_at',
    'source_business_name', 'source_business_category', 'reviewer_name',
    'student_name', 'participant_id', 'grade_level', 'school_name',
];

// Student fields visible to TEACHER only (PII dropped). School keeps the full roster row.
const NS_STUDENT_SAFE_KEYS = [
    'id', 'full_name', 'participant_id', 'grade_level', 'school_id', 'teacher_id',
    'school_name', 'teacher_full_name', 'teacher_status', 'school_status', 'avatar_url',
    'parent_consent_status', 'school_approval_status', 'teacher_approval_status',
    'submission_status', 'overall_status',
    'interview_count', 'has_submission', 'submission_score', 'submission_rank_position',
    'performance_score', 'student_points', 'automatic_points', 'judge_average', 'final_score', 'rank_position', 'created_at', 'updated_at',
];

// Approval workflow fields visible to teacher (student_email / reviewer_email / notes / signature dropped).
const NS_APPROVAL_SAFE_KEYS = [
    'id', 'student_id', 'approval_type', 'status', 'reviewer_name', 'reviewer_role',
    'approved_at', 'recorded_at', 'created_at', 'updated_at',
    'student_name', 'participant_id', 'grade_level', 'school_name',
];

// Parent-link fields visible to the teacher who runs the Parent Approvals tab. The
// parent's contact details, home address and digital signature are NEVER exposed —
// the teacher only needs the name, relationship and link status to approve.
const NS_PARENT_SAFE_KEYS = [
    'id', 'student_id', 'link_status', 'student_confirmed_at', 'approved_at',
    'created_at', 'updated_at', 'parent_full_name', 'relationship_to_student',
    'student_name', 'participant_id', 'grade_level', 'school_name', 'parent_consent_status',
];

function new_school_pick(array $row, array $allow): array
{
    return array_intersect_key($row, array_flip($allow));
}

function new_school_redact_rows(array $rows, array $allow): array
{
    return array_map(
        static fn($row) => is_array($row) ? new_school_pick($row, $allow) : $row,
        $rows
    );
}

/**
 * Redact an assembled teacher/school dashboard payload in place of role.
 * admin -> untouched; school -> hide interview+submission content (keep roster);
 * teacher/default -> also strip student PII + parent + approval emails.
 */
function new_school_redact_dashboard(array $payload, array $scope): array
{
    $kind = $scope['kind'] ?? '';
    if ($kind === 'admin') {
        return $payload;
    }

    if (isset($payload['businesses'])) {
        $payload['businesses'] = new_school_redact_rows($payload['businesses'], NS_INTERVIEW_SAFE_KEYS);
    }
    if (isset($payload['submissions'])) {
        $payload['submissions'] = new_school_redact_rows($payload['submissions'], NS_SUBMISSION_SAFE_KEYS);
    }
    // Parent rows (teacher Parent Approvals tab) carry contact details + a digital
    // signature — strip everything except the link-approval essentials.
    if (isset($payload['parents'])) {
        $payload['parents'] = new_school_redact_rows($payload['parents'], NS_PARENT_SAFE_KEYS);
    }

    if ($kind !== 'school') {
        // teacher + default (most restricted): strip student PII everywhere it appears.
        if (isset($payload['students'])) {
            $payload['students'] = new_school_redact_rows($payload['students'], NS_STUDENT_SAFE_KEYS);
        }
        if (isset($payload['rankings']['students'])) {
            $payload['rankings']['students'] = new_school_redact_rows($payload['rankings']['students'], NS_STUDENT_SAFE_KEYS);
        }
        if (isset($payload['approvals'])) {
            $payload['approvals'] = new_school_redact_rows($payload['approvals'], NS_APPROVAL_SAFE_KEYS);
        }
        if (isset($payload['winners'])) {
            $payload['winners'] = array_map(
                static fn($w) => is_array($w) ? array_diff_key($w, array_flip(['student_email', 'reviewer_email'])) : $w,
                $payload['winners']
            );
        }
        unset($payload['parent']);
    }

    return $payload;
}

/**
 * Redact a single-student context (from new_school_build_student_context) by role.
 * Used by GET new-school/businesses?student_id=X for teacher/school drill-downs.
 */
function new_school_redact_student_context(array $ctx, array $scope): array
{
    $kind = $scope['kind'] ?? '';
    if ($kind === 'admin') {
        return $ctx;
    }

    if (isset($ctx['interviews'])) {
        $ctx['interviews'] = new_school_redact_rows($ctx['interviews'], NS_INTERVIEW_SAFE_KEYS);
    }
    if (isset($ctx['submission']) && is_array($ctx['submission'])) {
        $ctx['submission'] = new_school_pick($ctx['submission'], NS_SUBMISSION_SAFE_KEYS);
    }

    if ($kind !== 'school') {
        if (isset($ctx['student']) && is_array($ctx['student'])) {
            $ctx['student'] = new_school_pick($ctx['student'], NS_STUDENT_SAFE_KEYS);
        }
        if (isset($ctx['approvals'])) {
            $ctx['approvals'] = new_school_redact_rows($ctx['approvals'], NS_APPROVAL_SAFE_KEYS);
        }
        // Nested ranking leaderboards embed full rows of OTHER students - strip their PII too.
        foreach (['school', 'teacher'] as $rk) {
            if (isset($ctx['rankings'][$rk]['leaderboard'])) {
                $ctx['rankings'][$rk]['leaderboard'] = new_school_redact_rows($ctx['rankings'][$rk]['leaderboard'], NS_STUDENT_SAFE_KEYS);
            }
        }
        $ctx['parent'] = null;
    }

    return $ctx;
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

function new_school_fetch_all_schools(bool $approvedOnly = false): array
{
    $sql = 'SELECT id, school_name, school_address, zip_code, school_district, main_phone, principal_name, administrator_name, administrator_email, administrator_phone, school_website, status, origin, claim_status, claimed_at, created_at, updated_at
            FROM new_school_schools';
    if ($approvedOnly) {
        $sql .= ' WHERE status = "approved"';
    }
    $sql .= ' ORDER BY school_name ASC';

    return db()->query($sql)->fetchAll();
}

function new_school_fetch_all_teachers(bool $approvedOnly = false): array
{
    $sql = '
        SELECT t.id, t.user_id, t.school_id, t.teacher_full_name, t.school_email, t.phone_number, t.role_department,
               t.grade_level_supported, t.status, t.created_at, t.updated_at,
               s.school_name AS linked_school_name,
               s.status AS linked_school_status,
               u.avatar_url AS avatar_url
        FROM new_school_teachers t
        LEFT JOIN new_school_schools s ON s.id = t.school_id
        LEFT JOIN users u ON u.id = t.user_id';

    if ($approvedOnly) {
        $sql .= ' WHERE t.status = "approved" AND s.status = "approved"';
    }

    $sql .= ' ORDER BY s.school_name ASC, t.teacher_full_name ASC';

    return db()->query($sql)->fetchAll();
}

function new_school_fetch_teachers_for_school(int $schoolId): array
{
    $stmt = db()->prepare(
        'SELECT t.id, t.user_id, t.school_id, t.teacher_full_name, t.school_email, t.phone_number, t.role_department,
                t.grade_level_supported, t.status, t.created_at, t.updated_at,
                s.school_name AS linked_school_name,
                s.status AS linked_school_status,
                COUNT(DISTINCT st.id) AS students_total,
                SUM(CASE WHEN st.parent_consent_status = "approved" THEN 1 ELSE 0 END) AS parent_approved,
                SUM(CASE WHEN st.school_approval_status = "approved" THEN 1 ELSE 0 END) AS school_approved,
                SUM(CASE WHEN st.teacher_approval_status = "approved" THEN 1 ELSE 0 END) AS teacher_approved,
                COUNT(DISTINCT sub.id) AS submissions,
                u.avatar_url AS avatar_url
         FROM new_school_teachers t
         LEFT JOIN new_school_schools s ON s.id = t.school_id
         LEFT JOIN users u ON u.id = t.user_id
         LEFT JOIN new_school_students st ON st.teacher_id = t.id
         LEFT JOIN new_school_submissions sub ON sub.student_id = st.id
         WHERE t.school_id = ?
         GROUP BY t.id, t.user_id, t.school_id, t.teacher_full_name, t.school_email, t.phone_number, t.role_department,
                  t.grade_level_supported, t.status, t.created_at, t.updated_at, s.school_name, s.status, u.avatar_url
         ORDER BY submissions DESC, teacher_approved DESC, students_total DESC, t.teacher_full_name ASC'
    );
    $stmt->execute([$schoolId]);
    return $stmt->fetchAll();
}

function new_school_fetch_students_for_school(array $school): array
{
    $stmt = db()->prepare(
        'SELECT s.*, u.full_name AS user_full_name, u.email AS user_email, u.avatar_url AS avatar_url,
                t.teacher_full_name AS teacher_full_name,
                t.status AS teacher_status,
                sc.status AS school_status,
                (SELECT COUNT(*) FROM new_school_business_interviews bi WHERE bi.student_id = s.id) AS interview_count,
                (SELECT COUNT(*) FROM new_school_submissions sub WHERE sub.student_id = s.id) AS has_submission,
                (SELECT sub.score FROM new_school_submissions sub WHERE sub.student_id = s.id LIMIT 1) AS submission_score,
                (SELECT sub.rank_position FROM new_school_submissions sub WHERE sub.student_id = s.id LIMIT 1) AS submission_rank_position
         FROM new_school_students s
         INNER JOIN users u ON u.id = s.user_id
         LEFT JOIN new_school_teachers t ON t.id = s.teacher_id
         LEFT JOIN new_school_schools sc ON sc.id = s.school_id
         WHERE s.school_id = ? OR s.school_name = ?
         ORDER BY s.created_at DESC'
    );
    $stmt->execute([(int) $school['id'], (string) $school['school_name']]);
    return $stmt->fetchAll();
}

function new_school_fetch_students_for_teacher(array $teacher): array
{
    $stmt = db()->prepare(
        'SELECT s.*, u.full_name AS user_full_name, u.email AS user_email, u.avatar_url AS avatar_url,
                t.teacher_full_name AS teacher_full_name,
                t.status AS teacher_status,
                sc.status AS school_status,
                (SELECT COUNT(*) FROM new_school_business_interviews bi WHERE bi.student_id = s.id) AS interview_count,
                (SELECT COUNT(*) FROM new_school_submissions sub WHERE sub.student_id = s.id) AS has_submission,
                (SELECT sub.score FROM new_school_submissions sub WHERE sub.student_id = s.id LIMIT 1) AS submission_score,
                (SELECT sub.rank_position FROM new_school_submissions sub WHERE sub.student_id = s.id LIMIT 1) AS submission_rank_position
         FROM new_school_students s
         INNER JOIN users u ON u.id = s.user_id
         LEFT JOIN new_school_teachers t ON t.id = s.teacher_id
         LEFT JOIN new_school_schools sc ON sc.id = s.school_id
         WHERE s.teacher_id = ?
            OR ((s.teacher_id IS NULL OR s.teacher_id = 0) AND (s.school_id = ? OR s.school_name = ?))
         ORDER BY s.created_at DESC'
    );
    $stmt->execute([(int) $teacher['id'], (int) $teacher['school_id'], (string) ($teacher['linked_school_name'] ?? '')]);
    return $stmt->fetchAll();
}

function new_school_public_leaderboards(): array
{
    $students = db()->query(
        'SELECT s.id, s.full_name AS label, s.grade_level, s.teacher_id, s.school_id, s.parent_consent_status, s.school_approval_status,
                s.teacher_approval_status, s.submission_status,
                (SELECT sc.school_name FROM new_school_schools sc WHERE sc.id = s.school_id) AS school_name,
                (SELECT COUNT(*) FROM new_school_business_interviews bi WHERE bi.student_id = s.id) AS interview_count,
                (SELECT COUNT(*) FROM new_school_submissions sub WHERE sub.student_id = s.id) AS has_submission,
                (SELECT sub.score FROM new_school_submissions sub WHERE sub.student_id = s.id LIMIT 1) AS submission_score,
                (SELECT sub.rank_position FROM new_school_submissions sub WHERE sub.student_id = s.id LIMIT 1) AS submission_rank_position,
                s.created_at
         FROM new_school_students s
         ORDER BY s.created_at DESC'
    )->fetchAll();
    $students = array_slice(new_school_rank_students($students), 0, 10);

    return [
        'schools' => db()->query(
            'SELECT sc.id, sc.school_name AS label, sc.principal_name,
                    COUNT(DISTINCT st.id) AS students,
                    SUM(CASE WHEN st.parent_consent_status = "approved" THEN 1 ELSE 0 END) AS parent_approved,
                    SUM(CASE WHEN st.school_approval_status = "approved" THEN 1 ELSE 0 END) AS school_approved,
                    SUM(CASE WHEN st.teacher_approval_status = "approved" THEN 1 ELSE 0 END) AS teacher_approved,
                    COUNT(DISTINCT sub.id) AS submissions
             FROM new_school_schools sc
             LEFT JOIN new_school_students st ON st.school_id = sc.id
             LEFT JOIN new_school_submissions sub ON sub.student_id = st.id
             GROUP BY sc.id, sc.school_name, sc.principal_name
             ORDER BY submissions DESC, teacher_approved DESC, students DESC
             LIMIT 10'
        )->fetchAll(),
        'teachers' => db()->query(
            'SELECT t.id, t.teacher_full_name AS label,
                    (SELECT sc.school_name FROM new_school_schools sc WHERE sc.id = t.school_id) AS school_name,
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
        'students' => $students,
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

    // Referral reward: once the invited friend is teacher-approved, the referrer earns points.
    // This runs on every status refresh, so it also self-corrects: if a friend who was
    // approved is later rejected/un-linked, the previously awarded points are revoked.
    // Both paths are idempotent (the ledger UNIQUE key prevents double awards; the clear
    // is a no-op when there is nothing to remove).
    if (!empty($student['referred_by_student_id'])) {
        if (($student['teacher_approval_status'] ?? '') === 'approved') {
            new_school_points_award('student', (int) $student['referred_by_student_id'], 'referral', $studentId, 'auto', NS_POINTS_STUDENT_REFERRAL);
        } else {
            new_school_points_clear('referral', $studentId, 'auto');
        }
    }

    $interviewCount = new_school_student_interview_count($studentId);
    $submission = new_school_fetch_submission_by_student_id($studentId);

    $submissionStatus = 'locked';
    if ($submission) {
        $submissionStatus = in_array((string) $submission['status'], ['approved', 'winner'], true) ? 'complete' : 'submitted';
    } elseif (
        ($student['teacher_approval_status'] ?? '') === 'approved'
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

        $product = $catalog[$id];
        if ((string) ($product['visibility'] ?? 'live') !== 'live') {
            continue;
        }

        $normalized[] = [
            'id' => $id,
            'name' => $product['name'],
            'size' => $size !== '' ? $size : 'Default',
            'qty' => $qty,
            'price' => $product['price'],
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

/**
 * Build a full RFC822 message.
 *  - text only                     -> single text/plain part
 *  - text + html                   -> multipart/alternative
 *  - + inline images (item['cid']) -> multipart/related wrapping the alternative
 *  - + regular attachments          -> multipart/mixed wrapping the above
 * Each attachment/image item: ['filename','mime','data'(binary)] and, for an
 * inline image, ['cid' => string, 'inline' => true] referenced from the HTML
 * as <img src="cid:the-cid">.
 */
function mail_build_message(string $to, string $subject, string $bodyText, ?string $bodyHtml = null, array $attachments = []): string
{
    $fromAddress = mail_from_address();
    $fromName = mail_from_name();
    $eol = "\r\n";

    $headers = [
        'From: ' . mail_encode_header($fromName) . ' <' . $fromAddress . '>',
        'To: <' . $to . '>',
        'Subject: ' . mail_encode_header($subject),
        'MIME-Version: 1.0',
    ];

    // Split inline images (have a cid) from regular file attachments.
    $inline = [];
    $files = [];
    foreach ($attachments as $att) {
        if (!empty($att['cid'])) {
            $inline[] = $att;
        } else {
            $files[] = $att;
        }
    }

    // 1) The message body: alternative (text+html) or a bare text part.
    $textPart = 'Content-Type: text/plain; charset=UTF-8' . $eol
        . 'Content-Transfer-Encoding: 8bit' . $eol . $eol
        . mail_prepare_body($bodyText);

    if ($bodyHtml !== null && trim($bodyHtml) !== '') {
        $altBoundary = 'alt_' . bin2hex(random_bytes(12));
        $htmlPart = 'Content-Type: text/html; charset=UTF-8' . $eol
            . 'Content-Transfer-Encoding: 8bit' . $eol . $eol
            . mail_prepare_body($bodyHtml);
        $content = 'Content-Type: multipart/alternative; boundary="' . $altBoundary . '"' . $eol . $eol
            . '--' . $altBoundary . $eol . $textPart . $eol
            . '--' . $altBoundary . $eol . $htmlPart . $eol
            . '--' . $altBoundary . '--';
    } else {
        $content = $textPart;
    }

    // 2) Wrap in multipart/related when there are inline images.
    if (!empty($inline)) {
        $relBoundary = 'rel_' . bin2hex(random_bytes(12));
        $related = 'Content-Type: multipart/related; boundary="' . $relBoundary . '"' . $eol . $eol
            . '--' . $relBoundary . $eol . $content . $eol;
        foreach ($inline as $img) {
            $cid = str_replace(['"', '<', '>', "\r", "\n"], '', (string) ($img['cid'] ?? ''));
            $mime = (string) ($img['mime'] ?? 'application/octet-stream');
            $related .= '--' . $relBoundary . $eol
                . 'Content-Type: ' . $mime . $eol
                . 'Content-Transfer-Encoding: base64' . $eol
                . 'Content-ID: <' . $cid . '>' . $eol
                . 'Content-Disposition: inline; filename="' . $cid . '"' . $eol . $eol
                . chunk_split(base64_encode((string) ($img['data'] ?? ''))) . $eol;
        }
        $related .= '--' . $relBoundary . '--';
        $content = $related;
    }

    // 3) Wrap in multipart/mixed when there are regular attachments.
    if (!empty($files)) {
        $mixBoundary = 'mix_' . bin2hex(random_bytes(12));
        $body = '--' . $mixBoundary . $eol . $content . $eol;
        foreach ($files as $att) {
            $filename = str_replace(['"', "\r", "\n"], '', (string) ($att['filename'] ?? 'attachment'));
            $mime = (string) ($att['mime'] ?? 'application/octet-stream');
            $body .= '--' . $mixBoundary . $eol
                . 'Content-Type: ' . $mime . '; name="' . $filename . '"' . $eol
                . 'Content-Transfer-Encoding: base64' . $eol
                . 'Content-Disposition: attachment; filename="' . $filename . '"' . $eol . $eol
                . chunk_split(base64_encode((string) ($att['data'] ?? ''))) . $eol;
        }
        $body .= '--' . $mixBoundary . '--';
        $headers[] = 'Content-Type: multipart/mixed; boundary="' . $mixBoundary . '"';
        return implode($eol, $headers) . $eol . $eol . $body;
    }

    return implode($eol, $headers) . $eol . $content;
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

function mail_gmail_send_message(string $to, string $subject, string $bodyText, ?string $bodyHtml = null, array $attachments = []): bool
{
    $accessToken = mail_gmail_access_token();
    if ($accessToken === '') {
        return false;
    }

    $payload = json_encode([
        'raw' => mail_base64url_encode(mail_build_message($to, $subject, $bodyText, $bodyHtml, $attachments)),
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
            body_html LONGTEXT DEFAULT NULL,
            attachments_json LONGTEXT DEFAULT NULL,
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

    // Backfill columns on installs whose mail_outbox predates HTML/attachment support.
    foreach (['body_html' => 'LONGTEXT DEFAULT NULL', 'attachments_json' => 'LONGTEXT DEFAULT NULL'] as $col => $definition) {
        $exists = db()->prepare(
            'SELECT COUNT(*) FROM information_schema.columns
             WHERE table_schema = DATABASE() AND table_name = "mail_outbox" AND column_name = ?'
        );
        $exists->execute([$col]);
        if ((int) $exists->fetchColumn() === 0) {
            db()->exec("ALTER TABLE mail_outbox ADD COLUMN {$col} {$definition}");
        }
    }

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

function mail_queue_enqueue(string $kind, string $to, string $subject, string $bodyText, ?string $bodyHtml = null, array $attachments = []): bool
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
        // Binary attachment data can't live in JSON directly — base64 it for storage.
        $storable = [];
        foreach ($attachments as $a) {
            $item = [
                'filename' => (string) ($a['filename'] ?? 'attachment'),
                'mime' => (string) ($a['mime'] ?? 'application/octet-stream'),
                'data_b64' => base64_encode((string) ($a['data'] ?? '')),
            ];
            if (!empty($a['cid'])) {
                $item['cid'] = (string) $a['cid'];
                $item['inline'] = true;
            }
            $storable[] = $item;
        }
        $attachmentsJson = !empty($storable)
            ? json_encode($storable, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
            : null;
        $stmt = db()->prepare(
            'INSERT INTO mail_outbox (message_kind, recipient_email, subject, body_text, body_html, attachments_json, status, attempts, last_error, next_attempt_at)
             VALUES (?, ?, ?, ?, ?, ?, \'queued\', 0, NULL, NOW())'
        );
        $stmt->execute([$kind, $to, $subject, $bodyText, ($bodyHtml !== null && trim($bodyHtml) !== '') ? $bodyHtml : null, $attachmentsJson]);
        mail_queue_spawn_worker();
        // Windows/WAMP under Apache cannot reliably launch the detached worker
        // (popen + `start` silently no-ops as a service), so queued mail would
        // sit forever. Fall back to a short, best-effort inline drain on the web
        // request. The atomic FOR UPDATE claim keeps this safe if the spawned
        // worker also runs. Disable with MAIL_INLINE_DRAIN=false where a real
        // cron/scheduled task drains the queue instead.
        if (PHP_SAPI !== 'cli' && PHP_SAPI !== 'phpdbg'
            && filter_var(env('MAIL_INLINE_DRAIN', 'true'), FILTER_VALIDATE_BOOLEAN)) {
            try {
                mail_queue_drain(10, 12);
            } catch (Throwable $e) {
                mail_smtp_log_failure('queue-inline', $e->getMessage());
            }
        }
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
            "SELECT id, message_kind, recipient_email, subject, body_text, body_html, attachments_json, attempts
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
        $bodyHtml = isset($mail['body_html']) && $mail['body_html'] !== null && $mail['body_html'] !== ''
            ? (string) $mail['body_html']
            : null;
        $attachments = [];
        if (!empty($mail['attachments_json'])) {
            $decoded = json_decode((string) $mail['attachments_json'], true);
            if (is_array($decoded)) {
                foreach ($decoded as $a) {
                    $item = [
                        'filename' => (string) ($a['filename'] ?? 'attachment'),
                        'mime' => (string) ($a['mime'] ?? 'application/octet-stream'),
                        'data' => base64_decode((string) ($a['data_b64'] ?? '')),
                    ];
                    if (!empty($a['cid'])) {
                        $item['cid'] = (string) $a['cid'];
                        $item['inline'] = true;
                    }
                    $attachments[] = $item;
                }
            }
        }
        $ok = send_mail_message((string) $mail['recipient_email'], (string) $mail['subject'], (string) $mail['body_text'], $bodyHtml, $attachments);
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

function send_mail_message(string $to, string $subject, string $bodyText, ?string $bodyHtml = null, array $attachments = []): bool
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
                return mail_gmail_send_message($to, $subject, $bodyText, $bodyHtml, $attachments);
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
            $messageBody = mail_build_message($to, $subject, $bodyText, $bodyHtml, $attachments);

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

/* ---- Password reset (forgot password) ---- */

/** Create the password_resets table on first use (self-healing schema). */
function password_reset_ensure_schema(): void
{
    static $ready = false;
    if ($ready) {
        return;
    }
    db()->exec(
        "CREATE TABLE IF NOT EXISTS password_resets (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            token_hash CHAR(64) NOT NULL,
            expires_at DATETIME NOT NULL,
            used_at DATETIME NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_password_resets_token (token_hash),
            INDEX idx_password_resets_user (user_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $ready = true;
}

/** Absolute link the user opens to choose a new password. */
function password_reset_link(string $token): string
{
    return storefront_public_base_url() . '/reset-password?token=' . rawurlencode($token);
}

function password_reset_email_body(string $name, string $link): string
{
    $safeName = trim($name) !== '' ? trim($name) : 'there';
    return implode("\n", [
        'Hi ' . $safeName . ',',
        '',
        'We received a request to reset the password for your account.',
        'Open the link below to choose a new password:',
        '',
        $link,
        '',
        'This link expires in 60 minutes and can be used only once.',
        'If you did not request this, you can safely ignore this message — your password will not change.',
        '',
        'Thanks,',
        mail_from_name(),
    ]);
}

/**
 * Issue a single-use reset token for a user, store its SHA-256 hash, and email
 * the reset link. Returns true when the mail was queued/sent.
 */
function create_password_reset(array $user): bool
{
    password_reset_ensure_schema();

    $token = bin2hex(random_bytes(32));
    $tokenHash = hash('sha256', $token);

    // Invalidate any still-pending tokens for this user, then store the new one.
    // Expiry is computed with MySQL's own clock (NOW() + INTERVAL) so it always
    // matches the NOW() comparison in consume_password_reset — a PHP-computed
    // timestamp would break whenever the PHP and MySQL timezones differ.
    $pdo = db();
    $pdo->prepare('UPDATE password_resets SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL')
        ->execute([(int) $user['id']]);
    $pdo->prepare('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, NOW() + INTERVAL 60 MINUTE)')
        ->execute([(int) $user['id'], $tokenHash]);

    $link = password_reset_link($token);
    $built = email_password_reset((string) ($user['full_name'] ?? ''), $link);
    return queue_themed_mail('password_reset', (string) $user['email'], $built);
}

/**
 * Validate a reset token and, if good, return the matching users row.
 * Marks the token used so it cannot be replayed. Returns null when the token is
 * unknown, already used, or expired.
 */
/**
 * Check whether a reset token is currently usable (exists, unused, not expired)
 * WITHOUT consuming it. Used by the reset page to decide whether to show the
 * form or an "invalid / already used" message on load.
 */
function password_reset_token_valid(string $token): bool
{
    if (trim($token) === '') {
        return false;
    }
    password_reset_ensure_schema();
    $stmt = db()->prepare(
        'SELECT 1 FROM password_resets
         WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()
         LIMIT 1'
    );
    $stmt->execute([hash('sha256', $token)]);
    return (bool) $stmt->fetchColumn();
}

function consume_password_reset(string $token): ?array
{
    password_reset_ensure_schema();

    $tokenHash = hash('sha256', $token);
    $pdo = db();
    $stmt = $pdo->prepare(
        'SELECT id, user_id FROM password_resets
         WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()
         LIMIT 1'
    );
    $stmt->execute([$tokenHash]);
    $reset = $stmt->fetch();
    if (!$reset) {
        return null;
    }

    $userStmt = $pdo->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
    $userStmt->execute([(int) $reset['user_id']]);
    $user = $userStmt->fetch();
    if (!$user) {
        return null;
    }

    $pdo->prepare('UPDATE password_resets SET used_at = NOW() WHERE id = ?')
        ->execute([(int) $reset['id']]);

    return $user;
}

/**
 * Recipients for team notifications: every admin account in the database plus
 * the optional NOTIFY_EMAIL from .env. De-duplicated (case-insensitive).
 */
function notify_recipients(): array
{
    $emails = [];

    $notify = trim((string) env('NOTIFY_EMAIL', ''));
    if ($notify !== '') {
        $emails[] = $notify;
    }

    try {
        $rows = db()->query(
            "SELECT email FROM users
             WHERE role IN ('admin','super_admin') AND email IS NOT NULL AND email <> ''"
        )->fetchAll();
        foreach ($rows as $row) {
            $emails[] = (string) $row['email'];
        }
    } catch (\Throwable $e) {
        // If the query fails, fall back to just NOTIFY_EMAIL.
    }

    $seen = [];
    $out = [];
    foreach ($emails as $email) {
        $key = strtolower(trim($email));
        if ($key === '' || isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;
        $out[] = trim($email);
    }
    return $out;
}

/**
 * Fire-and-forget email notification to the team (all admin accounts + NOTIFY_EMAIL).
 * No-op unless MAIL_ENABLED=true and at least one recipient exists.
 * Always non-fatal — a mail failure must never break the API request.
 */
function notify(string $subject, string $bodyText): void
{
    if (!filter_var(env('MAIL_ENABLED', 'false'), FILTER_VALIDATE_BOOLEAN)) {
        return;
    }
    $recipients = notify_recipients();
    if ($recipients === []) {
        return;
    }
    try {
        $built = email_admin_notification($subject, $bodyText);
        foreach ($recipients as $to) {
            queue_themed_mail('notification', $to, $built);
        }
    } catch (\Throwable $e) {
        // swallow — notifications are best-effort
    }
}

// Guarded require: a missing mail_templates.php (e.g. a partial deploy) must not
// fatal every API request. Content endpoints keep working; only mail features
// (which need the email_* builders) would then surface a clean error.
if (is_file(__DIR__ . '/mail_templates.php')) {
    require_once __DIR__ . '/mail_templates.php';
}

/**
 * Queue (with inline-drain fallback) a branded email built by one of the
 * email_* builders in mail_templates.php. $built = ['subject','html','text'].
 */
function queue_themed_mail(string $kind, string $to, array $built, array $attachments = []): bool
{
    $subject = (string) ($built['subject'] ?? '');
    $text = (string) ($built['text'] ?? '');
    $html = (string) ($built['html'] ?? '');
    // Embed the brand logo inline (cid:fc-logo) so it renders without a public URL.
    if (str_contains($html, 'cid:' . EMAIL_LOGO_CID)) {
        $logo = email_inline_logo();
        if ($logo !== null) {
            array_unshift($attachments, $logo);
        }
    }
    if (mail_queue_enqueue($kind, $to, $subject, $text, $html, $attachments)) {
        return true;
    }
    return send_mail_message($to, $subject, $text, $html !== '' ? $html : null, $attachments);
}


