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
    $stmt = db()->prepare('SELECT id, full_name, email, role, created_at FROM users WHERE id = ?');
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
    unset($user['password_hash']);
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
