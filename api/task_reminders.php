<?php
declare(strict_types=1);

/**
 * CLI sweep: email each Fellow once a day about tasks that are past their due
 * date, and notify the admins how many are behind overall.
 *
 * Idempotent per day via fellow_tasks.overdue_notified_on, so running it more
 * than once will not spam anyone.
 *
 * Wire to cron / Windows Task Scheduler once a day, e.g. 08:00:
 *   php C:\wamp64\www\frantz-portfolio\api\task_reminders.php
 *
 * Note this only queues mail; api/mail_worker.php still has to run to deliver
 * it (see the deploy notes).
 */

if (PHP_SAPI !== 'cli' && PHP_SAPI !== 'phpdbg') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/config.php';
require __DIR__ . '/lib.php';

try {
    $r = fellow_task_overdue_digest();
    echo json_encode(['ok' => true, 'fellows_emailed' => $r['fellows'], 'overdue_tasks' => $r['tasks'], 'ran_at' => date('c')], JSON_UNESCAPED_SLASHES) . PHP_EOL;
} catch (Throwable $e) {
    fwrite(STDERR, 'task_reminders failed: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}
