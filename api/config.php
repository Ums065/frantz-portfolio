<?php
/* ============================================================
   FrantzCoutard.com — API config (DB + session + CORS)
   Configuration is read from the .env file via env.php.
   ============================================================ */

declare(strict_types=1);

require __DIR__ . '/env.php';
load_env(__DIR__ . '/.env');

$isCli = PHP_SAPI === 'cli';

// ---- Session ----
if (!$isCli) {
    session_set_cookie_params([
        'httponly' => true,
        'samesite' => 'Lax',
        'secure'   => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
    ]);
    session_name(env('SESSION_NAME', 'FC_SESSION'));
    session_start();
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
}

// ---- CORS ----
// Only allow an explicit configured origin when cross-origin credentials are needed.
if (!$isCli) {
    $configuredOrigin = env('CORS_ORIGIN', '');
    $requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($configuredOrigin !== '' && $requestOrigin === $configuredOrigin) {
        header('Access-Control-Allow-Origin: ' . $configuredOrigin);
        header('Access-Control-Allow-Credentials: true');
    }
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-Requested-With, X-CSRF-Token');
    header('Content-Type: application/json; charset=utf-8');

    // Pre-flight
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

/** True when APP_DEBUG is enabled (controls error detail in responses). */
function app_debug(): bool
{
    return filter_var(env('APP_DEBUG', 'false'), FILTER_VALIDATE_BOOLEAN);
}

// ---- PDO connection ----
function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $dsn = sprintf(
            'mysql:host=%s;port=%s;dbname=%s;charset=%s',
            env('DB_HOST', '127.0.0.1'),
            env('DB_PORT', '3306'),
            env('DB_NAME', 'frantz_portfolio'),
            env('DB_CHARSET', 'utf8mb4')
        );
        try {
            $pdo = new PDO($dsn, env('DB_USER', 'root'), env('DB_PASS', ''), [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]);
        } catch (PDOException $e) {
            $payload = ['error' => 'Database connection failed'];
            if (app_debug()) {
                $payload['detail'] = $e->getMessage();
            }
            json($payload, 500);
        }
    }
    return $pdo;
}
