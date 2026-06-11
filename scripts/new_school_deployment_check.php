<?php

declare(strict_types=1);

require_once __DIR__ . '/../api/config.php';
require_once __DIR__ . '/../api/lib.php';

$pdo = db();

$fail = static function (string $message): void {
    fwrite(STDERR, $message . PHP_EOL);
    exit(1);
};

$assert = static function (bool $condition, string $message) use ($fail): void {
    if (!$condition) {
        $fail($message);
    }
};

$tableExists = static function (PDO $pdo, string $table) use ($assert): void {
    $stmt = $pdo->prepare(
        'SELECT COUNT(*)
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?'
    );
    $stmt->execute([$table]);
    $assert((int) $stmt->fetchColumn() > 0, 'Missing required table: ' . $table);
};

$columnExists = static function (PDO $pdo, string $table, string $column) use ($assert): void {
    $stmt = $pdo->prepare(
        'SELECT COLUMN_TYPE
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
           AND COLUMN_NAME = ?
         LIMIT 1'
    );
    $stmt->execute([$table, $column]);
    $value = $stmt->fetchColumn();
    $assert($value !== false, 'Missing required column: ' . $table . '.' . $column);
};

foreach ([
    'new_school_schools',
    'new_school_teachers',
    'new_school_students',
    'new_school_parents',
    'new_school_approvals',
    'new_school_business_interviews',
    'new_school_submissions',
    'new_school_winners',
    'new_school_notifications',
] as $table) {
    $tableExists($pdo, $table);
}

foreach ([
    ['new_school_students', 'overall_status'],
    ['new_school_students', 'submission_status'],
    ['new_school_students', 'qr_token'],
    ['new_school_students', 'participant_id'],
    ['new_school_parents', 'consented_at'],
    ['new_school_parents', 'approved_at'],
    ['new_school_approvals', 'recorded_at'],
    ['new_school_submissions', 'reviewed_by_user_id'],
    ['new_school_submissions', 'reviewed_at'],
    ['new_school_notifications', 'is_read'],
    ['new_school_notifications', 'read_at'],
] as [$table, $column]) {
    $columnExists($pdo, $table, $column);
}

$distIndex = __DIR__ . '/../frontend/dist/index.html';
$assert(is_file($distIndex), 'Missing frontend build artifact: frontend/dist/index.html. Run npm run build from the frontend directory.');

$uploadDir = __DIR__ . '/../api/uploads/new_school';
if (!is_dir($uploadDir)) {
    if (!mkdir($uploadDir, 0775, true) && !is_dir($uploadDir)) {
        $fail('Unable to create upload directory: ' . $uploadDir);
    }
}

$uploadDir = realpath($uploadDir) ?: $uploadDir;

if (!is_writable($uploadDir)) {
    fwrite(STDERR, 'Warning: upload directory writability could not be confirmed from CLI. Verify the web server account can write to: ' . $uploadDir . PHP_EOL);
}

$appEnv = strtolower(trim((string) env('APP_ENV', 'local')));
$appDebug = filter_var(env('APP_DEBUG', 'false'), FILTER_VALIDATE_BOOLEAN);
$corsOrigin = trim((string) env('CORS_ORIGIN', ''));

if ($appEnv === 'production') {
    $assert($appDebug === false, 'APP_DEBUG must be false in production.');
    $assert($corsOrigin !== '', 'CORS_ORIGIN must be set in production.');
    $assert(trim((string) env('MAIL_HOST', '')) !== '', 'MAIL_HOST must be set in production.');
    $assert(trim((string) env('MAIL_USERNAME', '')) !== '', 'MAIL_USERNAME must be set in production.');
    $assert(trim((string) env('MAIL_PASSWORD', '')) !== '', 'MAIL_PASSWORD must be set in production.');
    $assert(trim((string) env('MAIL_FROM_ADDRESS', '')) !== '', 'MAIL_FROM_ADDRESS must be set in production.');
}

echo json_encode([
    'status' => 'ready',
    'app_env' => $appEnv,
    'app_debug' => $appDebug,
    'cors_origin' => $corsOrigin !== '' ? $corsOrigin : null,
    'build_artifact' => $distIndex,
    'upload_dir' => $uploadDir,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . PHP_EOL;
