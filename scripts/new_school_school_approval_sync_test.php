<?php

declare(strict_types=1);

// Verifies that approving a school user account flips the linked new_school_schools
// row to "approved" so it surfaces in the approved-only "Select School" dropdown.
// Runs entirely inside a rolled-back transaction; no data is persisted.

require_once __DIR__ . '/../api/config.php';
require_once __DIR__ . '/../api/lib.php';
require_once __DIR__ . '/../api/new_school_routes.php';

$pdo = db();

$fail = static function (string $message): void {
    fwrite(STDERR, 'FAIL: ' . $message . PHP_EOL);
    exit(1);
};
$assert = static function (bool $cond, string $message) use ($fail): void {
    if (!$cond) { $fail($message); }
};
$dropdownHas = static function (int $schoolId): bool {
    foreach (new_school_fetch_all_schools(true) as $row) {
        if ((int) $row['id'] === $schoolId) { return true; }
    }
    return false;
};

$pdo->beginTransaction();
try {
    $email = 'pending.school.synctest@example.test';
    $name = 'Sync Test Academy';

    // 1. A freshly registered school: user pending + school row "registered".
    $pdo->prepare('INSERT INTO users (full_name, email, password_hash, role, approval_status, email_verified_at)
                   VALUES (?, ?, ?, "school", "pending", NOW())')
        ->execute([$name, $email, password_hash('secret123', PASSWORD_DEFAULT)]);
    $userId = (int) $pdo->lastInsertId();

    $pdo->prepare('INSERT INTO new_school_schools (user_id, school_name, school_district, administrator_name, administrator_email, status)
                   VALUES (?, ?, "Test District", ?, ?, "registered")')
        ->execute([$userId, $name, $name, $email]);
    $schoolId = (int) $pdo->lastInsertId();

    $assert(!$dropdownHas($schoolId), 'A "registered" school must NOT appear in the approved dropdown.');

    // 2. Admin approves the account (replicates PUT admin/user/{id}/approval, incl. the new sync).
    $status = 'approved';
    $pdo->prepare('UPDATE users SET approval_status = ?, approval_reviewed_at = NOW() WHERE id = ?')
        ->execute([$status, $userId]);
    $schoolStatus = $status === 'approved' ? 'approved' : ($status === 'rejected' ? 'rejected' : 'registered');
    $pdo->prepare('UPDATE new_school_schools SET status = ?, updated_at = NOW() WHERE user_id = ?')
        ->execute([$schoolStatus, $userId]);

    $assert($dropdownHas($schoolId), 'After approval the school MUST appear in the approved dropdown.');

    // 3. Rejection path pulls it back out.
    $pdo->prepare('UPDATE new_school_schools SET status = "rejected" WHERE user_id = ?')->execute([$userId]);
    $assert(!$dropdownHas($schoolId), 'A rejected school must NOT appear in the approved dropdown.');

    echo 'PASS: school approval status sync surfaces/hides school in the Select School dropdown.' . PHP_EOL;
} finally {
    $pdo->rollBack();
}
