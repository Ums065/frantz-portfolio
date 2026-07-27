<?php
declare(strict_types=1);

/**
 * Deploy-time database migration runner.
 *
 * You do NOT strictly need to run this — index.php calls db_auto_migrate() on the
 * first request after a deploy, which brings the schema up to date automatically.
 * This CLI script is a belt-and-suspenders option for deploy scripts / cron:
 *
 *   php C:\wamp64\www\frantz-portfolio\api\migrate.php
 *
 * It forces a full idempotent re-heal (every CREATE TABLE IF NOT EXISTS /
 * add-column guard) and stamps the current schema version.
 */

if (PHP_SAPI !== 'cli' && PHP_SAPI !== 'phpdbg') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/config.php';
require __DIR__ . '/lib.php';

// Force a full run even if the stored version already matches.
try { db()->exec("DELETE FROM app_meta WHERE meta_key = 'schema_version'"); } catch (Throwable $e) { /* table may not exist yet */ }

db_auto_migrate();

echo json_encode(['ok' => true, 'schema_version' => APP_SCHEMA_VERSION, 'ran_at' => date('c')], JSON_UNESCAPED_SLASHES) . PHP_EOL;
