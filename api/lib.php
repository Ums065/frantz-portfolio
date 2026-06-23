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

/** Best-effort client IP — honors X-Forwarded-For (first hop) then REMOTE_ADDR. */
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

function storefront_inventory_defaults(): array
{
    return [
        'hoodie-legacy' => [
            'name' => 'Founder Hoodie - Legacy Black',
            'category' => 'Hoodies',
            'description' => 'Heavyweight fleece hoodie with the embroidered FC emblem.',
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
            'description' => 'Soft cotton tee with the FC emblem and an everyday fit.',
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
            'description' => 'Structured cap with gold FC monogram and adjustable fit.',
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
            'description' => 'Hardcover guide to the From Nothing to Something story.',
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
            'description' => 'Gold enamel FC pin for collectors and launch supporters.',
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
            'description' => 'Premium brushed hoodie reserved for a future drop.',
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
            'description' => 'A future tee drop centered on the tech-for-good mission.',
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
            'description' => 'Statement tee reserved for a later release window.',
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
            'description' => 'Structured cap saved for a future community release.',
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
            'description' => 'Digital companion guide for a future resource release.',
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
            'description' => 'Signed founder print reserved for a premium future drop.',
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

function storefront_inventory_has_catalog_columns(): bool
{
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }

    try {
        $stmt = db()->query("SHOW COLUMNS FROM store_inventory LIKE 'visibility'");
        $cached = (bool) $stmt->fetch();
    } catch (Throwable $e) {
        $cached = false;
    }

    return $cached;
}

function storefront_seed_inventory_defaults(?PDO $pdo = null): void
{
    $pdo ??= db();
    $defaults = storefront_inventory_defaults();

    if (storefront_inventory_has_catalog_columns()) {
        $seed = $pdo->prepare(
            'INSERT IGNORE INTO store_inventory
               (product_id, name, category, description, image, price, stock, low_stock_threshold, restock_note, visibility, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        foreach ($defaults as $productId => $cfg) {
            $seed->execute([
                $productId,
                $cfg['name'] ?? null,
                $cfg['category'] ?? null,
                $cfg['description'] ?? null,
                $cfg['image'] ?? null,
                (float) ($cfg['price'] ?? 0),
                (int) ($cfg['stock'] ?? 0),
                (int) ($cfg['threshold'] ?? 5),
                $cfg['restock_note'] ?? null,
                $cfg['visibility'] ?? 'live',
                (int) ($cfg['sort_order'] ?? 0),
            ]);
        }
        return;
    }

    $seed = $pdo->prepare(
        'INSERT IGNORE INTO store_inventory (product_id, stock, low_stock_threshold, restock_note)
         VALUES (?, ?, ?, ?)'
    );
    foreach ($defaults as $productId => $cfg) {
        $seed->execute([
            $productId,
            (int) ($cfg['stock'] ?? 0),
            (int) ($cfg['threshold'] ?? 5),
            $cfg['restock_note'] ?? null,
        ]);
    }
}

function storefront_inventory_rows(bool $includeHidden = false): array
{
    storefront_seed_inventory_defaults();
    $defaults = storefront_inventory_defaults();
    $rows = [];

    if (storefront_inventory_has_catalog_columns()) {
        $sql = 'SELECT product_id, name, category, description, image, price, stock, low_stock_threshold,
                       restock_note, visibility, sort_order, updated_at
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
            $description = trim((string) ($row['description'] ?? '')) !== '' ? (string) $row['description'] : ($meta['description'] ?? null);
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
                'description' => $description,
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

    $stmt = db()->query(
        'SELECT product_id, stock, low_stock_threshold, restock_note, updated_at
         FROM store_inventory ORDER BY product_id ASC'
    );
    foreach ($stmt->fetchAll() as $row) {
        $productId = (string) $row['product_id'];
        $meta = $defaults[$productId] ?? [];
        $stock = (int) $row['stock'];
        $threshold = (int) $row['low_stock_threshold'];
        $stockStatus = inventory_status_label($stock, $threshold);
        $rows[] = [
            'product_id' => $productId,
            'name' => (string) ($meta['name'] ?? $productId),
            'category' => (string) ($meta['category'] ?? ''),
            'description' => $meta['description'] ?? null,
            'image' => $meta['image'] ?? null,
            'price' => round((float) ($meta['price'] ?? 0), 2),
            'stock' => $stock,
            'low_stock_threshold' => $threshold,
            'visibility' => (string) ($meta['visibility'] ?? 'live'),
            'stock_status' => $stockStatus,
            'status' => $stockStatus,
            'restock_note' => $row['restock_note'] ?: ($meta['restock_note'] ?? null),
            'sort_order' => (int) ($meta['sort_order'] ?? 0),
            'updated_at' => $row['updated_at'],
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
        $payload["line_items[$index][price_data][currency]"] = 'usd';
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
    if (mail_queue_enqueue('sponsor_interest', (string) $application['email_address'], $subject, $bodyText)) {
        return;
    }

    try {
        send_mail_message((string) $application['email_address'], $subject, $bodyText);
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
            source_type ENUM('interview','project') NOT NULL,
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
        || !in_array($sourceType, ['interview', 'project'], true)
        || !in_array($kind, ['auto', 'bonus'], true)) {
        return;
    }
    new_school_points_ensure_schema();
    $stmt = db()->prepare(
        'INSERT INTO new_school_points (recipient_role, recipient_id, source_type, source_id, kind, points, awarded_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE points = VALUES(points), awarded_by_user_id = VALUES(awarded_by_user_id), updated_at = NOW()'
    );
    $stmt->execute([$role, $recipientId, $sourceType, $sourceId, $kind, $points, $awardedBy]);
    $GLOBALS['__ns_points_dirty'] = true;
}

function new_school_points_clear(string $sourceType, int $sourceId, string $kind): void
{
    if ($sourceId <= 0) {
        return;
    }
    new_school_points_ensure_schema();
    $stmt = db()->prepare('DELETE FROM new_school_points WHERE source_type = ? AND source_id = ? AND kind = ?');
    $stmt->execute([$sourceType, $sourceId, $kind]);
    $GLOBALS['__ns_points_dirty'] = true;
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

function new_school_rank_students(array $students): array
{
    $pointsMap = new_school_points_totals_map('student');
    $ranked = [];
    foreach ($students as $student) {
        if (!is_array($student)) {
            continue;
        }
        $student['performance_score'] = new_school_student_performance_score($student);
        $student['student_points'] = (int) ($pointsMap[(int) ($student['id'] ?? 0)] ?? ($student['student_points'] ?? 0));
        $ranked[] = $student;
    }

    usort($ranked, static function (array $left, array $right): int {
        // Primary: total points (auto + admin bonus). Falls back to the workflow score on ties.
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
    'school_name', 'teacher_full_name', 'teacher_status', 'school_status',
    'parent_consent_status', 'school_approval_status', 'teacher_approval_status',
    'submission_status', 'overall_status',
    'interview_count', 'has_submission', 'submission_score', 'submission_rank_position',
    'performance_score', 'student_points', 'rank_position', 'created_at', 'updated_at',
];

// Approval workflow fields visible to teacher (student_email / reviewer_email / notes / signature dropped).
const NS_APPROVAL_SAFE_KEYS = [
    'id', 'student_id', 'approval_type', 'status', 'reviewer_name', 'reviewer_role',
    'approved_at', 'recorded_at', 'created_at', 'updated_at',
    'student_name', 'participant_id', 'grade_level', 'school_name',
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
    $sql = 'SELECT id, school_name, school_address, school_district, main_phone, principal_name, administrator_name, administrator_email, administrator_phone, status, created_at
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
               s.status AS linked_school_status
        FROM new_school_teachers t
        LEFT JOIN new_school_schools s ON s.id = t.school_id';

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
                COUNT(DISTINCT sub.id) AS submissions
         FROM new_school_teachers t
         LEFT JOIN new_school_schools s ON s.id = t.school_id
         LEFT JOIN new_school_students st ON st.teacher_id = t.id
         LEFT JOIN new_school_submissions sub ON sub.student_id = st.id
         WHERE t.school_id = ?
         GROUP BY t.id, t.user_id, t.school_id, t.teacher_full_name, t.school_email, t.phone_number, t.role_department,
                  t.grade_level_supported, t.status, t.created_at, t.updated_at, s.school_name, s.status
         ORDER BY submissions DESC, teacher_approved DESC, students_total DESC, t.teacher_full_name ASC'
    );
    $stmt->execute([$schoolId]);
    return $stmt->fetchAll();
}

function new_school_fetch_students_for_school(array $school): array
{
    $stmt = db()->prepare(
        'SELECT s.*, u.full_name AS user_full_name, u.email AS user_email,
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
        'SELECT s.*, u.full_name AS user_full_name, u.email AS user_email,
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
         WHERE s.teacher_id = ? OR s.school_id = ? OR s.school_name = ?
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
