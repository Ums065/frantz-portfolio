<?php
declare(strict_types=1);

/**
 * CLI sweep: once the submission deadline has passed, auto-release each school's
 * top-3 (by internal rank) to the judges if they never pressed the button.
 * Idempotent via the per-school atomic claim in new_school_release_top3().
 *
 * Optional — the same sweep also runs lazily on the judge queue / admin summary
 * reads (ns_auto_release_due()). Wire this to Windows Task Scheduler / cron for a
 * guaranteed run even with no traffic, e.g. every 15 min:
 *   php C:\wamp64\www\frantz-portfolio\api\ns_release_worker.php
 */

if (PHP_SAPI !== 'cli' && PHP_SAPI !== 'phpdbg') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/config.php';
require __DIR__ . '/lib.php';

ns_auto_release_due();

if (PHP_SAPI === 'cli') {
    echo json_encode(['ok' => true, 'ran_at' => date('c')], JSON_UNESCAPED_SLASHES) . PHP_EOL;
}
