<?php
declare(strict_types=1);

require __DIR__ . '/env.php';
load_env(__DIR__ . '/.env');
require __DIR__ . '/lib.php';

if (strtolower((string) env('APP_ENV', 'local')) === 'production') {
    http_response_code(404);
    exit;
}

if (PHP_SAPI !== 'cli' && PHP_SAPI !== 'phpdbg') {
    session_set_cookie_params([
        'httponly' => true,
        'samesite' => 'Lax',
        'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
    ]);
    session_name(env('SESSION_NAME', 'FC_SESSION'));
    session_start();
}

function gmail_oauth_escape(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}

function gmail_oauth_current_url(): string
{
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = (string) ($_SERVER['HTTP_HOST'] ?? 'localhost');
    $path = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/api/gmail-oauth-helper.php'), PHP_URL_PATH);
    return $scheme . '://' . $host . $path;
}

function gmail_oauth_target_email(): string
{
    $configured = trim((string) env('MAIL_FROM_ADDRESS', ''));
    if ($configured !== '' && str_contains(strtolower($configured), '@gmail.com')) {
        return $configured;
    }

    return 'umang.developer05@gmail.com';
}

function gmail_oauth_authorize_url(string $redirectUri, string $state): string
{
    $clientId = mail_google_client_id();
    $loginHint = gmail_oauth_target_email();
    return 'https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query([
        'client_id' => $clientId,
        'redirect_uri' => $redirectUri,
        'response_type' => 'code',
        'scope' => 'https://www.googleapis.com/auth/gmail.send',
        'access_type' => 'offline',
        'prompt' => 'consent',
        'include_granted_scopes' => 'true',
        'state' => $state,
        'login_hint' => $loginHint !== '' ? $loginHint : null,
    ], '', '&', PHP_QUERY_RFC3986);
}

function gmail_oauth_exchange_code(string $code, string $redirectUri): array
{
    $response = mail_http_request(
        'https://oauth2.googleapis.com/token',
        'POST',
        http_build_query([
            'client_id' => mail_google_client_id(),
            'client_secret' => mail_google_client_secret(),
            'code' => $code,
            'grant_type' => 'authorization_code',
            'redirect_uri' => $redirectUri,
        ], '', '&', PHP_QUERY_RFC3986),
        [
            'Accept: application/json',
            'Content-Type: application/x-www-form-urlencoded',
        ]
    );

    if (!$response['ok']) {
        $detail = $response['error'] !== '' ? $response['error'] : $response['body'];
        return [
            'ok' => false,
            'error' => $detail !== '' ? $detail : 'Token exchange failed.',
        ];
    }

    $data = json_decode($response['body'], true);
    if (!is_array($data)) {
        return [
            'ok' => false,
            'error' => 'Google returned an invalid token response.',
        ];
    }

    return [
        'ok' => true,
        'data' => $data,
    ];
}

function gmail_oauth_render_page(string $title, string $bodyHtml): void
{
    header('Content-Type: text/html; charset=UTF-8');
    echo '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
    echo '<title>' . gmail_oauth_escape($title) . '</title>';
    echo '<style>
        :root{color-scheme:light}
        body{font-family:Arial,Helvetica,sans-serif;margin:0;background:#f5f7fb;color:#111827}
        .wrap{max-width:920px;margin:0 auto;padding:32px 20px 48px}
        .card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:24px;box-shadow:0 10px 24px rgba(15,23,42,.06)}
        h1,h2{margin:0 0 12px}
        h1{font-size:28px}
        h2{font-size:20px;margin-top:24px}
        p,li{line-height:1.6}
        code,pre{font-family:Consolas,Monaco,monospace}
        pre{background:#0f172a;color:#e2e8f0;padding:16px;border-radius:12px;overflow:auto}
        .btn{display:inline-block;background:#2563eb;color:#fff;padding:12px 16px;border-radius:12px;text-decoration:none;font-weight:700}
        .btn:hover{background:#1d4ed8}
        .muted{color:#6b7280}
        .ok{color:#166534;font-weight:700}
        .warn{color:#b45309;font-weight:700}
        .err{color:#b91c1c;font-weight:700}
        .grid{display:grid;gap:16px}
        .box{border:1px solid #e5e7eb;border-radius:12px;padding:16px;background:#fafafa}
        input,textarea{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #cbd5e1;border-radius:10px;font:inherit}
        .small{font-size:13px}
        @media (max-width:640px){.wrap{padding:20px 14px 40px}.card{padding:18px}}
    </style></head><body><div class="wrap"><div class="card">';
    echo $bodyHtml;
    echo '</div></div></body></html>';
    exit;
}

$clientId = mail_google_client_id();
$clientSecret = mail_google_client_secret();
$redirectUri = gmail_oauth_current_url();

if ($clientId === '' || $clientSecret === '') {
    gmail_oauth_render_page('Gmail OAuth helper', '
        <h1>Gmail OAuth helper</h1>
        <p class="err">GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are missing in <code>api/.env</code>.</p>
        <div class="box">
            <p>Add these values first:</p>
            <pre>GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
MAIL_FROM_ADDRESS=umang.developer05@gmail.com</pre>
        </div>
        <p class="muted">Then reload this page and authorize again.</p>
    ');
}

if (isset($_GET['code'])) {
    $state = (string) ($_GET['state'] ?? '');
    $savedState = (string) ($_SESSION['gmail_oauth_state'] ?? '');
    if ($state === '' || $savedState === '' || !hash_equals($savedState, $state)) {
        gmail_oauth_render_page('Gmail OAuth helper', '
            <h1>Gmail OAuth helper</h1>
            <p class="err">State mismatch. Reload the helper page and start the authorization again.</p>
        ');
    }

    $exchange = gmail_oauth_exchange_code((string) $_GET['code'], $redirectUri);
    if (!$exchange['ok']) {
        gmail_oauth_render_page('Gmail OAuth helper', '
            <h1>Gmail OAuth helper</h1>
            <p class="err">Token exchange failed.</p>
            <div class="box"><pre>' . gmail_oauth_escape((string) $exchange['error']) . '</pre></div>
            <p class="muted">If Google did not return a refresh token, revoke the app from your Google Account access page and authorize again with <code>prompt=consent</code>.</p>
        ');
    }

    $data = $exchange['data'];
    $refreshToken = trim((string) ($data['refresh_token'] ?? ''));
    $accessToken = trim((string) ($data['access_token'] ?? ''));
    $scope = trim((string) ($data['scope'] ?? 'https://www.googleapis.com/auth/gmail.send'));
    $tokenType = trim((string) ($data['token_type'] ?? ''));
    $expiresIn = (int) ($data['expires_in'] ?? 0);

    if ($refreshToken !== '') {
        gmail_oauth_render_page('Gmail OAuth helper', '
            <h1 class="ok">Refresh token captured</h1>
            <p>Your Gmail API authorization succeeded. Put these values into <code>api/.env</code>.</p>
            <div class="box">
                <pre>MAIL_PROVIDER=gmail_api
MAIL_FROM_ADDRESS=' . gmail_oauth_escape(gmail_oauth_target_email()) . '
GOOGLE_CLIENT_ID=' . gmail_oauth_escape($clientId) . '
GOOGLE_CLIENT_SECRET=' . gmail_oauth_escape($clientSecret) . '
GOOGLE_REFRESH_TOKEN=' . gmail_oauth_escape($refreshToken) . '
MAIL_VERIFY_PEER=true</pre>
            </div>
            <p class="muted">Scope: <code>' . gmail_oauth_escape($scope) . '</code></p>
            <p class="muted">Token type: <code>' . gmail_oauth_escape($tokenType) . '</code>, expires in <code>' . (int) $expiresIn . '</code> seconds.</p>
            <p class="warn small">Keep the refresh token private. It is the long-lived credential that lets the server request new access tokens.</p>
        ');
    }

    gmail_oauth_render_page('Gmail OAuth helper', '
        <h1 class="warn">Google did not return a refresh token</h1>
        <p>The authorization worked, but Google returned only a short-lived access token.</p>
        <div class="box">
            <pre>access_token=' . gmail_oauth_escape($accessToken) . '
scope=' . gmail_oauth_escape($scope) . '</pre>
        </div>
        <p class="muted">This usually happens when the app was already authorized before. Revoke the app access in your Google Account, then come back here and authorize again.</p>
    ');
}

$_SESSION['gmail_oauth_state'] = bin2hex(random_bytes(16));
$authorizeUrl = gmail_oauth_authorize_url($redirectUri, (string) $_SESSION['gmail_oauth_state']);

gmail_oauth_render_page('Gmail OAuth helper', '
    <h1>Gmail OAuth helper</h1>
    <p>This page generates the Google consent link and captures the refresh token for Gmail API sending.</p>
    <div class="grid">
        <div class="box">
            <h2>1. Authorized redirect URI</h2>
            <p class="muted">Add this exact URL in Google Cloud Console as an authorized redirect URI:</p>
            <pre>' . gmail_oauth_escape($redirectUri) . '</pre>
        </div>
        <div class="box">
            <h2>2. Required scope</h2>
            <p><code>https://www.googleapis.com/auth/gmail.send</code></p>
            <p class="muted">The helper requests offline access and consent so Google can return a refresh token.</p>
        </div>
        <div class="box">
            <h2>3. Start OAuth</h2>
            <p><a class="btn" href="' . gmail_oauth_escape($authorizeUrl) . '">Authorize with Google</a></p>
            <p class="muted small">After approval, Google will redirect back to this page. If a refresh token is returned, the page will show the exact <code>.env</code> lines to paste.</p>
        </div>
        <div class="box">
            <h2>4. After you get the token</h2>
            <p>Paste the generated values into <code>api/.env</code> and keep <code>MAIL_PROVIDER=gmail_api</code> enabled if you want Gmail API to be the default transport.</p>
        </div>
    </div>
');
