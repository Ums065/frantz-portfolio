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
    fwrite(STDERR, 'Database connection failed: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}

$sqlPath = __DIR__ . '/../db/update.sql';
$sql = file_get_contents($sqlPath);
if ($sql === false) {
    fwrite(STDERR, 'Unable to read migration file: ' . $sqlPath . PHP_EOL);
    exit(1);
}

$sql = preg_replace('/\/\*.*?\*\//s', '', $sql) ?? $sql;
$sql = preg_replace('/^--.*$/m', '', $sql) ?? $sql;

$statements = preg_split('/;\s*(?:\r?\n)+/', $sql) ?: [];
$count = 0;

$columnExists = static function (PDO $pdo, string $table, string $column): bool {
    $stmt = $pdo->prepare(
        'SELECT 1
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
           AND COLUMN_NAME = ?
         LIMIT 1'
    );
    $stmt->execute([$table, $column]);
    return (bool) $stmt->fetchColumn();
};

foreach ($statements as $statement) {
    $statement = trim($statement);
    if ($statement === '' || strcasecmp($statement, 'USE frantz_portfolio') === 0) {
        continue;
    }

    if (preg_match('/^ALTER TABLE\s+`?([A-Za-z0-9_]+)`?\s+ADD COLUMN IF NOT EXISTS\s+`?([A-Za-z0-9_]+)`?\s+(.+)$/is', $statement, $matches)) {
        $table = $matches[1];
        $column = $matches[2];
        $definition = trim($matches[3]);

        if ($columnExists($pdo, $table, $column)) {
            continue;
        }

        $pdo->exec('ALTER TABLE ' . $table . ' ADD COLUMN ' . $column . ' ' . $definition);
        $count++;
        continue;
    }

    $pdo->exec($statement);
    $count++;
}

echo 'Applied master update statements: ' . $count . PHP_EOL;
