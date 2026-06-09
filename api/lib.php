<?php
/* ============================================================
   Helper functions
   ============================================================ */

declare(strict_types=1);

/** Send a JSON response and stop. */
function json($data, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** Read JSON (or form) body as an associative array. */
function body(): array
{
    $raw = file_get_contents('php://input') ?: '';
    $json = json_decode($raw, true);
    if (is_array($json)) {
        return $json;
    }
    return $_POST ?: [];
}

/** Trim + return a string field, or '' if missing. */
function field(array $src, string $key): string
{
    return isset($src[$key]) ? trim((string) $src[$key]) : '';
}

/** Validate an email or fail with 422. */
function require_email(string $email): string
{
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        json(['error' => 'A valid email is required.'], 422);
    }
    return strtolower($email);
}

/** Currently logged-in user array, or null. */
function current_user(): ?array
{
    if (empty($_SESSION['uid'])) {
        return null;
    }
    $stmt = db()->prepare('SELECT id, full_name, email, role, email_verified_at, created_at FROM users WHERE id = ?');
    $stmt->execute([$_SESSION['uid']]);
    $u = $stmt->fetch();
    return $u ?: null;
}

/** Require a logged-in user (any role) or fail 401. */
function require_login(): array
{
    $u = current_user();
    if (!$u) {
        json(['error' => 'Authentication required.'], 401);
    }
    return $u;
}

/** Require an admin-level user or fail 403. */
function require_admin(): array
{
    $u = require_login();
    if (!in_array($u['role'], ['admin', 'super_admin', 'editor'], true)) {
        json(['error' => 'Admin access required.'], 403);
    }
    return $u;
}

function csrf_token(): string
{
    return (string) ($_SESSION['csrf_token'] ?? '');
}

function require_csrf(): void
{
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if (in_array($method, ['GET', 'HEAD', 'OPTIONS'], true)) {
        return;
    }

    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if ($token === '' || !hash_equals(csrf_token(), $token)) {
        json(['error' => 'Invalid CSRF token.'], 419);
    }
}

function login_user(array $user): array
{
    session_regenerate_id(true);
    $_SESSION['uid'] = (int) $user['id'];
    unset(
        $user['password_hash'],
        $user['email_verification_otp_hash'],
        $user['email_verification_otp_expires_at'],
        $user['email_verification_otp_sent_at'],
        $user['email_verification_otp_attempts']
    );
    return $user;
}

function logout_user(): void
{
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], (bool) $params['secure'], (bool) $params['httponly']);
    }
    session_destroy();
}

function storefront_catalog(): array
{
    return [
        'hoodie-legacy' => ['name' => 'Founder Hoodie - Legacy Black', 'price' => 68.0],
        'hoodie-c2l' => ['name' => 'From Community to Legacy Hoodie', 'price' => 72.0],
        'tee-emblem' => ['name' => 'Premium Tee - FC Emblem', 'price' => 34.0],
        'tee-tech' => ['name' => 'Technology For Good Tee', 'price' => 32.0],
        'tee-vision' => ['name' => 'Visionary Tee', 'price' => 30.0],
        'cap-gold' => ['name' => 'Signature Cap - Gold FC', 'price' => 28.0],
        'cap-builder' => ['name' => 'Community Builder Cap', 'price' => 26.0],
        'book-nts' => ['name' => 'From Nothing to Something - Hardcover', 'price' => 24.0],
        'book-blueprint' => ['name' => 'The Legacy Blueprint - eBook', 'price' => 14.0],
        'pin-ltd' => ['name' => 'Limited Edition FC Lapel Pin', 'price' => 18.0],
        'print-signed' => ['name' => 'Signed Founder\'s Print', 'price' => 48.0],
    ];
}

function storefront_inventory_defaults(): array
{
    return [
        'hoodie-legacy'   => ['stock' => 24, 'threshold' => 5],
        'hoodie-c2l'      => ['stock' => 18, 'threshold' => 4],
        'tee-emblem'      => ['stock' => 48, 'threshold' => 8],
        'tee-tech'        => ['stock' => 44, 'threshold' => 8],
        'tee-vision'      => ['stock' => 36, 'threshold' => 6],
        'cap-gold'        => ['stock' => 40, 'threshold' => 6],
        'cap-builder'     => ['stock' => 32, 'threshold' => 5],
        'book-nts'        => ['stock' => 64, 'threshold' => 10],
        'book-blueprint'   => ['stock' => 96, 'threshold' => 12],
        'pin-ltd'         => ['stock' => 70, 'threshold' => 10],
        'print-signed'    => ['stock' => 16, 'threshold' => 4],
    ];
}

function inventory_status_label(int $stock, int $threshold): string
{
    if ($stock <= 0) {
        return 'out';
    }
    if ($stock <= $threshold) {
        return 'low';
    }
    return 'in';
}

function user_access_rank(?array $user): int
{
    if (!$user) {
        return 0;
    }
    if (in_array((string) $user['role'], ['vip', 'editor', 'admin', 'super_admin'], true)) {
        return 2;
    }
    return 1;
}

function community_can_view(string $audience, ?array $user): bool
{
    $rank = user_access_rank($user);
    return match ($audience) {
        'public' => true,
        'member' => $rank >= 1,
        'vip'    => $rank >= 2,
        default  => false,
    };
}

function event_confirmation_code(): string
{
    return 'EV-' . str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
}

function normalized_order_items(array $items): array
{
    $catalog = storefront_catalog();
    $normalized = [];

    foreach ($items as $item) {
        if (!is_array($item)) {
            continue;
        }
        $id = trim((string) ($item['id'] ?? ''));
        $qty = (int) ($item['qty'] ?? 0);
        $size = trim((string) ($item['size'] ?? ''));

        if ($id === '' || !isset($catalog[$id]) || $qty <= 0) {
            continue;
        }

        $normalized[] = [
            'id' => $id,
            'name' => $catalog[$id]['name'],
            'size' => $size !== '' ? $size : 'Default',
            'qty' => $qty,
            'price' => $catalog[$id]['price'],
        ];
    }

    return $normalized;
}

function calculate_order_totals(array $items, string $promoCode = ''): array
{
    $subtotal = 0.0;
    foreach ($items as $item) {
        $subtotal += ((float) $item['price']) * ((int) $item['qty']);
    }

    $promo = strtoupper(trim($promoCode));
    $discountRate = match ($promo) {
        'LEGACY10' => 0.10,
        'COMMUNITY' => 0.15,
        default => 0.0,
    };

    $discount = round($subtotal * $discountRate, 2);
    $shipping = ($subtotal >= 75 || $subtotal <= 0) ? 0.0 : 6.5;
    $tax = round(($subtotal - $discount) * 0.0875, 2);
    $total = round($subtotal - $discount + $shipping + $tax, 2);

    return [
        'subtotal' => round($subtotal, 2),
        'discount' => $discount,
        'shipping' => $shipping,
        'tax' => $tax,
        'total' => $total,
        'promo_code' => $promo,
    ];
}

function mail_timeout_seconds(): int
{
    return max(1, (int) env('MAIL_TIMEOUT_SECONDS', '8'));
}

function mail_from_address(): string
{
    $from = trim((string) env('MAIL_FROM_ADDRESS', ''));
    if ($from !== '') {
        return $from;
    }

    $legacy = trim((string) env('MAIL_FROM', ''));
    if ($legacy !== '') {
        return $legacy;
    }

    $username = trim((string) env('MAIL_USERNAME', ''));
    return $username !== '' ? $username : 'no-reply@frantzcoutard.com';
}

function mail_from_name(): string
{
    $name = trim((string) env('MAIL_FROM_NAME', ''));
    if ($name !== '') {
        return $name;
    }

    return 'FrantzCoutard';
}

function mail_allow_php_fallback(): bool
{
    return filter_var(env('MAIL_ALLOW_PHP_FALLBACK', 'false'), FILTER_VALIDATE_BOOLEAN);
}

function mail_verify_peer(): bool
{
    return filter_var(env('MAIL_VERIFY_PEER', 'false'), FILTER_VALIDATE_BOOLEAN);
}

function mail_smtp_configured(): bool
{
    return trim((string) env('MAIL_HOST', '')) !== ''
        && trim((string) env('MAIL_USERNAME', '')) !== ''
        && (string) env('MAIL_PASSWORD', '') !== '';
}

function mail_normalize_password(string $password): string
{
    return preg_replace('/\s+/', '', trim($password)) ?? trim($password);
}

function mail_smtp_crypto_method(): int
{
    $method = 0;
    foreach ([
        'STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT',
        'STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT',
        'STREAM_CRYPTO_METHOD_TLS_CLIENT',
    ] as $const) {
        if (defined($const)) {
            $method |= constant($const);
        }
    }

    return $method !== 0 ? $method : STREAM_CRYPTO_METHOD_TLS_CLIENT;
}

function mail_smtp_candidates(string $host, int $port, string $encryption): array
{
    $host = trim($host);
    $encryption = strtolower(trim($encryption));
    $candidates = [];

    if ($host !== '' && $port > 0) {
        $candidates[] = [$host, $port, $encryption];
    }

    if (str_contains(strtolower($host), 'gmail.com')) {
        if ($port === 587 && $encryption === 'tls') {
            $candidates[] = [$host, 465, 'ssl'];
        } elseif ($port === 465 && $encryption === 'ssl') {
            $candidates[] = [$host, 587, 'tls'];
        }
    }

    return array_values(array_unique($candidates, SORT_REGULAR));
}

function mail_smtp_log_failure(string $stage, string $detail): void
{
    error_log('[mail][' . $stage . '] ' . $detail);
}

function mail_encode_header(string $value): string
{
    $value = trim($value);
    if ($value === '') {
        return '';
    }

    if (function_exists('mb_encode_mimeheader')) {
        $encoded = mb_encode_mimeheader($value, 'UTF-8', 'B', "\r\n");
        if (is_string($encoded) && $encoded !== '') {
            return $encoded;
        }
    }

    return $value;
}

function mail_prepare_body(string $bodyText): string
{
    $normalized = str_replace(["\r\n", "\r"], "\n", $bodyText);
    $lines = explode("\n", $normalized);
    foreach ($lines as &$line) {
        if ($line !== '' && isset($line[0]) && $line[0] === '.') {
            $line = '.' . $line;
        }
    }
    unset($line);

    return implode("\r\n", $lines);
}

function mail_smtp_read_response($socket): array
{
    $lines = [];
    $code = null;

    while (!feof($socket)) {
        $line = fgets($socket, 512);
        if ($line === false) {
            break;
        }

        $lines[] = rtrim($line, "\r\n");
        if (preg_match('/^(\d{3})([ -])/', $line, $matches)) {
            $code = (int) $matches[1];
            if ($matches[2] === ' ') {
                break;
            }
        }
    }

    return ['code' => $code, 'lines' => $lines];
}

function mail_smtp_expect($socket, array $expectedCodes, string $stage): void
{
    $response = mail_smtp_read_response($socket);
    if (!in_array($response['code'], $expectedCodes, true)) {
        throw new RuntimeException($stage . ' failed: ' . implode(' | ', $response['lines']));
    }
}

function mail_smtp_send($socket, string $command, array $expectedCodes, string $stage): void
{
    if (fwrite($socket, $command . "\r\n") === false) {
        throw new RuntimeException($stage . ' failed: unable to write command.');
    }

    mail_smtp_expect($socket, $expectedCodes, $stage);
}

function send_mail_message(string $to, string $subject, string $bodyText): bool
{
    $to = trim($to);
    if ($to === '') {
        return false;
    }

    $subject = trim($subject);
    $bodyText = rtrim($bodyText);
    $fromAddress = mail_from_address();
    $fromName = mail_from_name();
    $smtpErrors = [];

    try {
        if (mail_smtp_configured()) {
            $host = trim((string) env('MAIL_HOST', ''));
            $port = (int) env('MAIL_PORT', '587');
            $username = trim((string) env('MAIL_USERNAME', ''));
            $password = mail_normalize_password((string) env('MAIL_PASSWORD', ''));
            $encryption = strtolower(trim((string) env('MAIL_ENCRYPTION', 'tls')));
            $timeout = mail_timeout_seconds();
            $headers = [
                'From: ' . mail_encode_header($fromName) . ' <' . $fromAddress . '>',
                'To: <' . $to . '>',
                'Subject: ' . mail_encode_header($subject),
                'MIME-Version: 1.0',
                'Content-Type: text/plain; charset=UTF-8',
                'Content-Transfer-Encoding: 8bit',
            ];
            $messageBody = implode("\r\n", $headers) . "\r\n\r\n" . mail_prepare_body($bodyText);

            foreach (mail_smtp_candidates($host, $port, $encryption) as [$candidateHost, $candidatePort, $candidateEncryption]) {
                $transport = ($candidateEncryption === 'ssl' && $candidatePort > 0)
                    ? sprintf('ssl://%s:%d', $candidateHost, $candidatePort)
                    : sprintf('tcp://%s:%d', $candidateHost, $candidatePort);
                $context = stream_context_create([
                    'ssl' => [
                        'verify_peer' => mail_verify_peer(),
                        'verify_peer_name' => mail_verify_peer(),
                        'allow_self_signed' => !mail_verify_peer(),
                        'SNI_enabled' => true,
                        'peer_name' => $candidateHost,
                    ],
                ]);
                $socket = @stream_socket_client($transport, $errno, $errstr, $timeout, STREAM_CLIENT_CONNECT, $context);
                if (!$socket) {
                    $reason = sprintf('%s:%d (%s) connection failed: %s', $candidateHost, $candidatePort, $candidateEncryption, $errstr !== '' ? $errstr : 'unknown error');
                    $smtpErrors[] = $reason;
                    mail_smtp_log_failure('smtp', $reason);
                    continue;
                }

                try {
                    stream_set_timeout($socket, $timeout);
                    $helo = $_SERVER['SERVER_NAME'] ?? 'localhost';
                    mail_smtp_expect($socket, [220], 'SMTP greeting');
                    mail_smtp_send($socket, 'EHLO ' . $helo, [250], 'SMTP EHLO');

                    if ($candidateEncryption !== 'ssl' && $candidateEncryption !== 'none') {
                        mail_smtp_send($socket, 'STARTTLS', [220], 'SMTP STARTTLS');
                        if (!stream_socket_enable_crypto($socket, true, mail_smtp_crypto_method())) {
                            throw new RuntimeException('SMTP TLS negotiation failed.');
                        }
                        mail_smtp_send($socket, 'EHLO ' . $helo, [250], 'SMTP EHLO after STARTTLS');
                    }

                    if ($username !== '') {
                        mail_smtp_send($socket, 'AUTH LOGIN', [334], 'SMTP AUTH LOGIN');
                        mail_smtp_send($socket, base64_encode($username), [334], 'SMTP AUTH USERNAME');
                        mail_smtp_send($socket, base64_encode($password), [235], 'SMTP AUTH PASSWORD');
                    }

                    mail_smtp_send($socket, 'MAIL FROM:<' . $fromAddress . '>', [250], 'SMTP MAIL FROM');
                    mail_smtp_send($socket, 'RCPT TO:<' . $to . '>', [250, 251], 'SMTP RCPT TO');
                    mail_smtp_send($socket, 'DATA', [354], 'SMTP DATA');

                    $message = $messageBody . "\r\n.";
                    if (fwrite($socket, $message . "\r\n") === false) {
                        throw new RuntimeException('SMTP message write failed.');
                    }
                    mail_smtp_expect($socket, [250], 'SMTP message delivery');
                    mail_smtp_send($socket, 'QUIT', [221], 'SMTP QUIT');
                    return true;
                } catch (Throwable $e) {
                    $reason = sprintf('%s:%d (%s) %s', $candidateHost, $candidatePort, $candidateEncryption, $e->getMessage());
                    $smtpErrors[] = $reason;
                    mail_smtp_log_failure('smtp', $reason);
                } finally {
                    fclose($socket);
                }
            }
        }

        if (mail_allow_php_fallback()) {
            $headers = 'From: ' . mail_encode_header($fromName) . ' <' . $fromAddress . ">\r\n"
                . 'Reply-To: ' . $fromAddress . "\r\n"
                . 'MIME-Version: 1.0' . "\r\n"
                . 'Content-Type: text/plain; charset=UTF-8';
            return @mail($to, $subject, $bodyText, $headers);
        }

        if (!empty($smtpErrors)) {
            mail_smtp_log_failure('smtp-all', implode(' || ', $smtpErrors));
        }

        return false;
    } catch (\Throwable $e) {
        mail_smtp_log_failure('mail', $e->getMessage());
        return false;
    }
}

function generate_verification_otp(): string
{
    return str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
}

function verification_code_body(string $name, string $otp): string
{
    $safeName = trim($name) !== '' ? trim($name) : 'there';
    return implode("\n", [
        'Hi ' . $safeName . ',',
        '',
        'Your email verification code is: ' . $otp,
        '',
        'This code expires in 10 minutes.',
        'If you did not request this, you can ignore this message.',
        '',
        'Thanks,',
        mail_from_name(),
    ]);
}

function send_verification_code_mail(string $email, string $name, string $otp): bool
{
    return send_mail_message($email, 'Verify your email address', verification_code_body($name, $otp));
}

function issue_email_verification_otp(int $userId, string $email, string $name): bool
{
    $otp = generate_verification_otp();
    $expiry = date('Y-m-d H:i:s', time() + 600);
    $stmt = db()->prepare(
        'UPDATE users
         SET email_verification_otp_hash = ?,
             email_verification_otp_expires_at = ?,
             email_verification_otp_sent_at = NOW(),
             email_verification_otp_attempts = 0
         WHERE id = ?'
    );
    $stmt->execute([password_hash($otp, PASSWORD_DEFAULT), $expiry, $userId]);

    return send_verification_code_mail($email, $name, $otp);
}

/**
 * Fire-and-forget email notification to the team.
 * No-op unless MAIL_ENABLED=true and NOTIFY_EMAIL is set in .env.
 * Always non-fatal — a mail failure must never break the API request.
 */
function notify(string $subject, string $bodyText): void
{
    if (!filter_var(env('MAIL_ENABLED', 'false'), FILTER_VALIDATE_BOOLEAN)) {
        return;
    }
    $to = trim((string) env('NOTIFY_EMAIL', ''));
    if ($to === '') {
        return;
    }
    $from = env('MAIL_FROM', 'no-reply@frantzcoutard.com');
    $headers = 'From: ' . $from . "\r\n"
        . 'Reply-To: ' . $from . "\r\n"
        . 'Content-Type: text/plain; charset=utf-8';
    try {
        @mail($to, $subject, $bodyText, $headers);
    } catch (\Throwable $e) {
        // swallow — notifications are best-effort
    }
}
