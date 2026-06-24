<?php

declare(strict_types=1);

// Phase 1 workflow checks: student gating is teacher-only, and the parent
// approval-chain columns exist with the correct states.

require_once __DIR__ . '/../api/config.php';
require_once __DIR__ . '/../api/lib.php';

$fail = static function (string $m): void { fwrite(STDERR, 'FAIL: ' . $m . PHP_EOL); exit(1); };
$assert = static function (bool $c, string $m) use ($fail): void { if (!$c) { $fail($m); } };

// ---- 1. Student gating is teacher-only ----
$teacherApproved = ['teacher_approval_status' => 'approved', 'parent_consent_status' => 'pending', 'school_approval_status' => 'pending'];
$teacherPending  = ['teacher_approval_status' => 'pending',  'parent_consent_status' => 'approved', 'school_approval_status' => 'approved'];

$assert(new_school_submission_is_locked($teacherApproved, 9) === true, 'Locked when <10 interviews even if teacher-approved.');
$assert(new_school_submission_is_locked($teacherApproved, 10) === false, 'UNLOCKED with teacher approval + 10 interviews (parent/school irrelevant).');
$assert(new_school_submission_is_locked($teacherPending, 10) === true, 'Locked when teacher NOT approved, even if parent+school approved.');

$assert(new_school_overall_status($teacherApproved, 10) === 'eligible_to_submit', 'Teacher-approved + 10 interviews => eligible_to_submit.');
$assert(new_school_overall_status($teacherApproved, 3) === 'interviews_pending', 'Teacher-approved but few interviews => interviews_pending.');
$assert(new_school_overall_status($teacherPending, 10) === 'teacher_approval_pending', 'No teacher approval => teacher_approval_pending (no parent/school gate).');

// Status tracker no longer lists parent/school steps.
$labels = array_map(static fn($s) => $s['label'], new_school_status_tracker($teacherApproved, 10));
$assert(!in_array('Parent Consent', $labels, true), 'Status tracker should NOT include Parent Consent step.');
$assert(!in_array('School Approval', $labels, true), 'Status tracker should NOT include School Approval step.');
$assert(in_array('Teacher Approval', $labels, true), 'Status tracker should include Teacher Approval step.');

// ---- 2. Parent approval-chain columns exist ----
new_school_parents_ensure_link_columns();
$cols = db()->query("SHOW COLUMNS FROM new_school_parents")->fetchAll(PDO::FETCH_COLUMN);
$assert(in_array('link_status', $cols, true), 'new_school_parents.link_status column exists.');
$assert(in_array('student_confirmed_at', $cols, true), 'new_school_parents.student_confirmed_at column exists.');
$type = db()->query("SHOW COLUMNS FROM new_school_parents LIKE 'link_status'")->fetch(PDO::FETCH_ASSOC)['Type'] ?? '';
foreach (['pending_student', 'pending_teacher', 'approved', 'rejected'] as $state) {
    $assert(strpos($type, $state) !== false, "link_status enum includes '$state'.");
}

echo 'PASS: teacher-only student gating + parent-chain schema are in place.' . PHP_EOL;
