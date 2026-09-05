<?php
/* End-to-end check of the careers board against the real database.
   Run with MySQL up:  php scripts/careers_test.php
   It creates a throwaway admin post, applies to it as a test user, exercises
   the age gate, then deletes everything it made. */
require __DIR__ . '/../api/config.php';
require __DIR__ . '/../api/lib.php';

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

echo "\nClosing\n";
db()->prepare('UPDATE career_jobs SET apply_deadline = ? WHERE id = ?')->execute([date('Y-m-d', strtotime('-1 day')), $jobId]);
$job = db()->query('SELECT * FROM career_jobs WHERE id = ' . $jobId)->fetch();
$ok('a passed deadline counts as closed', careers_job_is_closed($job));
$ok('and it drops off the board', careers_jobs_public(['q' => 'ZZ Test Role'])['total'] === 0);

db()->exec("DELETE FROM career_applications WHERE job_id = $jobId");
db()->exec("DELETE FROM career_jobs WHERE id = $jobId");
echo "\n" . ($fail ? "$fail check(s) FAILED\n" : "All checks passed. Test rows removed.\n");
exit($fail ? 1 : 0);
