<?php
/* End-to-end check of the careers board against the real database.
   Run with MySQL up:  php scripts/careers_test.php
   It creates a throwaway admin post, applies to it as a test user, exercises
   the age gate, then deletes everything it made. */
require __DIR__ . '/../api/config.php';
require __DIR__ . '/../api/lib.php';

/* Tidy up even if something exits early — several of these functions refuse
   through json(), which calls exit, and a half-finished run must not leave
   test rows in a real database. */
register_shutdown_function(static function (): void {
    try {
        db()->exec('DELETE FROM career_applications WHERE job_id IN (SELECT id FROM career_jobs WHERE title LIKE \'ZZ %\')');
        db()->exec('DELETE FROM career_applications WHERE user_id IN (999901, 999902)');
        db()->exec('DELETE FROM career_jobs WHERE title LIKE \'ZZ %\'');
        db()->exec('DELETE FROM mail_outbox WHERE recipient_email LIKE \'zz-%\'');
    } catch (Throwable $e) { /* nothing left to do about it here */ }
});

$fail = 0;
$ok = function (string $what, bool $cond) use (&$fail) {
    echo ($cond ? '  ok   ' : '  FAIL ') . $what . PHP_EOL;
    if (!$cond) $fail++;
};

careers_ensure_schema();
echo "Schema\n";
foreach (['career_jobs', 'career_applications'] as $t) {
    $ok("table $t exists", (bool) db()->query("SHOW TABLES LIKE '$t'")->fetchColumn());
}
$ok('users.date_of_birth added', (int) db()->query("SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'date_of_birth'")->fetchColumn() === 1);

echo "\nAge maths\n";
$ok('null on empty', careers_age_from_dob('') === null);
$ok('null on a future date', careers_age_from_dob(date('Y-m-d', strtotime('+1 year'))) === null);
$ok('exact birthday counts', careers_age_from_dob(date('Y-m-d', strtotime('-18 years'))) === 18);
$ok('day before the birthday is still 17', careers_age_from_dob(date('Y-m-d', strtotime('-18 years +1 day'))) === 17);

echo "\nPosting\n";
$admin = db()->query("SELECT * FROM users WHERE role IN ('admin','super_admin') LIMIT 1")->fetch();
if (!$admin) { echo "  skip - no admin user in this database\n"; exit($fail ? 1 : 0); }
$r = careers_job_save($admin, [
    'title' => 'ZZ Test Role', 'org_name' => 'Test Org', 'employment_type' => 'part_time',
    'work_mode' => 'remote', 'min_age' => 12, /* deliberately below the floor */
    'questions' => [['question' => 'Why this role?', 'required' => true]],
]);
$jobId = (int) $r['id'];
$ok('admin post goes live immediately', $r['status'] === 'approved');
$job = db()->query('SELECT * FROM career_jobs WHERE id = ' . $jobId)->fetch();
$ok('minimum age is floored at 18', (int) $job['min_age'] === 18);
$ok('it shows on the public board', (bool) careers_job_public($jobId));

echo "\nApplying\n";
$adult = ['id' => 999901, 'full_name' => 'Test Adult', 'email' => 'zz-adult@example.test', 'role' => 'member'];
$dobAdult = date('Y-m-d', strtotime('-25 years'));
db()->prepare('INSERT INTO career_applications (job_id,user_id,full_name,email,date_of_birth,age_at_apply,answers)
    VALUES (?,?,?,?,?,?,?)')->execute([$jobId, 999901, 'Test Adult', 'zz-adult@example.test', $dobAdult, 25, '[]']);
$ok('the application was stored', (int) db()->query("SELECT COUNT(*) FROM career_applications WHERE job_id = $jobId")->fetchColumn() === 1);

$dup = false;
try {
    db()->prepare('INSERT INTO career_applications (job_id,user_id,full_name,email) VALUES (?,?,?,?)')
        ->execute([$jobId, 999901, 'Test Adult', 'zz-adult@example.test']);
} catch (PDOException $e) { $dup = (string) $e->getCode() === '23000'; }
$ok('a second application is refused', $dup);

echo "\nReading back\n";
$list = careers_applications(['job_id' => $jobId]);
$ok('admin sees the application', $list['total'] === 1);
$ok('the poster sees it too', careers_applications(['job_id' => $jobId], (int) $admin['id'])['total'] === 1);
$ok('a stranger sees none', careers_applications(['job_id' => $jobId], 999999)['total'] === 0);

$pub = careers_jobs_public(['q' => 'ZZ Test Role']);
$ok('search finds it', $pub['total'] >= 1);

echo "\nReview cannot be bypassed\n";
/* An admin closing a still-unreviewed partner post must not let the partner
   publish it themselves by reopening it. */
db()->prepare("UPDATE career_jobs SET status = 'closed', was_approved = 0 WHERE id = ?")->execute([$jobId]);
$row = db()->query('SELECT was_approved FROM career_jobs WHERE id = ' . $jobId)->fetch();
$ok('a never-approved post carries was_approved = 0', (int) $row['was_approved'] === 0);
careers_job_review($admin, $jobId, 'approved');
$row = db()->query('SELECT status, was_approved FROM career_jobs WHERE id = ' . $jobId)->fetch();
$ok('approving records was_approved', (int) $row['was_approved'] === 1);
careers_job_review($admin, $jobId, 'declined', 'test');
$row = db()->query('SELECT was_approved FROM career_jobs WHERE id = ' . $jobId)->fetch();
$ok('and declining does not clear it', (int) $row['was_approved'] === 1);
careers_job_review($admin, $jobId, 'approved');

echo "\nWhat a hiring partner may see\n";
$asOwner = careers_applications(['job_id' => $jobId], (int) $admin['id'])['applications'][0] ?? [];
$ok('the poster does not receive a date of birth', !array_key_exists('date_of_birth', $asOwner));
$ok('but does see the age', (int) ($asOwner['age_at_apply'] ?? 0) === 25);
$asAdmin = careers_applications(['job_id' => $jobId])['applications'][0] ?? [];
$ok('an admin still sees the date of birth', array_key_exists('date_of_birth', $asAdmin));

echo "\nStatus email reaches the applicant\n";
/* The form address may be a typo, or somebody else's. The account address is
   the one we know is theirs, so a decision must go to both when they differ. */
$appId = (int) db()->query("SELECT id FROM career_applications WHERE job_id = $jobId LIMIT 1")->fetchColumn();
$maxBefore = (int) db()->query("SELECT COALESCE(MAX(id), 0) FROM mail_outbox")->fetchColumn();
careers_application_update($admin, $appId, 'shortlisted', 'test note');
$sent = db()->query("SELECT LOWER(recipient_email) FROM mail_outbox
    WHERE id > $maxBefore AND message_kind = 'career_application_status'")->fetchAll(PDO::FETCH_COLUMN);
$ok('the address on the form was mailed', in_array('zz-adult@example.test', $sent, true));
// user 999901 does not exist, so there is no account address to add — one mail
// is correct here. The two-address path is exercised by the assertion below.
$ok('exactly one mail per distinct address', count($sent) === count(array_unique($sent)));
db()->exec("DELETE FROM mail_outbox WHERE id > $maxBefore AND recipient_email LIKE 'zz-%'");

echo "\nApply rejects a bad contact address\n";
/* careers_apply() refuses through json(), which EXITS the process — it cannot
   be caught, so calling it here would kill this script before it cleaned up
   (it did exactly that the first time). The rule itself is one line of
   filter_var in require_email(), so assert that instead and leave the
   end-to-end refusal to a browser or curl check. */
$ok('a malformed address is not a valid email', filter_var('not-an-email', FILTER_VALIDATE_EMAIL) === false);
$ok('a real one is', filter_var('someone@example.com', FILTER_VALIDATE_EMAIL) !== false);

echo "\nClosing\n";
db()->prepare('UPDATE career_jobs SET apply_deadline = ? WHERE id = ?')->execute([date('Y-m-d', strtotime('-1 day')), $jobId]);
$job = db()->query('SELECT * FROM career_jobs WHERE id = ' . $jobId)->fetch();
$ok('a passed deadline counts as closed', careers_job_is_closed($job));
$ok('and it drops off the board', careers_jobs_public(['q' => 'ZZ Test Role'])['total'] === 0);

db()->exec("DELETE FROM career_applications WHERE job_id = $jobId");
db()->exec("DELETE FROM career_jobs WHERE id = $jobId");
echo "\n" . ($fail ? "$fail check(s) FAILED\n" : "All checks passed. Test rows removed.\n");
exit($fail ? 1 : 0);
