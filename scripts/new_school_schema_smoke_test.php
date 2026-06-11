<?php

declare(strict_types=1);

require __DIR__ . '/../api/env.php';
load_env(__DIR__ . '/../api/.env');

$dsn = sprintf(
    'mysql:host=%s;port=%s;dbname=%s;charset=%s',
    env('DB_HOST', '127.0.0.1'),
    env('DB_PORT', '3306'),
    env('DB_NAME', 'frantz_portfolio'),
    env('DB_CHARSET', 'utf8mb4')
);

try {
    $pdo = new PDO($dsn, env('DB_USER', 'root'), env('DB_PASS', ''), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
} catch (Throwable $e) {
    fwrite(STDERR, "Database connection failed: " . $e->getMessage() . PHP_EOL);
    exit(1);
}

$assert = static function (bool $condition, string $message): void {
    if (!$condition) {
        fwrite(STDERR, $message . PHP_EOL);
        exit(1);
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
    $assert((int) $stmt->fetchColumn() > 0, "Missing required table: {$table}");
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
    $assert($value !== false, "Missing required column: {$table}.{$column}");
    if ($column === 'overall_status') {
        $type = (string) $value;
        $assert(str_contains($type, 'interviews_pending'), 'overall_status enum is missing interviews_pending.');
        $assert(str_contains($type, 'submission_submitted'), 'overall_status enum is missing submission_submitted.');
        $assert(str_contains($type, 'submission_complete'), 'overall_status enum is missing submission_complete.');
    }
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
    ['new_school_parents', 'consented_at'],
    ['new_school_approvals', 'recorded_at'],
    ['new_school_submissions', 'reviewed_by_user_id'],
    ['new_school_submissions', 'reviewed_at'],
    ['new_school_notifications', 'is_read'],
    ['new_school_notifications', 'read_at'],
] as [$table, $column]) {
    $columnExists($pdo, $table, $column);
}

echo 'new_school schema smoke test passed' . PHP_EOL;
