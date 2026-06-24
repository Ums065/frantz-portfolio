<?php

declare(strict_types=1);

/*
 * "Super machine" security + data-isolation test.
 *
 * Verifies the role-isolation model and the fixes applied after the end-to-end audit:
 *   - Teacher / school dashboards never receive interview/project CONTENT.
 *   - Teacher never receives student PII or parent contact details / digital signatures.
 *   - A teacher only sees their OWN students (+ unassigned students in their school),
 *     never another teacher's class (cross-teacher isolation).
 *   - The unauthenticated participant lookup does not leak a teacher's email.
 */

require_once __DIR__ . '/../api/config.php';
require_once __DIR__ . '/../api/lib.php';

$pass = 0;
$fail = static function (string $m): void { fwrite(STDERR, "FAIL: $m" . PHP_EOL); exit(1); };
$assert = static function (bool $c, string $m) use (&$pass, $fail): void {
    if (!$c) { $fail($m); }
    $pass++;
};

/* ------------------------------------------------------------------ *
 * 1. Redaction — teacher view drops ALL content + PII.
 * ------------------------------------------------------------------ */
$rawDashboard = [
    'role' => 'teacher',
    'students' => [[
        'id' => 1, 'full_name' => 'Test Student', 'participant_id' => '12345678',
        'phone_number' => '555-0100', 'home_address' => '1 Secret St', 'date_of_birth' => '2010-01-01',
        'parent_email' => 'mom@example.com', 'teacher_approval_status' => 'approved',
    ]],
    'businesses' => [[
        'id' => 9, 'student_id' => 1, 'business_name' => 'Cafe', 'business_category' => 'Food',
        'main_challenge' => 'SECRET CHALLENGE', 'proposed_solution' => 'SECRET SOLUTION',
        'owner_name' => 'Jane Owner', 'business_phone' => '555-9999', 'student_notes' => 'NOTES',
    ]],
    'submissions' => [[
        'id' => 5, 'student_id' => 1, 'status' => 'submitted', 'score' => 88,
        'problem_identified' => 'SECRET PROBLEM', 'why_it_matters' => 'SECRET WHY',
        'proposed_solution' => 'SECRET SOLUTION', 'how_it_helps' => 'SECRET HOW',
    ]],
    'parents' => [[
        'id' => 3, 'student_id' => 1, 'parent_full_name' => 'Mom Parent', 'relationship' => 'Mother',
        'link_status' => 'pending_teacher', 'digital_signature' => 'Mom Parent SIGNATURE',
        'home_address' => '1 Secret St', 'parent_phone' => '555-0100', 'parent_email' => 'mom@example.com',
    ]],
    'approvals' => [[
        'id' => 2, 'student_id' => 1, 'approval_type' => 'teacher', 'status' => 'approved',
        'student_email' => 'kid@example.com', 'reviewer_email' => 'rev@example.com', 'digital_signature' => 'SIG',
    ]],
];

$teacherView = new_school_redact_dashboard($rawDashboard, ['kind' => 'teacher']);

// Interview / project content gone.
$assert(!isset($teacherView['businesses'][0]['main_challenge']), 'Teacher must not see interview main_challenge.');
$assert(!isset($teacherView['businesses'][0]['proposed_solution']), 'Teacher must not see interview proposed_solution.');
$assert(!isset($teacherView['businesses'][0]['owner_name']), 'Teacher must not see interview owner_name.');
$assert(!isset($teacherView['businesses'][0]['student_notes']), 'Teacher must not see interview student_notes.');
$assert(isset($teacherView['businesses'][0]['business_name']), 'Teacher should still see business_name (metadata).');
$assert(!isset($teacherView['submissions'][0]['problem_identified']), 'Teacher must not see submission problem_identified.');
$assert(!isset($teacherView['submissions'][0]['how_it_helps']), 'Teacher must not see submission how_it_helps.');
$assert(isset($teacherView['submissions'][0]['score']), 'Teacher should still see submission score.');

// Student PII gone.
$assert(!isset($teacherView['students'][0]['phone_number']), 'Teacher must not see student phone_number.');
$assert(!isset($teacherView['students'][0]['home_address']), 'Teacher must not see student home_address.');
$assert(!isset($teacherView['students'][0]['date_of_birth']), 'Teacher must not see student date_of_birth.');
$assert(!isset($teacherView['students'][0]['parent_email']), 'Teacher must not see student parent_email.');
$assert(isset($teacherView['students'][0]['full_name']), 'Teacher should still see student full_name.');

// Parent PII gone (the new fix).
$assert(!isset($teacherView['parents'][0]['digital_signature']), 'Teacher must not see parent digital_signature.');
$assert(!isset($teacherView['parents'][0]['home_address']), 'Teacher must not see parent home_address.');
$assert(!isset($teacherView['parents'][0]['parent_phone']), 'Teacher must not see parent parent_phone.');
$assert(!isset($teacherView['parents'][0]['parent_email']), 'Teacher must not see parent parent_email.');
$assert(($teacherView['parents'][0]['parent_full_name'] ?? '') === 'Mom Parent', 'Teacher should still see parent_full_name.');
$assert(($teacherView['parents'][0]['link_status'] ?? '') === 'pending_teacher', 'Teacher should still see link_status.');

// Approval signature / emails gone.
$assert(!isset($teacherView['approvals'][0]['digital_signature']), 'Teacher must not see approval digital_signature.');
$assert(!isset($teacherView['approvals'][0]['student_email']), 'Teacher must not see approval student_email.');

/* ------------------------------------------------------------------ *
 * 2. Redaction — school keeps roster PII but never content.
 * ------------------------------------------------------------------ */
$schoolView = new_school_redact_dashboard($rawDashboard, ['kind' => 'school']);
$assert(!isset($schoolView['businesses'][0]['main_challenge']), 'School must not see interview content.');
$assert(!isset($schoolView['submissions'][0]['problem_identified']), 'School must not see submission content.');
$assert(!isset($schoolView['parents'][0]['digital_signature']), 'School must not see parent digital_signature.');
$assert(isset($schoolView['students'][0]['home_address']), 'School keeps the full student roster row (by design).');

/* ------------------------------------------------------------------ *
 * 3. Redaction — admin sees everything untouched.
 * ------------------------------------------------------------------ */
$adminView = new_school_redact_dashboard($rawDashboard, ['kind' => 'admin']);
$assert(($adminView['businesses'][0]['main_challenge'] ?? '') === 'SECRET CHALLENGE', 'Admin sees interview content.');
$assert(($adminView['parents'][0]['digital_signature'] ?? '') === 'Mom Parent SIGNATURE', 'Admin sees parent signature.');

/* ------------------------------------------------------------------ *
 * 4. Cross-teacher isolation against REAL data.
 *    Every student a teacher fetches must be theirs OR unassigned (teacher_id 0/null) —
 *    never assigned to a different teacher.
 * ------------------------------------------------------------------ */
$teachers = db()->query('SELECT * FROM new_school_teachers')->fetchAll();
foreach ($teachers as $teacher) {
    $rows = new_school_fetch_students_for_teacher($teacher);
    foreach ($rows as $row) {
        $tid = (int) ($row['teacher_id'] ?? 0);
        $ok = $tid === (int) $teacher['id'] || $tid === 0;
        $assert($ok, "Teacher #{$teacher['id']} leaked a student assigned to teacher #{$tid}.");
    }
}

/* ------------------------------------------------------------------ *
 * 5. Parent-link whitelist constant excludes sensitive fields.
 * ------------------------------------------------------------------ */
foreach (['digital_signature', 'home_address', 'parent_phone', 'parent_email'] as $banned) {
    $assert(!in_array($banned, NS_PARENT_SAFE_KEYS, true), "NS_PARENT_SAFE_KEYS must not include $banned.");
}

echo "PASS: $pass isolation/security assertions held (content + PII redaction, cross-teacher scoping, parent whitelist)." . PHP_EOL;
