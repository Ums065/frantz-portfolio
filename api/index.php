<?php
/* ============================================================
   FrantzCoutard.com — API front controller / router
   Routes:
     POST   auth/register      POST auth/login    POST auth/logout
     POST   auth/verify-email  POST auth/resend-verification
     POST   auth/admin-login
     GET    auth/me
     GET    user/dashboard     PUT  user/profile
     GET    events             GET  posts         GET  awards
     POST   subscribe          POST request       POST contact
     GET    admin/submissions  (admin only)
     PUT    admin/request/{id} (admin only — update status)
   ============================================================ */

declare(strict_types=1);

require __DIR__ . '/config.php';
require __DIR__ . '/lib.php';
require __DIR__ . '/new_school_routes.php';

require_csrf();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$route  = trim((string) ($_GET['r'] ?? ''), '/');
$route  = preg_replace('#[^a-zA-Z0-9/_-]#', '', $route);
$key    = $method . ' ' . $route;

try {
    switch (true) {

        /* ---------------- AUTH ---------------- */
        // Temporary bypass: direct register/login is enabled and verification is disabled.
        case $key === 'POST auth/register': {
            rate_limit('auth_register', 12, 3600); // H2: cap sign-ups per IP
            $b    = body();
            $name = require_name_field(field($b, 'full_name') ?: field($b, 'name'), 'Full name', 3);
            $email = require_email(field($b, 'email'));
            $pass  = field($b, 'password');

            if ($name === '') json(['error' => 'Full name is required.'], 422);
            if (strlen($pass) < 6) json(['error' => 'Password must be at least 6 characters.'], 422);

            $pdo = db();
            $exists = $pdo->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
            $exists->execute([$email]);
            $existing = $exists->fetch();

            if ($existing && !empty($existing['email_verified_at'])) {
                json(['error' => 'An account with this email already exists.'], 409);
            }

            $pdo->beginTransaction();
            try {
                $passwordHash = password_hash($pass, PASSWORD_DEFAULT);
                // M-6: when verification is enforced, new accounts start UNVERIFIED and
                // must confirm their email before login (see the login handler). Default
                // (flag off) keeps the current auto-verify behavior — no change.
                $verifiedExpr = email_verification_required() ? 'NULL' : 'NOW()';

                if ($existing) {
                    $existingApproval = (string) ($existing['approval_status'] ?? 'pending');
                    $nextApproval = $existingApproval === 'approved' ? 'approved' : 'pending';
                    $update = $pdo->prepare(
                        'UPDATE users
                         SET full_name = ?,
                             password_hash = ?,
                             approval_status = ?,
                             approval_note = CASE WHEN ? = "approved" THEN approval_note ELSE NULL END,
                             approval_reviewed_by_user_id = CASE WHEN ? = "approved" THEN approval_reviewed_by_user_id ELSE NULL END,
                             approval_reviewed_at = CASE WHEN ? = "approved" THEN approval_reviewed_at ELSE NULL END,
                             email_verified_at = ' . $verifiedExpr . ',
                             email_verification_otp_hash = NULL,
                             email_verification_otp_expires_at = NULL,
                             email_verification_otp_sent_at = NULL,
                             email_verification_otp_attempts = 0
                         WHERE id = ?'
                    );
                    $update->execute([$name, $passwordHash, $nextApproval, $nextApproval, $nextApproval, $nextApproval, $existing['id']]);
                    $userId = (int) $existing['id'];
                } else {
                    $insert = $pdo->prepare(
                        'INSERT INTO users (
                            full_name,
                            email,
                            password_hash,
                            approval_status,
                            approval_note,
                            approval_reviewed_by_user_id,
                            approval_reviewed_at,
                            email_verified_at,
                            email_verification_otp_hash,
                            email_verification_otp_expires_at,
                            email_verification_otp_sent_at,
                            email_verification_otp_attempts
                         ) VALUES (?, ?, ?, "pending", NULL, NULL, NULL, ' . $verifiedExpr . ', NULL, NULL, NULL, 0)'
                    );
                    $insert->execute([$name, $email, $passwordHash]);
                    $userId = (int) $pdo->lastInsertId();
                }

                $fresh = $pdo->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
                $fresh->execute([$userId]);
                $registeredUser = $fresh->fetch();
                if (!$registeredUser) {
                    throw new RuntimeException('Unable to load registered user.');
                }

                $pdo->commit();
                attribute_referral($userId, field($b, 'ref')); // partner-referral attribution
                $registeredUser = login_user($registeredUser);
                $approvalMessage = (string) ($registeredUser['approval_status'] ?? 'pending') === 'approved'
                    ? 'Account created successfully.'
                    : 'Account submitted for admin approval.';

                json([
                    'user' => $registeredUser,
                    'message' => $approvalMessage,
                    'csrfToken' => csrf_token(),
                ], 201);
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                json([
                    'error' => app_debug() ? $e->getMessage() : 'Unable to create the account right now.',
                ], 500);
            }
        }

        case $key === 'POST auth/login': {
            rate_limit('auth_login', 12, 900); // H2: throttle password brute-force per IP
            $b     = body();
            $email = require_email(field($b, 'email'));
            $pass  = field($b, 'password');

            $pdo = db();
            $stmt = $pdo->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
            $stmt->execute([$email]);
            $u = $stmt->fetch();

            if (!$u || !password_verify($pass, $u['password_hash'])) {
                json(['error' => 'Invalid email or password.'], 401);
            }
            if ((string) ($u['approval_status'] ?? 'pending') === 'rejected') {
                json(['error' => 'This account has been rejected. Please contact the administrator.'], 403);
            }
            // M-6: block sign-in of unverified accounts when verification is enforced.
            if (email_verification_required() && empty($u['email_verified_at'])) {
                json(['error' => 'Please verify your email address before signing in.'], 403);
            }

            $pdo->beginTransaction();
            try {
                $markVerified = $pdo->prepare(
                    'UPDATE users
                     SET email_verified_at = COALESCE(email_verified_at, NOW()),
                         email_verification_otp_hash = NULL,
                         email_verification_otp_expires_at = NULL,
                         email_verification_otp_sent_at = NULL,
                         email_verification_otp_attempts = 0
                     WHERE id = ?'
                );
                $markVerified->execute([$u['id']]);

                $fresh = $pdo->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
                $fresh->execute([$u['id']]);
                $activeUser = $fresh->fetch();
                if (!$activeUser) {
                    throw new RuntimeException('Unable to load authenticated user.');
                }

                $pdo->commit();
                $activeUser = login_user($activeUser);
                json(['user' => $activeUser, 'message' => 'Welcome back.', 'csrfToken' => csrf_token()]);
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                json([
                    'error' => app_debug() ? $e->getMessage() : 'Unable to log in right now.',
                ], 500);
            }
        }

        case $key === 'POST auth/forgot-password': {
            // M-7: throttle + return an identical generic response whether or not the
            // email exists, so the endpoint can't be used to enumerate registered accounts.
            rate_limit('forgot_password', 5, 900);
            $email = require_email(field(body(), 'email'));
            $generic = ['message' => 'If an account exists for that email, we\'ve sent a password reset link. Please check your inbox.'];

            $stmt = db()->prepare('SELECT id, full_name, email FROM users WHERE email = ? LIMIT 1');
            $stmt->execute([$email]);
            $u = $stmt->fetch();

            if ($u) {
                try {
                    create_password_reset($u);
                } catch (Throwable $e) {
                    // Log the real cause server-side; still return the generic message so
                    // failures don't reveal whether the account exists.
                    error_log('[forgot-password] ' . $e->getMessage());
                }
            }

            json($generic);
        }

        case $key === 'GET auth/reset-password/verify': {
            // Non-consuming check so the reset page can show a form or an
            // "invalid / already used" message on load.
            $token = trim((string) ($_GET['token'] ?? ''));
            json(['valid' => password_reset_token_valid($token)]);
        }

        case $key === 'POST auth/reset-password': {
            rate_limit('auth_reset', 10, 900); // H2: throttle reset-token guessing
            $b = body();
            $token = trim((string) field($b, 'token'));
            $pass = (string) field($b, 'password');

            if ($token === '') {
                json(['error' => 'Reset token is required.'], 422);
            }
            if (strlen($pass) < 6) {
                json(['error' => 'Password must be at least 6 characters.'], 422);
            }

            $u = consume_password_reset($token);
            if (!$u) {
                json(['error' => 'This reset link is invalid or has expired. Please request a new one.'], 400);
            }

            $update = db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
            $update->execute([password_hash($pass, PASSWORD_DEFAULT), (int) $u['id']]);

            json(['message' => 'Your password has been reset. You can now sign in with your new password.']);
        }

        case $key === 'POST auth/verify-email': {
            json([
                'error' => 'Email verification is temporarily disabled. Please register or log in directly.',
            ], 410);
        }

        case $key === 'POST auth/resend-verification': {
            json([
                'error' => 'Email verification is temporarily disabled. Please register or log in directly.',
            ], 410);
        }

        case $key === 'POST auth/admin-login': {
            rate_limit('admin_login', 8, 900); // H2: strict throttle on the admin login
            $b     = body();
            $email = require_email(field($b, 'email'));
            $pass  = field($b, 'password');

            $stmt = db()->prepare('SELECT * FROM users WHERE email = ?');
            $stmt->execute([$email]);
            $u = $stmt->fetch();

            if (!$u || !password_verify($pass, $u['password_hash'])) {
                json(['error' => 'Invalid email or password.'], 401);
            }
            if (!in_array($u['role'], ['admin', 'super_admin', 'editor'], true)) {
                json(['error' => 'Admin access required.'], 403);
            }

            $u = login_user($u);
            json(['user' => $u, 'message' => 'Welcome back.', 'csrfToken' => csrf_token()]);
        }

        case $key === 'POST auth/logout': {
            logout_user();
            json(['message' => 'Logged out.']);
        }

        case $key === 'GET auth/me': {
            json([
                'user' => current_user(),
                'csrfToken' => csrf_token(),
                'impersonating' => impersonation_active(),
                'impersonator' => impersonator_user(),
            ]);
        }

        case str_starts_with($route, 'new-school/') || str_starts_with($route, 'admin/new-school/'): {
            new_school_handle_route($method, $route);
        }

        case $key === 'GET user/dashboard': {
            $u = require_login();

            $reqStmt = db()->prepare(
                'SELECT id, request_type, organization, message, status, created_at
                 FROM requests
                 WHERE email = ?
                 ORDER BY created_at DESC
                 LIMIT 100'
            );
            $reqStmt->execute([$u['email']]);
            $requests = $reqStmt->fetchAll();

            $orderStmt = db()->prepare(
                'SELECT id, order_no, customer_name, email, items, total, payment_method, status, created_at
                 FROM orders
                 WHERE user_id = ? OR email = ?
                 ORDER BY created_at DESC
                 LIMIT 100'
            );
            $orderStmt->execute([$u['id'], $u['email']]);
            $orders = $orderStmt->fetchAll();

            $rsvpStmt = db()->prepare(
                'SELECT r.id, r.confirmation_code, r.status, r.notes, r.created_at,
                        e.id AS event_id, e.title AS event_title, e.location, e.event_date
                 FROM event_rsvps r
                 INNER JOIN events e ON e.id = r.event_id
                 WHERE r.user_id = ? OR r.email = ?
                 ORDER BY r.created_at DESC
                 LIMIT 100'
            );
            $rsvpStmt->execute([(int) $u['id'], $u['email']]);
            $rsvps = $rsvpStmt->fetchAll();

            json([
                'user' => $u,
                'stats' => [
                    'requests' => count($requests),
                    'orders' => count($orders),
                    'rsvps' => count($rsvps),
                ],
                'requests' => $requests,
                'orders' => $orders,
                'rsvps' => $rsvps,
                // Admin announcements targeted to the community (audience 'community' or 'all').
                'announcements' => ecosystem_announcements_for_role('community'),
            ]);
        }

        case $key === 'PUT user/profile': {
            $u = require_login();
            $b = body();
            $name = field($b, 'full_name');
            $pass = field($b, 'password');

            if ($name === '') {
                json(['error' => 'Full name is required.'], 422);
            }
            if ($pass !== '' && strlen($pass) < 6) {
                json(['error' => 'Password must be at least 6 characters.'], 422);
            }

            if ($pass !== '') {
                $stmt = db()->prepare('UPDATE users SET full_name = ?, password_hash = ? WHERE id = ?');
                $stmt->execute([$name, password_hash($pass, PASSWORD_DEFAULT), $u['id']]);
            } else {
                $stmt = db()->prepare('UPDATE users SET full_name = ? WHERE id = ?');
                $stmt->execute([$name, $u['id']]);
            }

            $_SESSION['uid'] = (int) $u['id'];
            json(['user' => current_user(), 'message' => 'Profile updated.']);
        }

        /* ---------------- PUBLIC CONTENT ---------------- */
        case $key === 'GET events': {
            $rows = db()->query(
                'SELECT e.id, e.title, e.location, e.role, e.event_date, e.is_past,
                        (SELECT COUNT(*) FROM event_rsvps r
                         WHERE r.event_id = e.id AND r.status IN ("going", "maybe", "interested")) AS rsvp_count
                 FROM events e ORDER BY e.event_date ASC'
            )->fetchAll();
            json(['events' => $rows]);
        }

        case $key === 'GET store/inventory': {
            json(['inventory' => storefront_inventory_rows(false)]);
        }

        case $key === 'GET community/threads': {
            $u = current_user();
            $rows = db()->query(
                'SELECT t.id, t.title, t.body, t.audience, t.author_name, t.is_pinned, t.created_at,
                        (SELECT COUNT(*) FROM community_comments c WHERE c.thread_id = t.id) AS comment_count,
                        (SELECT MAX(created_at) FROM community_comments c WHERE c.thread_id = t.id) AS latest_comment_at
                 FROM community_threads t
                 ORDER BY t.is_pinned DESC, t.created_at DESC'
            )->fetchAll();

            $threads = array_values(array_filter($rows, static fn(array $row): bool =>
                community_can_view((string) $row['audience'], $u)
            ));
            json(['threads' => $threads]);
        }

        case $method === 'GET' && preg_match('#^community/thread/(\d+)$#', $route, $m) === 1: {
            $u = current_user();
            $stmt = db()->prepare(
                'SELECT id, title, body, audience, author_name, is_pinned, created_at
                 FROM community_threads WHERE id = ?'
            );
            $stmt->execute([(int) $m[1]]);
            $thread = $stmt->fetch();
            if (!$thread) json(['error' => 'Thread not found.'], 404);
            if (!community_can_view((string) $thread['audience'], $u)) {
                json(['error' => 'Community access required.'], 403);
            }

            $commentsStmt = db()->prepare(
                'SELECT c.id, c.author_name, c.body, c.created_at, u.role AS author_role
                 FROM community_comments c
                 LEFT JOIN users u ON u.id = c.user_id
                 WHERE c.thread_id = ?
                 ORDER BY c.created_at ASC'
            );
            $commentsStmt->execute([(int) $m[1]]);

            json([
                'thread' => $thread,
                'comments' => $commentsStmt->fetchAll(),
            ]);
        }

        case $key === 'POST event-rsvp': {
            $b = body();
            $eventId = (int) ($b['event_id'] ?? 0);
            if ($eventId <= 0) json(['error' => 'Event is required.'], 422);

            $eventStmt = db()->prepare('SELECT id, title, location, event_date FROM events WHERE id = ?');
            $eventStmt->execute([$eventId]);
            $event = $eventStmt->fetch();
            if (!$event) json(['error' => 'Event not found.'], 404);

            $user = current_user();
            $name = field($b, 'full_name') ?: ($user['full_name'] ?? '');
            $email = field($b, 'email') ?: ($user['email'] ?? '');
            $status = field($b, 'status') ?: 'going';
            $notes = field($b, 'notes');

            if ($name === '') json(['error' => 'Full name is required.'], 422);
            if ($email === '') json(['error' => 'Email is required.'], 422);
            if (!in_array($status, ['going', 'maybe', 'interested', 'cancelled'], true)) {
                json(['error' => 'Invalid RSVP status.'], 422);
            }

            $confirmationCode = event_confirmation_code();
            $stmt = db()->prepare(
                'INSERT INTO event_rsvps (event_id, user_id, full_name, email, status, notes, confirmation_code)
                 VALUES (?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([
                $eventId,
                $user ? (int) $user['id'] : null,
                $name,
                strtolower($email),
                $status,
                $notes ?: null,
                $confirmationCode,
            ]);

            notify(
                "New RSVP: {$event['title']}",
                "Event: {$event['title']}\nName: {$name}\nEmail: {$email}\nStatus: {$status}\nCode: {$confirmationCode}\n\n" . ($notes ?: '(no notes)')
            );

            json([
                'message' => 'RSVP confirmed.',
                'confirmation_code' => $confirmationCode,
                'event' => $event,
            ], 201);
        }

        case $key === 'POST community/thread': {
            $user = require_login();
            $b = body();
            $title = field($b, 'title');
            $bodyText = field($b, 'body');
            $audience = field($b, 'audience') ?: 'member';
            if ($title === '') json(['error' => 'Thread title is required.'], 422);
            if ($bodyText === '') json(['error' => 'Thread body is required.'], 422);
            if (!in_array($audience, ['public', 'member', 'vip'], true)) {
                json(['error' => 'Invalid audience.'], 422);
            }
            if ($audience === 'vip' && !in_array($user['role'], ['vip', 'editor', 'admin', 'super_admin'], true)) {
                json(['error' => 'VIP threads require elevated access.'], 403);
            }

            $stmt = db()->prepare(
                'INSERT INTO community_threads (title, body, audience, author_user_id, author_name, is_pinned)
                 VALUES (?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([
                $title,
                $bodyText,
                $audience,
                (int) $user['id'],
                $user['full_name'],
                !empty($b['is_pinned']) ? 1 : 0,
            ]);

            json([
                'message' => 'Community thread created.',
                'id' => (int) db()->lastInsertId(),
            ], 201);
        }

        case $method === 'POST' && preg_match('#^community/thread/(\d+)/comment$#', $route, $m) === 1: {
            $user = require_login();
            $threadStmt = db()->prepare('SELECT id, title, audience FROM community_threads WHERE id = ?');
            $threadStmt->execute([(int) $m[1]]);
            $thread = $threadStmt->fetch();
            if (!$thread) json(['error' => 'Thread not found.'], 404);
            if (!community_can_view((string) $thread['audience'], $user)) {
                json(['error' => 'Community access required.'], 403);
            }

            $bodyText = field(body(), 'body');
            if ($bodyText === '') json(['error' => 'Comment body is required.'], 422);

            $stmt = db()->prepare(
                'INSERT INTO community_comments (thread_id, user_id, author_name, body) VALUES (?, ?, ?, ?)'
            );
            $stmt->execute([
                (int) $m[1],
                (int) $user['id'],
                $user['full_name'],
                $bodyText,
            ]);

            json([
                'message' => 'Comment posted.',
                'id' => (int) db()->lastInsertId(),
            ], 201);
        }

        case $key === 'GET posts': {
            $rows = db()->query(
                'SELECT id, title, category, excerpt, cover_image, is_featured, published_at
                 FROM posts ORDER BY is_featured DESC, published_at DESC'
            )->fetchAll();
            json(['posts' => $rows]);
        }

        case $key === 'GET awards': {
            $rows = db()->query(
                'SELECT id, title, year, level, presenter, short_text, description, image, is_featured, sort_order
                 FROM awards ORDER BY sort_order ASC'
            )->fetchAll();
            json(['awards' => $rows]);
        }

        case $key === 'GET media': {
            $rows = db()->query(
                'SELECT id, title, type, summary, body, image, link_url, published_at, is_featured, sort_order
                 FROM media_items ORDER BY is_featured DESC, sort_order ASC, published_at DESC, id DESC'
            )->fetchAll();
            json(['media' => $rows]);
        }

        case $key === 'GET gallery': {
            json(gallery_public_payload());
        }

        case $key === 'GET testimonials': {
            $rows = db()->query(
                'SELECT id, quote, author_name, author_title, company, image, is_featured, sort_order, created_at
                 FROM testimonials ORDER BY is_featured DESC, sort_order ASC, created_at DESC'
            )->fetchAll();
            json(['testimonials' => $rows]);
        }

        case $key === 'GET sponsorship/current': {
            json(sponsor_current_program_payload());
        }

        case $key === 'GET sponsorship/current/sponsors': {
            json(sponsor_public_sponsors_payload());
        }

        case $method === 'GET' && preg_match('#^posts/(\d+)$#', $route, $m) === 1: {
            $stmt = db()->prepare(
                'SELECT id, title, category, excerpt, body, cover_image, is_featured, published_at FROM posts WHERE id = ?'
            );
            $stmt->execute([(int) $m[1]]);
            $post = $stmt->fetch();
            if (!$post) json(['error' => 'Post not found.'], 404);
            json(['post' => $post]);
        }

        /* ---------------- FORMS ---------------- */
        case $key === 'POST subscribe': {
            $email = require_email(field(body(), 'email'));
            // idempotent — duplicates are fine
            $stmt = db()->prepare('INSERT IGNORE INTO subscribers (email) VALUES (?)');
            $stmt->execute([$email]);
            json(['message' => 'You\'re on the list — welcome to the legacy.'], 201);
        }

        case $key === 'POST analytics/track': {
            // First-party page-view tracking for the admin Analytics "Website Traffic" panel.
            // Fire-and-forget: record best-effort and never error out the visitor's page.
            $b = body();
            try {
                $visitor = current_user();
                site_visits_record(
                    (string) field($b, 'path'),
                    (string) field($b, 'visitor_token'),
                    field($b, 'referrer') !== '' ? (string) field($b, 'referrer') : null,
                    $_SERVER['HTTP_USER_AGENT'] ?? null,
                    $visitor ? (int) $visitor['id'] : null
                );
            } catch (\Throwable $e) {
                // Tracking must never break navigation — swallow any failure.
            }
            json(['ok' => true], 202);
        }

        case $key === 'POST terms-acceptance': {
            // Records a website "Terms of Use & Privacy Notice" acceptance for any action form.
            // Auditing never blocks the primary action; user_id auto-links if a session exists.
            $b = body();
            $name = field($b, 'user_name') ?: field($b, 'signature_name') ?: field($b, 'full_name') ?: field($b, 'name');
            $email = require_email(field($b, 'email'));
            $signature = field($b, 'signature_name') ?: $name;
            $version = field($b, 'terms_version') ?: TERMS_WEBSITE_VERSION;
            $label = field($b, 'document_label') ?: TERMS_WEBSITE_LABEL;
            if ($name === '') {
                json(['error' => 'Your name is required to accept the terms.'], 422);
            }
            record_terms_acceptance([
                'accept_type' => 'website',
                'terms_version' => $version,
                'user_name' => $name,
                'email' => $email,
                'signature_name' => $signature,
                'document_label' => $label,
            ]);
            json(['ok' => true, 'message' => 'Acceptance recorded.'], 201);
        }

        case $key === 'POST sponsorship/upload-logo': {
            // M-2: public sponsor-application logo upload — rate-limit per IP (no login here).
            rate_limit('sponsor_logo', 15, 3600);
            sponsor_ensure_schema();
            if (empty($_FILES['file']) || ($_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
                json(['error' => 'No file uploaded.'], 422);
            }
            $f = $_FILES['file'];
            if (($f['size'] ?? 0) > 6 * 1024 * 1024) {
                json(['error' => 'Logo must be 6MB or smaller.'], 422);
            }

            $allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
            $mime = function_exists('mime_content_type') ? mime_content_type($f['tmp_name']) : ($f['type'] ?? '');
            if (!isset($allowed[$mime])) {
                json(['error' => 'Only JPG, PNG or WebP images are allowed.'], 422);
            }

            $dir = __DIR__ . '/uploads/sponsors';
            if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
                json(['error' => 'Could not create sponsor upload directory.'], 500);
            }

            $name = 'sponsor-' . bin2hex(random_bytes(8)) . '.' . $allowed[$mime];
            if (!move_uploaded_file($f['tmp_name'], $dir . '/' . $name)) {
                json(['error' => 'Failed to save the uploaded logo.'], 500);
            }

            json(['url' => '/api/uploads/sponsors/' . $name, 'message' => 'Uploaded.'], 201);
        }

        case $key === 'POST sponsorship/application': {
            sponsor_ensure_schema();
            $program = sponsor_current_program();
            $levels = sponsor_level_index((int) $program['id']);
            $b = body();

            $organizationName = field($b, 'organization_name');
            $contactPerson = field($b, 'contact_person');
            $titlePosition = field($b, 'title_position');
            $emailAddress = require_email(field($b, 'email_address'));
            $phoneNumber = field($b, 'phone_number');
            $website = sponsor_normalize_url(field($b, 'website'));
            $streetAddress = field($b, 'street_address');
            $city = field($b, 'city');
            $state = field($b, 'state');
            $zipCode = field($b, 'zip_code');
            $organizationType = field($b, 'organization_type');
            $logoUrl = field($b, 'logo_url');
            $companyBio = field($b, 'company_bio');
            $supportReason = field($b, 'support_reason');
            $levelSlug = field($b, 'sponsorship_level_slug');
            $submittedAmount = (float) ($b['sponsorship_amount'] ?? 0);
            $customAmount = !empty($b['custom_amount']);
            $interests = is_array($b['interests'] ?? null) ? array_values(array_filter(array_map('strval', $b['interests']))) : [];

            if ($organizationName === '') json(['error' => 'Organization name is required.'], 422);
            if ($contactPerson === '') json(['error' => 'Contact person is required.'], 422);
            if ($titlePosition === '') json(['error' => 'Title / position is required.'], 422);
            if ($phoneNumber === '') json(['error' => 'Phone number is required.'], 422);
            if ($streetAddress === '') json(['error' => 'Street address is required.'], 422);
            if ($city === '') json(['error' => 'City is required.'], 422);
            if ($state === '') json(['error' => 'State is required.'], 422);
            if ($zipCode === '') json(['error' => 'Zip code is required.'], 422);
            if ($organizationType === '' || !in_array($organizationType, sponsor_organization_types(), true)) {
                json(['error' => 'A valid organization type is required.'], 422);
            }
            if ($companyBio === '') json(['error' => 'Company bio is required.'], 422);
            if ($supportReason === '') json(['error' => 'Please share why you would like to support this initiative.'], 422);
            if ($levelSlug === '' || !isset($levels[$levelSlug])) {
                json(['error' => 'Please select a sponsorship level.'], 422);
            }
            if ($logoUrl !== '' && !preg_match('#^/api/uploads/sponsors/#', $logoUrl)) {
                json(['error' => 'Logo upload is invalid.'], 422);
            }

            $allowedInterests = sponsor_interest_options();
            $interests = array_values(array_filter($interests, static fn(string $interest): bool => in_array($interest, $allowedInterests, true)));

            $selectedLevel = $levels[$levelSlug];
            $minimumAmount = (float) $selectedLevel['minimum_amount'];
            $amount = $levelSlug === 'custom_sponsorship'
                ? $submittedAmount
                : max($minimumAmount, $submittedAmount > 0 ? $submittedAmount : $minimumAmount);

            if ($levelSlug === 'custom_sponsorship' && $amount <= 0) {
                json(['error' => 'Please enter a custom sponsorship amount.'], 422);
            }

            $publicDescription = sponsor_public_description($companyBio);
            $stmt = db()->prepare(
                'INSERT INTO sponsor_applications (
                    program_id, organization_name, contact_person, title_position, email_address, phone_number,
                    website, street_address, city, state, zip_code, organization_type, logo_url, company_bio,
                    support_reason, sponsorship_level_slug, sponsorship_level_name, sponsorship_amount, custom_amount,
                    interests_json, public_description, payment_status, approval_status
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "pending_check", "pending_review")'
            );
            $stmt->execute([
                (int) $program['id'],
                $organizationName,
                $contactPerson,
                $titlePosition,
                $emailAddress,
                $phoneNumber,
                $website,
                $streetAddress,
                $city,
                $state,
                $zipCode,
                $organizationType,
                $logoUrl !== '' ? $logoUrl : null,
                $companyBio,
                $supportReason,
                $levelSlug,
                $selectedLevel['name'],
                $amount,
                $levelSlug === 'custom_sponsorship' || $customAmount ? 1 : 0,
                json_encode($interests, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                $publicDescription !== '' ? $publicDescription : null,
            ]);

            $applicationId = (int) db()->lastInsertId();
            $application = [
                'id' => $applicationId,
                'organization_name' => $organizationName,
                'contact_person' => $contactPerson,
                'email_address' => $emailAddress,
                'sponsorship_level_name' => (string) $selectedLevel['name'],
                'sponsorship_amount' => $amount,
            ];

            sponsor_send_confirmation_email($application, $program);
            notify(
                'New sponsor application: ' . $organizationName,
                implode("\n", [
                    'Program: ' . ($program['edition_name'] ?: $program['name']),
                    'Organization: ' . $organizationName,
                    'Contact Person: ' . $contactPerson,
                    'Title / Position: ' . $titlePosition,
                    'Email: ' . $emailAddress,
                    'Phone: ' . $phoneNumber,
                    'Website: ' . ($website ?: '—'),
                    'Organization Type: ' . $organizationType,
                    'Sponsorship Level: ' . $selectedLevel['name'],
                    'Sponsorship Amount: $' . number_format($amount, 2),
                    '',
                    'Why Support:',
                    $supportReason,
                    '',
                    sponsor_payment_instruction_text(),
                ])
            );

            json([
                'message' => 'Sponsorship application received.',
                'application' => $application,
                'paymentInstructions' => sponsor_payment_instruction_lines(),
            ], 201);
        }

        case $key === 'POST gallery/submission': {
            $u = require_login();
            gallery_ensure_schema();

            $submitterName = trim((string) ($u['full_name'] ?? ''));
            $submitterEmail = require_email((string) ($u['email'] ?? ''));
            $organization = trim((string) ($_POST['organization'] ?? ''));
            $message = trim((string) ($_POST['message'] ?? ''));
            $files = gallery_normalize_uploads($_FILES['files'] ?? []);

            if ($submitterName === '') json(['error' => 'Your account is missing a full name.'], 422);
            if ($files === []) json(['error' => 'Upload at least one file.'], 422);
            if (count($files) > 20) json(['error' => 'You can upload up to 20 files at a time.'], 422);

            $imageMimes = gallery_allowed_image_mimes();
            $videoMimes = gallery_allowed_video_mimes();
            $dir = __DIR__ . '/uploads/gallery';
            if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
                json(['error' => 'Could not create gallery upload directory.'], 500);
            }

            $prepared = [];
            foreach ($files as $file) {
                if ((int) ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
                    json(['error' => gallery_upload_error_message((int) $file['error'])], 422);
                }
                $mime = function_exists('mime_content_type') ? mime_content_type($file['tmp_name']) : ($file['type'] ?? '');
                $kind = null;
                $extension = null;
                $maxSize = 0;
                if (isset($imageMimes[$mime])) {
                    $kind = 'image';
                    $extension = $imageMimes[$mime];
                    $maxSize = 6 * 1024 * 1024;
                } elseif (isset($videoMimes[$mime])) {
                    $kind = 'video';
                    $extension = $videoMimes[$mime];
                    $maxSize = 70 * 1024 * 1024;
                }
                if ($kind === null || $extension === null) {
                    json(['error' => 'Only JPG, PNG, WebP, MP4, WebM, MOV, or MKV files are allowed.'], 422);
                }
                if ((int) ($file['size'] ?? 0) > $maxSize) {
                    json(['error' => $kind === 'video' ? 'Video files must be 70MB or smaller.' : 'Image files must be 6MB or smaller.'], 422);
                }
                $prepared[] = [
                    'tmp_name' => (string) $file['tmp_name'],
                    'original_name' => (string) $file['name'],
                    'display_title' => gallery_title_from_filename((string) $file['name']),
                    'mime_type' => (string) $mime,
                    'media_kind' => $kind,
                    'size_bytes' => (int) ($file['size'] ?? 0),
                    'extension' => $extension,
                ];
            }

            $pdo = db();
            $pdo->beginTransaction();
            try {
                $stmt = $pdo->prepare(
                    'INSERT INTO gallery_submissions (user_id, submitter_name, submitter_email, organization, message, overall_status)
                     VALUES (?, ?, ?, ?, ?, "pending_review")'
                );
                $stmt->execute([
                    isset($u['id']) ? (int) $u['id'] : null,
                    $submitterName,
                    $submitterEmail,
                    $organization !== '' ? $organization : null,
                    $message !== '' ? $message : null,
                ]);
                $submissionId = (int) $pdo->lastInsertId();

                $fileStmt = $pdo->prepare(
                    'INSERT INTO gallery_submission_files
                        (submission_id, original_name, display_title, file_url, mime_type, media_kind, size_bytes, approval_status)
                     VALUES (?, ?, ?, ?, ?, ?, ?, "pending_review")'
                );

                $savedFiles = [];
                foreach ($prepared as $item) {
                    $prefix = $item['media_kind'] === 'video' ? 'gallery-video' : 'gallery-image';
                    $name = $prefix . '-' . bin2hex(random_bytes(8)) . '.' . $item['extension'];
                    if (!move_uploaded_file($item['tmp_name'], $dir . '/' . $name)) {
                        throw new RuntimeException('Failed to save one of the uploaded files.');
                    }
                    $url = '/api/uploads/gallery/' . $name;
                    $fileStmt->execute([
                        $submissionId,
                        $item['original_name'],
                        $item['display_title'],
                        $url,
                        $item['mime_type'],
                        $item['media_kind'],
                        $item['size_bytes'],
                    ]);
                    $savedFiles[] = [
                        'id' => (int) $pdo->lastInsertId(),
                        'display_title' => $item['display_title'],
                        'file_url' => $url,
                        'mime_type' => $item['mime_type'],
                        'media_kind' => $item['media_kind'],
                        'approval_status' => 'pending_review',
                    ];
                }

                $pdo->commit();
                notify(
                    'New gallery submission',
                    "Submitter: {$submitterName}
Email: {$submitterEmail}
Files: " . count($savedFiles) . "
Organization: " . ($organization !== '' ? $organization : '?') . "

" . ($message !== '' ? $message : '(no message)')
                );
                json([
                    'message' => 'Gallery submission received.',
                    'submission' => [
                        'id' => $submissionId,
                        'submitter_name' => $submitterName,
                        'submitter_email' => $submitterEmail,
                        'organization' => $organization !== '' ? $organization : null,
                        'message' => $message !== '' ? $message : null,
                        'overall_status' => 'pending_review',
                        'files' => $savedFiles,
                    ],
                ], 201);
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $e;
            }
        }

        case $key === 'POST request': {

            $b    = body();
            $type = field($b, 'request_type') ?: 'General Request';
            $name = field($b, 'full_name') ?: field($b, 'name');
            $email = require_email(field($b, 'email'));
            $org   = field($b, 'organization');
            $msg   = field($b, 'message');

            if ($name === '') json(['error' => 'Full name is required.'], 422);

            $stmt = db()->prepare(
                'INSERT INTO requests (request_type, full_name, email, organization, message)
                 VALUES (?, ?, ?, ?, ?)'
            );
            $stmt->execute([$type, $name, $email, $org ?: null, $msg ?: null]);
            notify(
                "New request: {$type}",
                "Type: {$type}\nName: {$name}\nEmail: {$email}\nOrganization: " . ($org ?: '—') . "\n\n" . ($msg ?: '(no message)')
            );
            json(['message' => 'Received — thank you. The team will be in touch shortly.'], 201);
        }

        case $key === 'POST contact': {
            $b    = body();
            $name = field($b, 'full_name') ?: field($b, 'name');
            $email = require_email(field($b, 'email'));
            $msg   = field($b, 'message');

            if ($name === '') json(['error' => 'Full name is required.'], 422);

            $stmt = db()->prepare(
                'INSERT INTO contact_messages (full_name, email, message) VALUES (?, ?, ?)'
            );
            $stmt->execute([$name, $email, $msg ?: null]);
            notify(
                'New contact message',
                "Name: {$name}\nEmail: {$email}\n\n" . ($msg ?: '(no message)')
            );
            json(['message' => 'Message sent. Thank you.'], 201);
        }

        /* ---------------- STORE / CHECKOUT ---------------- */
        case $key === 'GET store/payment-methods': {
            json(storefront_payment_config());
        }

        case $key === 'POST store/checkout': {
            // M-3: cap anonymous checkout rate, and return stock reserved by orders that
            // were never paid (abandoned) so the store cannot be drained by opening
            // checkouts and never completing payment.
            rate_limit('store_checkout', 20, 3600);
            storefront_release_expired_reservations(30);
            $b = body();
            $name = field($b, 'customer_name') ?: field($b, 'name');
            $email = require_email(field($b, 'email'));
            $address = field($b, 'address');
            $items = $b['items'] ?? [];

            $provider = field($b, 'provider') ?: 'stripe';
            if ($name === '') json(['error' => 'Customer name is required.'], 422);
            if ($address === '') json(['error' => 'Shipping address is required.'], 422);
            if (!is_array($items) || count($items) === 0) json(['error' => 'Cart is empty.'], 422);
            if (!in_array($provider, storefront_payment_methods(), true)) {
                json(['error' => 'That payment method is not available.'], 503);
            }

            $normalizedItems = normalized_order_items($items);
            if (count($normalizedItems) === 0) {
                json(['error' => 'Cart contains invalid items.'], 422);
            }

            $grouped = [];
            foreach ($normalizedItems as $item) {
                $grouped[$item['id']] = ($grouped[$item['id']] ?? 0) + (int) $item['qty'];
            }

            $pdo = db();
            $catalog = storefront_catalog();
            storefront_ensure_orders_payment_schema();

            $pdo->beginTransaction();
            try {
                $lock = $pdo->prepare(
                    'SELECT product_id, stock, low_stock_threshold
                     FROM store_inventory WHERE product_id = ? FOR UPDATE'
                );
                foreach ($grouped as $productId => $qty) {
                    $lock->execute([$productId]);
                    $inv = $lock->fetch();
                    if (!$inv) {
                        $pdo->rollBack();
                        json(['error' => 'Inventory record missing for ' . $productId . '.'], 500);
                    }
                    if ((int) $inv['stock'] < $qty) {
                        $pdo->rollBack();
                        $productName = $catalog[$productId]['name'] ?? $productId;
                        json(['error' => "Not enough stock for {$productName}."], 409);
                    }
                }

                $totals = calculate_order_totals($normalizedItems, field($b, 'promo_code'));
                $orderNo = 'FC-' . str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
                $uid = $_SESSION['uid'] ?? null;

                $stmt = $pdo->prepare(
                    'INSERT INTO orders
                       (order_no, user_id, customer_name, email, address, items,
                        subtotal, discount, shipping, tax, total, payment_method,
                        payment_provider, payment_status, status)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                );
                $stmt->execute([
                    $orderNo,
                    $uid,
                    $name,
                    $email,
                    $address,
                    json_encode($normalizedItems, JSON_UNESCAPED_UNICODE),
                    $totals['subtotal'],
                    $totals['discount'],
                    $totals['shipping'],
                    $totals['tax'],
                    $totals['total'],
                    $provider,
                    $provider,
                    'pending',
                    'pending',
                ]);

                $orderId = (int) $pdo->lastInsertId();

                $decrement = $pdo->prepare('UPDATE store_inventory SET stock = stock - ? WHERE product_id = ?');
                foreach ($grouped as $productId => $qty) {
                    $decrement->execute([(int) $qty, $productId]);
                }

                $currency = storefront_currency();
                $response = ['order_no' => $orderNo, 'payment_provider' => $provider];
                $sessionId = '';
                $sessionUrl = '';

                if ($provider === 'stripe') {
                    $checkout = storefront_stripe_checkout_session($normalizedItems, ['order_no' => $orderNo], $catalog, ['name' => $name, 'email' => $email]);
                    if (!$checkout['ok']) { $pdo->rollBack(); json(['error' => (string) ($checkout['error'] ?? 'Could not create checkout session.')], 502); }
                    $sessionId = (string) ($checkout['session']['id'] ?? '');
                    $sessionUrl = (string) ($checkout['session']['url'] ?? '');
                    if ($sessionId === '' || $sessionUrl === '') { $pdo->rollBack(); json(['error' => 'Stripe checkout session is missing a redirect URL.'], 502); }
                    $response['mode'] = 'redirect';
                    $response['checkout_url'] = $sessionUrl;
                    $response['message'] = 'Redirecting to secure checkout.';
                } elseif ($provider === 'paypal') {
                    $pp = storefront_paypal_create_order((float) $totals['total'], $currency, $orderNo);
                    if (!$pp['ok'] || $pp['approve_url'] === '') { $pdo->rollBack(); json(['error' => (string) ($pp['error'] ?? 'PayPal order could not be created.')], 502); }
                    $sessionId = $pp['id'];
                    $sessionUrl = $pp['approve_url'];
                    $response['mode'] = 'redirect';
                    $response['checkout_url'] = $sessionUrl;
                    $response['message'] = 'Redirecting to PayPal.';
                } elseif ($provider === 'razorpay') {
                    $amountMinor = (int) round(((float) $totals['total']) * 100);
                    $rz = storefront_razorpay_create_order($amountMinor, $currency, $orderNo);
                    if (!$rz['ok']) { $pdo->rollBack(); json(['error' => (string) ($rz['error'] ?? 'Razorpay order could not be created.')], 502); }
                    $sessionId = (string) ($rz['order']['id'] ?? '');
                    if ($sessionId === '') { $pdo->rollBack(); json(['error' => 'Razorpay order id missing.'], 502); }
                    $response['mode'] = 'razorpay';
                    $response['razorpay_order_id'] = $sessionId;
                    $response['razorpay_key_id'] = storefront_razorpay_key_id();
                    $response['amount'] = $amountMinor;
                    $response['currency'] = strtoupper($currency);
                    $response['customer_name'] = $name;
                    $response['customer_email'] = $email;
                    $response['message'] = 'Complete payment with Razorpay.';
                }

                $update = $pdo->prepare('UPDATE orders SET payment_session_id = ?, payment_url = ?, payment_status = ?, updated_at = NOW() WHERE id = ?');
                $update->execute([$sessionId, $sessionUrl, 'pending', $orderId]);

                $pdo->commit();
                json($response, 201);
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $e;
            }
        }

        case $key === 'POST store/checkout/confirm': {
            $b = body();
            $sessionId = field($b, 'session_id');
            $orderNo = field($b, 'order_no');

            if ($sessionId === '') {
                json(['error' => 'Checkout session id is required.'], 422);
            }
            if (!storefront_stripe_enabled()) {
                json(['error' => 'Secure checkout is not configured yet.'], 503);
            }

            storefront_ensure_orders_payment_schema();
            $sessionResponse = storefront_stripe_checkout_session_detail($sessionId);
            if (!$sessionResponse['ok'] || !is_array($sessionResponse['data'])) {
                json(['error' => 'Unable to verify the payment session.'], 502);
            }

            $session = $sessionResponse['data'];
            $paymentStatus = (string) ($session['payment_status'] ?? '');
            if ($paymentStatus !== 'paid') {
                json(['error' => 'Payment has not been completed yet.'], 409);
            }

            $reference = (string) ($session['client_reference_id'] ?? '');
            if ($orderNo === '') {
                $orderNo = $reference;
            }
            if ($orderNo === '') {
                json(['error' => 'Order reference missing from payment session.'], 422);
            }
            if ($reference !== '' && $orderNo !== $reference) {
                json(['error' => 'Payment session does not match the order reference.'], 422);
            }

            // L1: bind + amount-check the Stripe confirmation the same way as Razorpay/
            // PayPal — go through storefront_mark_order_paid() instead of a bespoke UPDATE.
            $paymentIntentId = '';
            if (isset($session['payment_intent'])) {
                if (is_string($session['payment_intent'])) {
                    $paymentIntentId = $session['payment_intent'];
                } elseif (is_array($session['payment_intent']) && isset($session['payment_intent']['id'])) {
                    $paymentIntentId = (string) $session['payment_intent']['id'];
                }
            }
            $capAmtMinor = isset($session['amount_total']) ? (int) $session['amount_total'] : null;
            $capCurrency = strtoupper((string) ($session['currency'] ?? ''));
            storefront_mark_order_paid($orderNo, 'stripe', 'stripe_checkout', $paymentIntentId !== '' ? $paymentIntentId : $sessionId, $sessionId, [
                'expect_session' => $sessionId,
                'amount_minor'   => $capAmtMinor,
                'currency'       => $capCurrency,
            ]);
            json([
                'message' => 'Payment confirmed.',
                'order_no' => $orderNo,
                'payment_status' => 'paid',
            ]);
        }

        // Razorpay: verify the payment signature client-side handshake returned, then mark paid.
        case $key === 'POST store/checkout/razorpay-verify': {
            $b = body();
            $orderNo = field($b, 'order_no');
            $rzpOrderId = field($b, 'razorpay_order_id');
            $paymentId = field($b, 'razorpay_payment_id');
            $signature = field($b, 'razorpay_signature');
            if ($orderNo === '' || $rzpOrderId === '' || $paymentId === '' || $signature === '') {
                json(['error' => 'Missing payment verification fields.'], 422);
            }
            if (!storefront_razorpay_verify_signature($rzpOrderId, $paymentId, $signature)) {
                json(['error' => 'Payment could not be verified.'], 400);
            }
            storefront_ensure_orders_payment_schema();
            // Bind the Razorpay order id to this order (the amount is correct by
            // construction: the Razorpay order was created server-side for this order).
            storefront_mark_order_paid($orderNo, 'razorpay', 'razorpay', $paymentId, $rzpOrderId, ['expect_session' => $rzpOrderId]);
            json(['message' => 'Payment confirmed.', 'order_no' => $orderNo, 'payment_status' => 'paid']);
        }

        // PayPal: capture the approved order on return, then mark paid.
        case $key === 'POST store/checkout/paypal-capture': {
            $b = body();
            $orderNo = field($b, 'order_no');
            $paypalOrderId = field($b, 'paypal_order_id');
            if ($orderNo === '' || $paypalOrderId === '') json(['error' => 'Missing PayPal order reference.'], 422);
            if (!storefront_paypal_enabled()) json(['error' => 'PayPal is not configured.'], 503);
            $cap = storefront_paypal_capture_order($paypalOrderId);
            if (!$cap['ok'] || $cap['status'] !== 'COMPLETED') {
                json(['error' => 'Payment has not been completed.', 'status' => $cap['status'] ?? ''], 409);
            }
            // Pull the actually-captured amount/currency + capture id from PayPal's response.
            $capture = $cap['data']['purchase_units'][0]['payments']['captures'][0] ?? null;
            $capAmtMinor = null; $capCurrency = ''; $captureId = $paypalOrderId;
            if (is_array($capture) && isset($capture['amount']['value'])) {
                $capAmtMinor = (int) round(((float) $capture['amount']['value']) * 100);
                $capCurrency = (string) ($capture['amount']['currency_code'] ?? '');
                $captureId   = (string) ($capture['id'] ?? $paypalOrderId);
            }
            storefront_ensure_orders_payment_schema();
            // Bind the PayPal order id to this order + verify the captured amount/currency.
            storefront_mark_order_paid($orderNo, 'paypal', 'paypal', $captureId, $paypalOrderId, [
                'expect_session' => $paypalOrderId,
                'amount_minor'   => $capAmtMinor,
                'currency'       => $capCurrency,
            ]);
            json(['message' => 'Payment confirmed.', 'order_no' => $orderNo, 'payment_status' => 'paid']);
        }

        case $key === 'POST order': {
            $b     = body();
            $name  = field($b, 'customer_name') ?: field($b, 'name');
            $email = require_email(field($b, 'email'));
            $items = $b['items'] ?? [];

            if ($name === '')                       json(['error' => 'Customer name is required.'], 422);
            if (!is_array($items) || count($items) === 0) json(['error' => 'Cart is empty.'], 422);

            $normalizedItems = normalized_order_items($items);
            if (count($normalizedItems) === 0) {
                json(['error' => 'Cart contains invalid items.'], 422);
            }

            $grouped = [];
            foreach ($normalizedItems as $item) {
                $grouped[$item['id']] = ($grouped[$item['id']] ?? 0) + (int) $item['qty'];
            }

            $pdo = db();
            $catalog = storefront_catalog();

            $pdo->beginTransaction();
            try {
                $lock = $pdo->prepare(
                    'SELECT product_id, stock, low_stock_threshold
                     FROM store_inventory WHERE product_id = ? FOR UPDATE'
                );
                foreach ($grouped as $productId => $qty) {
                    $lock->execute([$productId]);
                    $inv = $lock->fetch();
                    if (!$inv) {
                        $pdo->rollBack();
                        json(['error' => 'Inventory record missing for ' . $productId . '.'], 500);
                    }
                    if ((int) $inv['stock'] < $qty) {
                        $pdo->rollBack();
                        $productName = $catalog[$productId]['name'] ?? $productId;
                        json(['error' => "Not enough stock for {$productName}."], 409);
                    }
                }

                $totals = calculate_order_totals($normalizedItems, field($b, 'promo_code'));
                $orderNo = 'FC-' . str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
                $uid     = $_SESSION['uid'] ?? null;

                $stmt = $pdo->prepare(
                    'INSERT INTO orders
                       (order_no, user_id, customer_name, email, address, items,
                        subtotal, discount, shipping, tax, total, payment_method)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                );
                $stmt->execute([
                    $orderNo,
                    $uid,
                    $name,
                    $email,
                    field($b, 'address') ?: null,
                    json_encode($normalizedItems, JSON_UNESCAPED_UNICODE),
                    $totals['subtotal'],
                    $totals['discount'],
                    $totals['shipping'],
                    $totals['tax'],
                    $totals['total'],
                    field($b, 'payment_method') ?: 'card',
                ]);

                $decrement = $pdo->prepare('UPDATE store_inventory SET stock = stock - ? WHERE product_id = ?');
                foreach ($grouped as $productId => $qty) {
                    $decrement->execute([(int) $qty, $productId]);
                }

                $pdo->commit();
                json(['order_no' => $orderNo, 'message' => 'Order confirmed.', 'totals' => $totals], 201);
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $e;
            }
        }

        /* ---------------- BUSINESS DASHBOARD (ecosystem role) ---------------- */
        // Public self-registration: creates a pending 'business' user + account.
        case $key === 'POST business/register': {
            roles_ensure_enum();
            business_ensure_schema();
            $b = body();
            $fullName = trim((string) (field($b, 'full_name') ?: field($b, 'contact_name')));
            $email = require_email(field($b, 'email'));
            $pass = (string) field($b, 'password');
            $bizName = trim((string) field($b, 'business_name'));
            if (mb_strlen($fullName) < 3) json(['error' => 'Contact name is required (at least 3 characters).'], 422);
            if ($bizName === '') json(['error' => 'Business name is required.'], 422);
            if (strlen($pass) < 6) json(['error' => 'Password must be at least 6 characters.'], 422);

            $user = new_school_upsert_user_account($fullName, $email, $pass, 'business');
            db()->prepare(
                'INSERT INTO business_accounts (user_id, business_name, category, borough, contact_name, contact_phone, website, about)
                 VALUES (?,?,?,?,?,?,?,?)
                 ON DUPLICATE KEY UPDATE business_name=VALUES(business_name), category=VALUES(category),
                     borough=VALUES(borough), contact_name=VALUES(contact_name), contact_phone=VALUES(contact_phone),
                     website=VALUES(website), about=VALUES(about), updated_at=NOW()'
            )->execute([
                (int) $user['id'], mb_substr($bizName, 0, 160),
                mb_substr(trim((string) field($b, 'category')), 0, 80) ?: null,
                mb_substr(trim((string) field($b, 'borough')), 0, 60) ?: null,
                mb_substr($fullName, 0, 120),
                mb_substr(trim((string) field($b, 'contact_phone')), 0, 40) ?: null,
                mb_substr(trim((string) field($b, 'website')), 0, 255) ?: null,
                mb_substr(trim((string) field($b, 'about')), 0, 2000) ?: null,
            ]);
            attribute_referral((int) $user['id'], field($b, 'ref')); // partner-referral attribution
            json([
                'message' => 'Business account submitted for admin approval.',
                'user' => login_user($user),
            ], 201);
        }

        case $key === 'GET business/dashboard': {
            $u = require_business();
            json(business_dashboard_payload($u));
        }

        case $key === 'PUT business/profile': {
            $u = require_business();
            business_ensure_schema();
            $b = body();
            $bizName = trim((string) field($b, 'business_name'));
            if ($bizName === '') json(['error' => 'Business name is required.'], 422);
            db()->prepare(
                'INSERT INTO business_accounts (user_id, business_name, category, borough, contact_name, contact_phone, website, about)
                 VALUES (?,?,?,?,?,?,?,?)
                 ON DUPLICATE KEY UPDATE business_name=VALUES(business_name), category=VALUES(category),
                     borough=VALUES(borough), contact_name=VALUES(contact_name), contact_phone=VALUES(contact_phone),
                     website=VALUES(website), about=VALUES(about), updated_at=NOW()'
            )->execute([
                (int) $u['id'], mb_substr($bizName, 0, 160),
                mb_substr(trim((string) field($b, 'category')), 0, 80) ?: null,
                mb_substr(trim((string) field($b, 'borough')), 0, 60) ?: null,
                mb_substr(trim((string) field($b, 'contact_name')), 0, 120) ?: null,
                mb_substr(trim((string) field($b, 'contact_phone')), 0, 40) ?: null,
                mb_substr(trim((string) field($b, 'website')), 0, 255) ?: null,
                mb_substr(trim((string) field($b, 'about')), 0, 2000) ?: null,
            ]);
            json(business_dashboard_payload($u));
        }

        // Opportunity requests (implementation / contact_school / internship / volunteer)
        // — reviewed by the admin; the business cannot rate or score students.
        case $key === 'POST business/request': {
            $u = require_business();
            json(business_create_request($u, body()), 201);
        }

        case $key === 'GET admin/business-requests': {
            require_admin();
            json(['requests' => business_requests_all()]);
        }

        case $method === 'PUT' && preg_match('#^admin/business-request/(\d+)$#', $route, $m) === 1: {
            $admin = require_admin();
            $b = body();
            business_request_update((int) $m[1], (string) field($b, 'status'), (string) field($b, 'admin_note'), (int) $admin['id']);
            json(['message' => 'Request updated.', 'requests' => business_requests_all()]);
        }

        /* ---------------- ADMIN: ecosystem documents / requests / announcements ---------------- */
        case $key === 'GET admin/ecosystem/accounts': {
            require_admin();
            json(['accounts' => ecosystem_accounts_list()]);
        }
        case $method === 'GET' && preg_match('#^admin/ecosystem/documents/(\d+)$#', $route, $m) === 1: {
            require_admin();
            json(['documents' => ecosystem_documents_for_user((int) $m[1])]);
        }
        case $key === 'POST admin/ecosystem/document': {
            require_admin();
            $b = body();
            $uid = (int) field($b, 'user_id');
            $role = (string) field($b, 'role');
            if ($uid <= 0) json(['error' => 'Pick an account.'], 422);
            ecosystem_document_add($uid, $role, (string) field($b, 'doc_type'), (string) field($b, 'label'), (string) field($b, 'file_url'));
            json(['message' => 'Document added.', 'documents' => ecosystem_documents_for_user($uid)], 201);
        }
        case $method === 'DELETE' && preg_match('#^admin/ecosystem/document/(\d+)$#', $route, $m) === 1: {
            require_admin();
            ecosystem_document_delete((int) $m[1]);
            json(['message' => 'Document removed.']);
        }
        case $key === 'GET admin/ecosystem/requests': {
            require_admin();
            json(['requests' => ecosystem_requests_all()]);
        }
        case $method === 'PUT' && preg_match('#^admin/ecosystem/request/(\d+)$#', $route, $m) === 1: {
            $admin = require_admin();
            $b = body();
            ecosystem_request_update((int) $m[1], (string) field($b, 'status'), (string) field($b, 'admin_note'), (int) $admin['id']);
            json(['message' => 'Request updated.', 'requests' => ecosystem_requests_all()]);
        }
        case $key === 'GET admin/ecosystem/announcements': {
            require_admin();
            json(['announcements' => ecosystem_announcements_all()]);
        }
        case $key === 'POST admin/ecosystem/announcement': {
            require_admin();
            $b = body();
            if (trim((string) field($b, 'title')) === '') json(['error' => 'Title is required.'], 422);
            ecosystem_announcement_add((string) field($b, 'audience'), (string) field($b, 'title'), (string) field($b, 'body'));
            json(['message' => 'Announcement posted.', 'announcements' => ecosystem_announcements_all()], 201);
        }
        case $method === 'DELETE' && preg_match('#^admin/ecosystem/announcement/(\d+)$#', $route, $m) === 1: {
            require_admin();
            ecosystem_announcement_delete((int) $m[1]);
            json(['message' => 'Announcement removed.']);
        }

        // B: set recognition stats (hours / events_supported / students_mentored) on an account.
        case $method === 'PUT' && preg_match('#^admin/ecosystem/recognition/(\d+)$#', $route, $m) === 1: {
            require_admin();
            $b = body();
            ecosystem_set_recognition((int) $m[1], [
                'hours' => field($b, 'hours'),
                'events_supported' => field($b, 'events_supported'),
                'students_mentored' => field($b, 'students_mentored'),
            ]);
            json(['message' => 'Recognition updated.']);
        }

        // C: per-account assignments (create / list / status / delete).
        case $method === 'GET' && preg_match('#^admin/ecosystem/assignments/(\d+)$#', $route, $m) === 1: {
            require_admin();
            json(['assignments' => ecosystem_assignments_for_user((int) $m[1])]);
        }
        case $key === 'POST admin/ecosystem/assignment': {
            require_admin();
            $b = body();
            $uid = (int) (field($b, 'user_id') ?: 0);
            if ($uid <= 0) json(['error' => 'A recipient account is required.'], 422);
            if (trim((string) field($b, 'title')) === '') json(['error' => 'Title is required.'], 422);
            ecosystem_assignment_add($uid, (string) field($b, 'role'), (string) field($b, 'title'), (string) field($b, 'detail'), (string) field($b, 'assign_date'));
            json(['message' => 'Assignment created.', 'assignments' => ecosystem_assignments_for_user($uid)], 201);
        }
        case $method === 'PUT' && preg_match('#^admin/ecosystem/assignment/(\d+)$#', $route, $m) === 1: {
            require_admin();
            ecosystem_assignment_set_status((int) $m[1], (string) field(body(), 'status'));
            json(['message' => 'Assignment updated.']);
        }
        case $method === 'DELETE' && preg_match('#^admin/ecosystem/assignment/(\d+)$#', $route, $m) === 1: {
            require_admin();
            ecosystem_assignment_delete((int) $m[1]);
            json(['message' => 'Assignment removed.']);
        }

        /* ---------------- DEMO ONE-CLICK LOGIN (presentations; DEMO_MODE=off to disable) ---------------- */
        case $key === 'GET demo/accounts': {
            if (!demo_mode_enabled()) json(['error' => 'Not found.'], 404);
            json(['accounts' => demo_accounts_list()]);
        }

        case $key === 'POST demo/login': {
            if (!demo_mode_enabled()) json(['error' => 'Not found.'], 404);
            $role = (string) field(body(), 'role');
            json(['message' => 'Signed in as demo ' . $role . '.', 'user' => demo_login($role)]);
        }

        /* ---------------- ECOSYSTEM DASHBOARDS (sponsor / partner / media / volunteer) ---------------- */
        case $method === 'POST' && preg_match('#^ecosystem/(sponsor|partner|media|volunteer)/register$#', $route, $m) === 1: {
            json([
                'message' => ucfirst($m[1]) . ' account submitted for admin approval.',
                'user' => ecosystem_register($m[1], body()),
            ], 201);
        }

        case $method === 'GET' && preg_match('#^ecosystem/(sponsor|partner|media|volunteer)/dashboard$#', $route, $m) === 1: {
            $u = require_ecosystem($m[1]);
            json(ecosystem_dashboard_payload($m[1], $u));
        }

        case $method === 'POST' && preg_match('#^ecosystem/(sponsor|partner|media|volunteer)/profile$#', $route, $m) === 1: {
            $u = require_ecosystem($m[1]);
            ecosystem_profile_save($u, $m[1], body());
            json(ecosystem_dashboard_payload($m[1], $u));
        }

        // Ecosystem account uploads its logo/branding image.
        case $method === 'POST' && preg_match('#^ecosystem/(sponsor|partner|media|volunteer)/logo$#', $route, $m) === 1: {
            $u = require_ecosystem($m[1]);
            $url = media_store_uploaded_file('file', false);
            json(ecosystem_set_logo($u, $url));
        }

        // Ecosystem account raises a request (meeting/renewal/interview/opportunity/event…) for admin review.
        case $method === 'POST' && preg_match('#^ecosystem/(sponsor|partner|media|volunteer)/request$#', $route, $m) === 1: {
            $u = require_ecosystem($m[1]);
            json(ecosystem_create_request($u, $m[1], body()), 201);
        }
        // Applicant replies to a "Needs Info" request → appends their answer and sends it
        // back to the admin queue (status returns to pending).
        case $method === 'POST' && preg_match('#^ecosystem/(sponsor|partner|media|volunteer)/request/(\d+)/reply$#', $route, $m) === 1: {
            $u = require_ecosystem($m[1]);
            $requests = ecosystem_request_reply((int) $u['id'], (int) $m[2], (string) field(body(), 'message'));
            json(['message' => 'Reply sent — the team will review it.', 'requests' => $requests]);
        }

        /* ---------------- OUR PARTNERS (dynamic content directory) ---------------- */
        case $key === 'GET partners': {
            partners_ensure_schema();
            json(partner_public_payload());
        }

        case $key === 'GET admin/partners': {
            require_admin();
            partners_ensure_schema();
            $rows = db()->query('SELECT * FROM partners ORDER BY sort_order ASC, name ASC')->fetchAll();
            json(['partners' => $rows]);
        }

        case $key === 'GET admin/partners/settings': {
            require_admin();
            partners_ensure_schema();
            json(['page' => partner_page_payload()]);
        }

        case $key === 'PUT admin/partners/settings': {
            require_admin();
            partners_ensure_schema();
            json(['message' => 'Page content saved.', 'page' => partner_page_save(body())]);
        }

        case $key === 'POST admin/partner': {
            require_admin();
            partners_ensure_schema();
            $v = partner_values_from_body(body());
            if ($v['name'] === '') json(['error' => 'Partner name is required.'], 422);
            $stmt = db()->prepare(
                'INSERT INTO partners (name, logo_url, partner_type, industry, borough, county, location, partner_since, website, blurb, is_featured, is_media_partner, status, sort_order)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
            );
            $stmt->execute([$v['name'], $v['logo_url'], $v['partner_type'], $v['industry'], $v['borough'], $v['county'], $v['location'], $v['partner_since'], $v['website'], $v['blurb'], $v['is_featured'], $v['is_media_partner'], $v['status'], $v['sort_order']]);
            json(['id' => (int) db()->lastInsertId(), 'message' => 'Partner created.'], 201);
        }

        case $method === 'PUT' && preg_match('#^admin/partner/(\d+)$#', $route, $m) === 1: {
            require_admin();
            partners_ensure_schema();
            $v = partner_values_from_body(body());
            if ($v['name'] === '') json(['error' => 'Partner name is required.'], 422);
            $stmt = db()->prepare(
                'UPDATE partners SET name=?, logo_url=?, partner_type=?, industry=?, borough=?, county=?, location=?, partner_since=?, website=?, blurb=?, is_featured=?, is_media_partner=?, status=?, sort_order=? WHERE id=?'
            );
            $stmt->execute([$v['name'], $v['logo_url'], $v['partner_type'], $v['industry'], $v['borough'], $v['county'], $v['location'], $v['partner_since'], $v['website'], $v['blurb'], $v['is_featured'], $v['is_media_partner'], $v['status'], $v['sort_order'], (int) $m[1]]);
            json(['message' => 'Partner updated.']);
        }

        case $method === 'DELETE' && preg_match('#^admin/partner/(\d+)$#', $route, $m) === 1: {
            require_admin();
            partners_ensure_schema();
            db()->prepare('DELETE FROM partners WHERE id = ?')->execute([(int) $m[1]]);
            json(['message' => 'Partner deleted.']);
        }

        /* ---------------- ADMIN ---------------- */
        case $key === 'GET admin/submissions': {
            require_admin();
            // Total counts for the content/commerce/engagement sections that are
            // otherwise loaded lazily by their own panels — lets the Overview show a
            // complete, clickable summary of every section. Defensive against a
            // missing table (returns 0) so a not-yet-created table never 500s.
            $countOf = static function (string $table): int {
                try { return (int) db()->query("SELECT COUNT(*) FROM `$table`")->fetchColumn(); }
                catch (Throwable $e) { return 0; }
            };
            json([
                'requests'    => db()->query('SELECT * FROM requests ORDER BY created_at DESC LIMIT 200')->fetchAll(),
                'subscribers' => db()->query('SELECT * FROM subscribers ORDER BY created_at DESC LIMIT 200')->fetchAll(),
                'contacts'    => db()->query('SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 200')->fetchAll(),
                'members'     => db()->query('SELECT id, full_name, email, role, approval_status, approval_note, approval_reviewed_at, created_at, updated_at FROM users ORDER BY CASE approval_status WHEN "pending" THEN 0 WHEN "rejected" THEN 1 ELSE 2 END, created_at DESC LIMIT 200')->fetchAll(),
                'orders'      => db()->query('SELECT * FROM orders ORDER BY created_at DESC LIMIT 200')->fetchAll(),
                'counts'      => [
                    'awards'       => $countOf('awards'),
                    'events'       => $countOf('events'),
                    'blog'         => $countOf('posts'),
                    'testimonials' => $countOf('testimonials'),
                    'media'        => $countOf('media_items'),
                    'inventory'    => $countOf('store_inventory'),
                    'community'    => $countOf('community_threads'),
                    'rsvps'        => $countOf('event_rsvps'),
                    'sponsors'     => $countOf('sponsor_applications'),
                    'gallery'      => $countOf('gallery_submission_files'),
                ],
            ]);
        }

        case $key === 'GET admin/sponsorship/current/applications': {
            require_admin();
            sponsor_ensure_schema();
            $program = sponsor_current_program();
            $stmt = db()->prepare(
                'SELECT sa.*, sp.name AS program_name, sp.edition_name AS program_edition_name,
                        sl.minimum_amount AS level_minimum_amount, sl.sort_order AS level_sort_order,
                        reviewer.full_name AS reviewed_by_name
                 FROM sponsor_applications sa
                 INNER JOIN sponsor_programs sp ON sp.id = sa.program_id
                 LEFT JOIN sponsorship_levels sl
                   ON sl.program_id = sa.program_id AND sl.slug = sa.sponsorship_level_slug
                 LEFT JOIN users reviewer ON reviewer.id = sa.reviewed_by_user_id
                 WHERE sa.program_id = ?
                 ORDER BY sa.created_at DESC, sa.id DESC'
            );
            $stmt->execute([(int) $program['id']]);

            json([
                'program' => [
                    'id' => (int) $program['id'],
                    'slug' => (string) $program['slug'],
                    'name' => (string) $program['name'],
                    'edition_name' => $program['edition_name'],
                    'headline' => (string) $program['headline'],
                    'subheadline' => (string) $program['subheadline'],
                    'registration_opens' => $program['registration_opens'],
                    'winners_announced' => $program['winners_announced'],
                    'school_impact_grant_amount' => (float) $program['school_impact_grant_amount'],
                    'student_scholarship_amount' => (float) $program['student_scholarship_amount'],
                    'educator_award_label' => (string) $program['educator_award_label'],
                    'age_range' => (string) $program['age_range'],
                    'grade_range' => (string) $program['grade_range'],
                    'is_active' => (int) $program['is_active'],
                    'levels' => sponsor_program_levels((int) $program['id']),
                ],
                'applications' => array_map('sponsor_application_admin_row', $stmt->fetchAll()),
                'paymentInstructions' => sponsor_payment_instruction_lines(),
                'paymentStatusOptions' => sponsor_payment_status_options(),
                'approvalStatusOptions' => sponsor_approval_status_options(),
            ]);
        }

        case $key === 'GET admin/gallery/submissions': {
            require_admin();
            gallery_ensure_schema();

            $submissions = db()->query(
                'SELECT id, user_id, submitter_name, submitter_email, organization, message, overall_status, created_at, updated_at
                 FROM gallery_submissions
                 ORDER BY created_at DESC, id DESC'
            )->fetchAll();
            $files = db()->query(
                'SELECT f.id, f.submission_id, f.original_name, f.display_title, f.file_url, f.mime_type, f.media_kind,
                        f.size_bytes, f.approval_status, f.reviewed_by_user_id, f.reviewed_by_name, f.reviewed_at,
                        f.approved_at, f.rejected_at, f.created_at, f.updated_at
                 FROM gallery_submission_files f
                 ORDER BY f.created_at ASC, f.id ASC'
            )->fetchAll();

            $fileMap = [];
            foreach ($files as $file) {
                $sid = (int) $file['submission_id'];
                if (!isset($fileMap[$sid])) {
                    $fileMap[$sid] = [];
                }
                $fileMap[$sid][] = [
                    'id' => (int) $file['id'],
                    'submission_id' => $sid,
                    'original_name' => (string) $file['original_name'],
                    'display_title' => (string) $file['display_title'],
                    'file_url' => (string) $file['file_url'],
                    'mime_type' => (string) $file['mime_type'],
                    'media_kind' => (string) $file['media_kind'],
                    'size_bytes' => (int) $file['size_bytes'],
                    'approval_status' => (string) $file['approval_status'],
                    'reviewed_by_user_id' => isset($file['reviewed_by_user_id']) && $file['reviewed_by_user_id'] !== null ? (int) $file['reviewed_by_user_id'] : null,
                    'reviewed_by_name' => $file['reviewed_by_name'] ?: null,
                    'reviewed_at' => $file['reviewed_at'] ?? null,
                    'approved_at' => $file['approved_at'] ?? null,
                    'rejected_at' => $file['rejected_at'] ?? null,
                    'created_at' => $file['created_at'] ?? null,
                    'updated_at' => $file['updated_at'] ?? null,
                ];
            }

            $rows = [];
            foreach ($submissions as $submission) {
                $rows[] = gallery_admin_submission_row($submission, $fileMap[(int) $submission['id']] ?? []);
            }

            json([
                'submissions' => $rows,
                'counts' => [
                    'submissions' => count($rows),
                    'files' => count($files),
                    'pending' => count(array_filter($files, static fn(array $row): bool => (string) $row['approval_status'] === 'pending_review')),
                    'approved' => count(array_filter($files, static fn(array $row): bool => (string) $row['approval_status'] === 'approved')),
                    'rejected' => count(array_filter($files, static fn(array $row): bool => (string) $row['approval_status'] === 'rejected')),
                ],
            ]);
        }

        case $key === 'GET admin/analytics': {
            require_admin();
            $count = static fn(string $sql): int => (int) db()->query($sql)->fetchColumn();
            $series = static function (string $sql): array {
                return array_map(
                    static fn(array $row): array => ['label' => (string) $row['label'], 'value' => (int) $row['value']],
                    db()->query($sql)->fetchAll()
                );
            };

            // Website traffic (first-party page views). Ensure the table exists before querying
            // so the panel works even before db/update.sql has been run / before any visit.
            site_visits_ensure_schema();
            $dailyTraffic = array_map(
                static fn(array $r): array => [
                    'label'  => (string) $r['d'],
                    'value'  => (int) $r['visits'],
                    'unique' => (int) $r['uniques'],
                ],
                db()->query(
                    'SELECT DATE(created_at) AS d, COUNT(*) AS visits, COUNT(DISTINCT visitor_token) AS uniques
                     FROM site_visits
                     WHERE created_at >= (CURDATE() - INTERVAL 29 DAY)
                     GROUP BY DATE(created_at) ORDER BY d ASC'
                )->fetchAll()
            );

            json([
                'totals' => [
                    'users'        => $count('SELECT COUNT(*) FROM users'),
                    'members'      => $count("SELECT COUNT(*) FROM users WHERE role = 'member' AND approval_status = 'approved'"),
                    'vip'          => $count("SELECT COUNT(*) FROM users WHERE role = 'vip'"),
                    'admin'        => $count("SELECT COUNT(*) FROM users WHERE role IN ('admin','super_admin','editor')"),
                    // Ecosystem roles (mission control) — one count each.
                    'businesses'   => $count("SELECT COUNT(*) FROM users WHERE role = 'business'"),
                    'sponsors'     => $count("SELECT COUNT(*) FROM users WHERE role = 'sponsor'"),
                    'partners'     => $count("SELECT COUNT(*) FROM users WHERE role = 'partner'"),
                    'media_accounts' => $count("SELECT COUNT(*) FROM users WHERE role = 'media'"),
                    'volunteers'   => $count("SELECT COUNT(*) FROM users WHERE role = 'volunteer'"),
                    'pending_accounts' => $count("SELECT COUNT(*) FROM users WHERE approval_status = 'pending'"),
                    'approved_accounts' => $count("SELECT COUNT(*) FROM users WHERE approval_status = 'approved'"),
                    'rejected_accounts' => $count("SELECT COUNT(*) FROM users WHERE approval_status = 'rejected'"),
                    'requests'     => $count('SELECT COUNT(*) FROM requests'),
                    'orders'       => $count('SELECT COUNT(*) FROM orders'),
                    'revenue'      => round((float) db()->query('SELECT COALESCE(SUM(total),0) FROM orders')->fetchColumn(), 2),
                    'subscribers'   => $count('SELECT COUNT(*) FROM subscribers'),
                    'contacts'      => $count('SELECT COUNT(*) FROM contact_messages'),
                    'events'        => $count('SELECT COUNT(*) FROM events'),
                    'posts'         => $count('SELECT COUNT(*) FROM posts'),
                    'awards'        => $count('SELECT COUNT(*) FROM awards'),
                    'testimonials'   => $count('SELECT COUNT(*) FROM testimonials'),
                    'media'         => $count('SELECT COUNT(*) FROM media_items'),
                    'community_threads' => $count('SELECT COUNT(*) FROM community_threads'),
                    'community_comments' => $count('SELECT COUNT(*) FROM community_comments'),
                    'event_rsvps'   => $count('SELECT COUNT(*) FROM event_rsvps'),
                    'inventory_items'=> $count('SELECT COUNT(*) FROM store_inventory'),
                    'low_stock'     => $count('SELECT COUNT(*) FROM store_inventory WHERE stock > 0 AND stock <= low_stock_threshold'),
                ],
                'request_types'   => $series('SELECT request_type AS label, COUNT(*) AS value FROM requests GROUP BY request_type ORDER BY value DESC, label ASC'),
                'request_statuses'=> $series('SELECT status AS label, COUNT(*) AS value FROM requests GROUP BY status ORDER BY value DESC, label ASC'),
                'order_statuses'  => $series('SELECT status AS label, COUNT(*) AS value FROM orders GROUP BY status ORDER BY value DESC, label ASC'),
                'content_mix'     => [
                    ['label' => 'Posts', 'value' => $count('SELECT COUNT(*) FROM posts')],
                    ['label' => 'Events', 'value' => $count('SELECT COUNT(*) FROM events')],
                    ['label' => 'Awards', 'value' => $count('SELECT COUNT(*) FROM awards')],
                    ['label' => 'Testimonials', 'value' => $count('SELECT COUNT(*) FROM testimonials')],
                    ['label' => 'Media', 'value' => $count('SELECT COUNT(*) FROM media_items')],
                    ['label' => 'Community', 'value' => $count('SELECT COUNT(*) FROM community_threads')],
                    ['label' => 'RSVPs', 'value' => $count('SELECT COUNT(*) FROM event_rsvps')],
                ],
                'traffic' => [
                    'total'        => $count('SELECT COUNT(*) FROM site_visits'),
                    'today'        => $count('SELECT COUNT(*) FROM site_visits WHERE DATE(created_at) = CURDATE()'),
                    'last_7'       => $count('SELECT COUNT(*) FROM site_visits WHERE created_at >= (NOW() - INTERVAL 7 DAY)'),
                    'last_30'      => $count('SELECT COUNT(*) FROM site_visits WHERE created_at >= (NOW() - INTERVAL 30 DAY)'),
                    'unique_total' => $count('SELECT COUNT(DISTINCT visitor_token) FROM site_visits'),
                    'unique_today' => $count('SELECT COUNT(DISTINCT visitor_token) FROM site_visits WHERE DATE(created_at) = CURDATE()'),
                    'unique_30'    => $count('SELECT COUNT(DISTINCT visitor_token) FROM site_visits WHERE created_at >= (NOW() - INTERVAL 30 DAY)'),
                    // Repeat vs new visitors: group by visitor, count how many came back more than once.
                    'repeated_visitors' => $count('SELECT COUNT(*) FROM (SELECT visitor_token FROM site_visits GROUP BY visitor_token HAVING COUNT(*) > 1) t'),
                    'new_visitors'      => $count('SELECT COUNT(*) FROM (SELECT visitor_token FROM site_visits GROUP BY visitor_token HAVING COUNT(*) = 1) t'),
                    'daily'        => $dailyTraffic,
                    'top_pages'    => $series('SELECT path AS label, COUNT(*) AS value FROM site_visits WHERE created_at >= (NOW() - INTERVAL 30 DAY) GROUP BY path ORDER BY value DESC, label ASC LIMIT 8'),
                    'top_referrers' => $series("SELECT COALESCE(NULLIF(referrer,''),'(direct)') AS label, COUNT(*) AS value FROM site_visits WHERE created_at >= (NOW() - INTERVAL 30 DAY) GROUP BY label ORDER BY value DESC, label ASC LIMIT 8"),
                ],
            ]);
        }

        // Drill-down: list individual visitors (grouped by their first-party token),
        // with how many times each visited and when. Paginated, 10 per page.
        case $key === 'GET admin/traffic/visitors': {
            require_admin();
            site_visits_ensure_schema();
            $scope = (string) ($_GET['scope'] ?? 'all');
            $having = $scope === 'repeat' ? 'HAVING COUNT(*) > 1' : ($scope === 'new' ? 'HAVING COUNT(*) = 1' : '');
            $perPage = 10;
            $page = max(1, (int) ($_GET['page'] ?? 1));
            $offset = ($page - 1) * $perPage;
            $total = (int) db()->query("SELECT COUNT(*) FROM (SELECT visitor_token FROM site_visits GROUP BY visitor_token $having) t")->fetchColumn();
            $rows = db()->query(
                "SELECT visitor_token AS token,
                        COUNT(*) AS visits,
                        MAX(user_id) AS user_id,
                        UNIX_TIMESTAMP(MIN(created_at)) AS first_seen,
                        UNIX_TIMESTAMP(MAX(created_at)) AS last_seen,
                        SUBSTRING_INDEX(GROUP_CONCAT(path ORDER BY created_at DESC SEPARATOR '\\n'), '\\n', 1) AS last_path
                 FROM site_visits
                 GROUP BY visitor_token $having
                 ORDER BY last_seen DESC
                 LIMIT $perPage OFFSET $offset"
            )->fetchAll();
            // Attach the logged-in identity (name/email/role) for visitors who signed in.
            $uids = array_values(array_unique(array_filter(array_map(static fn(array $r): int => (int) ($r['user_id'] ?? 0), $rows))));
            $umap = [];
            if ($uids) {
                $in = implode(',', array_fill(0, count($uids), '?'));
                $us = db()->prepare("SELECT id, full_name, email, role FROM users WHERE id IN ($in)");
                $us->execute($uids);
                foreach ($us->fetchAll() as $u) { $umap[(int) $u['id']] = $u; }
            }
            foreach ($rows as &$r) {
                $u = $umap[(int) ($r['user_id'] ?? 0)] ?? null;
                $r['user_name'] = $u['full_name'] ?? null;
                $r['user_email'] = $u['email'] ?? null;
                $r['user_role'] = $u['role'] ?? null;
            }
            unset($r);
            json([
                'visitors' => $rows ?: [],
                'scope' => $scope,
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => (int) max(1, (int) ceil($total / $perPage)),
            ]);
        }

        // One visitor's full visit timeline (each page view: when, which page, referrer).
        case $key === 'GET admin/traffic/visitor': {
            require_admin();
            site_visits_ensure_schema();
            $token = (string) ($_GET['token'] ?? '');
            if ($token === '') {
                json(['error' => 'Missing visitor token.'], 422);
            }
            $stmt = db()->prepare(
                "SELECT UNIX_TIMESTAMP(created_at) AS ts, path, referrer, user_agent
                 FROM site_visits WHERE visitor_token = ? ORDER BY created_at DESC LIMIT 200"
            );
            $stmt->execute([$token]);
            // If this visitor ever signed in, surface who they are.
            $uidStmt = db()->prepare('SELECT MAX(user_id) FROM site_visits WHERE visitor_token = ?');
            $uidStmt->execute([$token]);
            $uid = (int) $uidStmt->fetchColumn();
            $user = null;
            if ($uid > 0) {
                $us = db()->prepare('SELECT full_name, email, role FROM users WHERE id = ? LIMIT 1');
                $us->execute([$uid]);
                $user = $us->fetch() ?: null;
            }
            json(['token' => $token, 'user' => $user, 'visits' => $stmt->fetchAll() ?: []]);
        }

        case $method === 'PUT' && preg_match('#^admin/user/(\d+)/approval$#', $route, $m) === 1: {
            $admin = require_admin();
            $status = field(body(), 'approval_status');
            $note = field(body(), 'approval_note');
            if (!in_array($status, ['pending', 'approved', 'rejected'], true)) {
                json(['error' => 'Invalid approval status.'], 422);
            }

            $reviewedAt = in_array($status, ['approved', 'rejected'], true) ? date('Y-m-d H:i:s') : null;
            $reviewedBy = in_array($status, ['approved', 'rejected'], true) ? (int) $admin['id'] : null;
            $approvalNote = $status === 'pending' ? null : ($note !== '' ? $note : null);

            $stmt = db()->prepare(
                'UPDATE users
                 SET approval_status = ?,
                     approval_note = ?,
                     approval_reviewed_by_user_id = ?,
                     approval_reviewed_at = ?,
                     updated_at = NOW()
                 WHERE id = ?'
            );
            $stmt->execute([$status, $approvalNote, $reviewedBy, $reviewedAt, (int) $m[1]]);

            $fresh = db()->prepare('SELECT id, full_name, email, role, approval_status, approval_note, approval_reviewed_at, created_at, updated_at FROM users WHERE id = ? LIMIT 1');
            $fresh->execute([(int) $m[1]]);
            $updatedUser = $fresh->fetch();

            // Keep the New School entity status in sync so an approved school account
            // surfaces in the public "Select School" dropdown (which lists status =
            // "approved" schools only). Without this the school stays "registered".
            if ($updatedUser && (string) ($updatedUser['role'] ?? '') === 'school') {
                $schoolStatus = $status === 'approved'
                    ? 'approved'
                    : ($status === 'rejected' ? 'rejected' : 'registered');
                try {
                    $schoolSync = db()->prepare('UPDATE new_school_schools SET status = ?, updated_at = NOW() WHERE user_id = ?');
                    $schoolSync->execute([$schoolStatus, (int) $m[1]]);
                } catch (\Throwable $e) {
                    // Never let the school-status sync break the core account approval.
                }
            }

            // Let the member know the outcome of their account review.
            if ($updatedUser && in_array($status, ['approved', 'rejected'], true)) {
                try {
                    $memberName = (string) ($updatedUser['full_name'] ?? '');
                    $memberRole = (string) ($updatedUser['role'] ?? '');
                    $built = $status === 'approved'
                        ? email_account_approved($memberName, $memberRole)
                        : email_account_rejected($memberName, $memberRole, (string) ($approvalNote ?? ''));
                    queue_themed_mail('account_' . $status, (string) ($updatedUser['email'] ?? ''), $built);
                } catch (\Throwable $e) {
                    // Never let a mail failure break the approval action.
                }
            }

            json([
                'message' => 'Approval updated.',
                'user' => $updatedUser ?: null,
            ]);
        }

        case $method === 'PUT' && preg_match('#^admin/gallery/file/(\d+)$#', $route, $m) === 1: {
            $admin = require_admin();
            gallery_ensure_schema();
            $status = field(body(), 'approval_status');
            if (!in_array($status, ['approved', 'rejected'], true)) {
                json(['error' => 'Invalid gallery approval status.'], 422);
            }
            $stmt = db()->prepare('SELECT id, submission_id FROM gallery_submission_files WHERE id = ? LIMIT 1');
            $stmt->execute([(int) $m[1]]);
            $file = $stmt->fetch();
            if (!$file) {
                json(['error' => 'Gallery file not found.'], 404);
            }
            $approvedAt = $status === 'approved' ? date('Y-m-d H:i:s') : null;
            $rejectedAt = $status === 'rejected' ? date('Y-m-d H:i:s') : null;
            db()->prepare(
                'UPDATE gallery_submission_files
                 SET approval_status = ?, reviewed_by_user_id = ?, reviewed_by_name = ?, reviewed_at = NOW(),
                     approved_at = ?, rejected_at = ?, updated_at = NOW()
                 WHERE id = ?'
            )->execute([
                $status,
                (int) $admin['id'],
                (string) ($admin['full_name'] ?? 'Admin'),
                $approvedAt,
                $rejectedAt,
                (int) $m[1],
            ]);
            $overall = gallery_recompute_submission_status((int) $file['submission_id']);
            json(['message' => 'Gallery file updated.', 'overall_status' => $overall]);
        }

        case $method === 'PUT' && preg_match('#^admin/request/(\d+)$#', $route, $m) === 1: {
            require_admin();
            $status = field(body(), 'status');
            if (!in_array($status, ['new', 'reviewed', 'approved', 'closed'], true)) {
                json(['error' => 'Invalid status.'], 422);
            }
            $stmt = db()->prepare('UPDATE requests SET status = ? WHERE id = ?');
            $stmt->execute([$status, (int) $m[1]]);
            json(['message' => 'Updated.']);
        }

        case $method === 'PUT' && preg_match('#^admin/order/(\d+)$#', $route, $m) === 1: {
            require_admin();
            $status = field(body(), 'status');
            if (!in_array($status, ['paid', 'pending', 'fulfilled', 'cancelled'], true)) {
                json(['error' => 'Invalid status.'], 422);
            }
            // M-3: when an order is cancelled, return its items to inventory (once).
            $pdo = db();
            $pdo->beginTransaction();
            try {
                $cur = $pdo->prepare('SELECT * FROM orders WHERE id = ? LIMIT 1 FOR UPDATE');
                $cur->execute([(int) $m[1]]);
                $order = $cur->fetch();
                if (!$order) { $pdo->rollBack(); json(['error' => 'Order not found.'], 404); }
                if ($status === 'cancelled' && (string) $order['status'] !== 'cancelled') {
                    storefront_restock_order($pdo, $order);
                }
                $pdo->prepare('UPDATE orders SET status = ? WHERE id = ?')->execute([$status, (int) $m[1]]);
                $pdo->commit();
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                throw $e;
            }
            json(['message' => 'Order updated.']);
        }

        /* ---------------- ADMIN: DATA-LIST DELETES (CRUD) ---------------- */
        case $method === 'DELETE' && preg_match('#^admin/request/(\d+)$#', $route, $m) === 1: {
            require_admin();
            db()->prepare('DELETE FROM requests WHERE id = ?')->execute([(int) $m[1]]);
            json(['message' => 'Request deleted.']);
        }

        case $method === 'DELETE' && preg_match('#^admin/order/(\d+)$#', $route, $m) === 1: {
            require_admin();
            db()->prepare('DELETE FROM orders WHERE id = ?')->execute([(int) $m[1]]);
            json(['message' => 'Order deleted.']);
        }

        case $method === 'DELETE' && preg_match('#^admin/contact/(\d+)$#', $route, $m) === 1: {
            require_admin();
            db()->prepare('DELETE FROM contact_messages WHERE id = ?')->execute([(int) $m[1]]);
            json(['message' => 'Contact message deleted.']);
        }

        case $method === 'DELETE' && preg_match('#^admin/subscriber/(\d+)$#', $route, $m) === 1: {
            require_admin();
            db()->prepare('DELETE FROM subscribers WHERE id = ?')->execute([(int) $m[1]]);
            json(['message' => 'Subscriber removed.']);
        }

        case $method === 'DELETE' && preg_match('#^admin/user/(\d+)$#', $route, $m) === 1: {
            $admin = require_admin();
            $targetId = (int) $m[1];
            if ($targetId === (int) $admin['id']) {
                json(['error' => 'You cannot delete your own account.'], 422);
            }
            $lookup = db()->prepare('SELECT id, role FROM users WHERE id = ? LIMIT 1');
            $lookup->execute([$targetId]);
            $target = $lookup->fetch();
            if (!$target) {
                json(['error' => 'User not found.'], 404);
            }
            if (in_array((string) $target['role'], ['admin', 'super_admin', 'editor'], true)) {
                json(['error' => 'Administrator accounts are protected and cannot be deleted here.'], 403);
            }
            try {
                db()->prepare('DELETE FROM users WHERE id = ?')->execute([$targetId]);
            } catch (\Throwable $e) {
                // Linked New School records (student/teacher/school) may block a hard delete.
                json(['error' => 'This account has linked records and cannot be deleted. Reject it instead.'], 409);
            }
            json(['message' => 'Account deleted.']);
        }

        case $method === 'DELETE' && preg_match('#^admin/event-rsvp/(\d+)$#', $route, $m) === 1: {
            require_admin();
            db()->prepare('DELETE FROM event_rsvps WHERE id = ?')->execute([(int) $m[1]]);
            json(['message' => 'RSVP deleted.']);
        }

        case $method === 'PUT' && preg_match('#^admin/sponsorship/application/(\d+)$#', $route, $m) === 1: {
            $admin = require_admin();
            sponsor_ensure_schema();
            $id = (int) $m[1];
            $b = body();

            $existingStmt = db()->prepare('SELECT * FROM sponsor_applications WHERE id = ? LIMIT 1');
            $existingStmt->execute([$id]);
            $existing = $existingStmt->fetch();
            if (!$existing) {
                json(['error' => 'Sponsor application not found.'], 404);
            }

            $paymentStatus = field($b, 'payment_status') ?: (string) $existing['payment_status'];
            $approvalStatus = field($b, 'approval_status') ?: (string) $existing['approval_status'];
            $organizationType = field($b, 'organization_type') ?: (string) $existing['organization_type'];
            $levelSlug = field($b, 'sponsorship_level_slug') ?: (string) $existing['sponsorship_level_slug'];
            $levels = sponsor_level_index((int) $existing['program_id']);

            if (!in_array($paymentStatus, sponsor_payment_status_options(), true)) {
                json(['error' => 'Invalid payment status.'], 422);
            }
            if (!in_array($approvalStatus, sponsor_approval_status_options(), true)) {
                json(['error' => 'Invalid approval status.'], 422);
            }
            if (!in_array($organizationType, sponsor_organization_types(), true)) {
                json(['error' => 'Invalid organization type.'], 422);
            }
            if (!isset($levels[$levelSlug])) {
                json(['error' => 'Invalid sponsorship level.'], 422);
            }
            if ($approvalStatus === 'published' && $paymentStatus !== 'payment_confirmed') {
                json(['error' => 'Payment must be confirmed before publishing a sponsor.'], 422);
            }

            $level = $levels[$levelSlug];
            $customAmount = !empty($b['custom_amount']) || $levelSlug === 'custom_sponsorship';
            $submittedAmount = isset($b['sponsorship_amount']) ? (float) $b['sponsorship_amount'] : (float) $existing['sponsorship_amount'];
            $minimumAmount = (float) $level['minimum_amount'];
            $amount = $levelSlug === 'custom_sponsorship'
                ? $submittedAmount
                : max($minimumAmount, $submittedAmount > 0 ? $submittedAmount : $minimumAmount);
            if ($levelSlug === 'custom_sponsorship' && $amount <= 0) {
                json(['error' => 'Custom sponsorship amount must be greater than zero.'], 422);
            }

            $interests = is_array($b['interests'] ?? null)
                ? array_values(array_filter(array_map('strval', $b['interests'])))
                : sponsor_decode_json($existing['interests_json'] ?? null);
            $allowedInterests = sponsor_interest_options();
            $interests = array_values(array_filter($interests, static fn(string $interest): bool => in_array($interest, $allowedInterests, true)));

            $organizationName = field($b, 'organization_name') ?: (string) $existing['organization_name'];
            $contactPerson = field($b, 'contact_person') ?: (string) $existing['contact_person'];
            $titlePosition = field($b, 'title_position') ?: (string) $existing['title_position'];
            $emailAddress = field($b, 'email_address') !== '' ? require_email(field($b, 'email_address')) : (string) $existing['email_address'];
            $phoneNumber = field($b, 'phone_number') ?: (string) $existing['phone_number'];
            $websiteValue = array_key_exists('website', $b) ? sponsor_normalize_url(field($b, 'website')) : ($existing['website'] ?: null);
            $streetAddress = field($b, 'street_address') ?: (string) $existing['street_address'];
            $city = field($b, 'city') ?: (string) $existing['city'];
            $state = field($b, 'state') ?: (string) $existing['state'];
            $zipCode = field($b, 'zip_code') ?: (string) $existing['zip_code'];
            $logoUrl = array_key_exists('logo_url', $b) ? field($b, 'logo_url') : (string) ($existing['logo_url'] ?? '');
            $companyBio = field($b, 'company_bio') ?: (string) $existing['company_bio'];
            $supportReason = field($b, 'support_reason') ?: (string) $existing['support_reason'];
            $publicDescription = array_key_exists('public_description', $b)
                ? field($b, 'public_description')
                : (string) ($existing['public_description'] ?? '');
            $adminNotes = array_key_exists('admin_notes', $b)
                ? field($b, 'admin_notes')
                : (string) ($existing['admin_notes'] ?? '');

            if ($logoUrl !== '' && !preg_match('#^/api/uploads/sponsors/#', $logoUrl)) {
                json(['error' => 'Logo upload is invalid.'], 422);
            }

            $reviewedAt = in_array($approvalStatus, ['approved', 'rejected', 'published'], true) ? date('Y-m-d H:i:s') : null;
            $approvedAt = in_array($approvalStatus, ['approved', 'published'], true)
                ? (($existing['approved_at'] ?? null) ?: date('Y-m-d H:i:s'))
                : null;
            $rejectedAt = $approvalStatus === 'rejected' ? (($existing['rejected_at'] ?? null) ?: date('Y-m-d H:i:s')) : null;
            $publishedAt = $approvalStatus === 'published' ? (($existing['published_at'] ?? null) ?: date('Y-m-d H:i:s')) : null;
            $checkReceivedAt = in_array($paymentStatus, ['check_received', 'payment_confirmed'], true)
                ? (($existing['check_received_at'] ?? null) ?: date('Y-m-d H:i:s'))
                : null;
            $paymentConfirmedAt = $paymentStatus === 'payment_confirmed'
                ? (($existing['payment_confirmed_at'] ?? null) ?: date('Y-m-d H:i:s'))
                : null;
            $reviewedBy = in_array($approvalStatus, ['approved', 'rejected', 'published'], true) ? (int) $admin['id'] : null;

            $stmt = db()->prepare(
                'UPDATE sponsor_applications
                 SET organization_name = ?, contact_person = ?, title_position = ?, email_address = ?, phone_number = ?,
                     website = ?, street_address = ?, city = ?, state = ?, zip_code = ?, organization_type = ?,
                     logo_url = ?, company_bio = ?, support_reason = ?, sponsorship_level_slug = ?, sponsorship_level_name = ?,
                     sponsorship_amount = ?, custom_amount = ?, interests_json = ?, public_description = ?, admin_notes = ?,
                     payment_status = ?, approval_status = ?, reviewed_by_user_id = ?, reviewed_at = ?, approved_at = ?,
                     rejected_at = ?, check_received_at = ?, payment_confirmed_at = ?, published_at = ?, updated_at = NOW()
                 WHERE id = ?'
            );
            $stmt->execute([
                $organizationName,
                $contactPerson,
                $titlePosition,
                $emailAddress,
                $phoneNumber,
                $websiteValue,
                $streetAddress,
                $city,
                $state,
                $zipCode,
                $organizationType,
                $logoUrl !== '' ? $logoUrl : null,
                $companyBio,
                $supportReason,
                $levelSlug,
                $level['name'],
                $amount,
                $customAmount ? 1 : 0,
                json_encode($interests, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                $publicDescription !== '' ? $publicDescription : null,
                $adminNotes !== '' ? $adminNotes : null,
                $paymentStatus,
                $approvalStatus,
                $reviewedBy,
                $reviewedAt,
                $approvedAt,
                $rejectedAt,
                $checkReceivedAt,
                $paymentConfirmedAt,
                $publishedAt,
                $id,
            ]);

            $fresh = db()->prepare(
                'SELECT sa.*, sp.name AS program_name, sp.edition_name AS program_edition_name,
                        sl.minimum_amount AS level_minimum_amount, sl.sort_order AS level_sort_order,
                        reviewer.full_name AS reviewed_by_name
                 FROM sponsor_applications sa
                 INNER JOIN sponsor_programs sp ON sp.id = sa.program_id
                 LEFT JOIN sponsorship_levels sl
                   ON sl.program_id = sa.program_id AND sl.slug = sa.sponsorship_level_slug
                 LEFT JOIN users reviewer ON reviewer.id = sa.reviewed_by_user_id
                 WHERE sa.id = ?
                 LIMIT 1'
            );
            $fresh->execute([$id]);

            json([
                'message' => 'Sponsor application updated.',
                'application' => sponsor_application_admin_row($fresh->fetch() ?: []),
            ]);
        }

        case $method === 'DELETE' && preg_match('#^admin/sponsorship/application/(\d+)$#', $route, $m) === 1: {
            require_admin();
            sponsor_ensure_schema();
            $stmt = db()->prepare('DELETE FROM sponsor_applications WHERE id = ?');
            $stmt->execute([(int) $m[1]]);
            json(['message' => 'Sponsor application removed.']);
        }

        case $method === 'GET' && preg_match('#^admin/user/(\d+)$#', $route, $m) === 1: {
            require_admin();
            $detail = admin_user_detail_payload((int) $m[1]);
            if (!$detail) {
                json(['error' => 'User not found.'], 404);
            }
            json($detail);
        }

        case $key === 'POST admin/impersonate': {
            $admin = require_admin();
            $targetId = (int) (body()['user_id'] ?? 0);
            if ($targetId <= 0) {
                json(['error' => 'A user must be selected.'], 422);
            }
            if ($targetId === (int) $admin['id']) {
                json(['error' => 'You are already signed in as this account.'], 422);
            }
            $stmt = db()->prepare('SELECT id, full_name, email, role FROM users WHERE id = ? LIMIT 1');
            $stmt->execute([$targetId]);
            $target = $stmt->fetch();
            if (!$target) {
                json(['error' => 'User not found.'], 404);
            }
            // L3: never impersonate an admin-tier account (prevents a lower admin/editor
            // from assuming another admin or super_admin's session).
            if (in_array((string) $target['role'], ['admin', 'super_admin', 'editor'], true)) {
                json(['error' => 'Administrator accounts cannot be impersonated.'], 403);
            }
            start_impersonation((int) $admin['id'], $targetId);
            json([
                'message' => 'Now viewing as ' . $target['full_name'] . '.',
                'user' => current_user(),
                'impersonating' => true,
                'impersonator' => impersonator_user(),
            ]);
        }

        case $key === 'POST admin/impersonate/stop': {
            // No require_admin(): the live session is the impersonated user. The
            // parked impersonator id is the only thing that authorizes the restore.
            if (!stop_impersonation()) {
                json(['error' => 'No active impersonation session.'], 400);
            }
            json([
                'message' => 'Returned to your admin account.',
                'user' => current_user(),
                'impersonating' => false,
                'impersonator' => null,
            ]);
        }

        case $key === 'GET admin/event-rsvps': {
            require_admin();
            $rows = db()->query(
                'SELECT r.id, r.confirmation_code, r.status, r.notes, r.full_name, r.email, r.created_at,
                        e.title AS event_title, e.location, e.event_date
                 FROM event_rsvps r
                 INNER JOIN events e ON e.id = r.event_id
                 ORDER BY r.created_at DESC'
            )->fetchAll();
            json(['rsvps' => $rows]);
        }

        case $method === 'PUT' && preg_match('#^admin/event-rsvp/(\d+)$#', $route, $m) === 1: {
            require_admin();
            $status = field(body(), 'status');
            if (!in_array($status, ['going', 'maybe', 'interested', 'cancelled'], true)) {
                json(['error' => 'Invalid status.'], 422);
            }
            $stmt = db()->prepare('UPDATE event_rsvps SET status = ? WHERE id = ?');
            $stmt->execute([$status, (int) $m[1]]);
            json(['message' => 'RSVP updated.']);
        }

        case $key === 'GET admin/inventory': {
            require_admin();
            json(['inventory' => storefront_inventory_rows(true)]);
        }

        case $method === 'PUT' && preg_match('#^admin/inventory/([a-z0-9_-]+)$#', $route, $m) === 1: {
            require_admin();
            $productId = $m[1];
            if (!storefront_inventory_has_catalog_columns()) {
                json(['error' => 'Run db/update.sql to enable merch product management.'], 409);
            }

            $b = body();
            $existingStmt = db()->prepare(
                'SELECT product_id, name, category, tagline, description, details, feature_list, spec_list, shipping_note,
                        image, price, stock, low_stock_threshold, restock_note, visibility, sort_order
                 FROM store_inventory
                 WHERE product_id = ?
                 LIMIT 1'
            );
            $existingStmt->execute([$productId]);
            $existing = $existingStmt->fetch() ?: [];
            $defaults = storefront_inventory_defaults();
            $fallback = $defaults[$productId] ?? [];

            $name = field($b, 'name');
            if ($name === '') {
                $name = trim((string) ($existing['name'] ?? $fallback['name'] ?? ''));
            }
            if ($name === '') {
                json(['error' => 'Product name is required.'], 422);
            }

            $category = field($b, 'category');
            if ($category === '') {
                $category = trim((string) ($existing['category'] ?? $fallback['category'] ?? ''));
            }

            $tagline = field($b, 'tagline');
            if ($tagline === '') {
                $tagline = trim((string) ($existing['tagline'] ?? $fallback['tagline'] ?? ''));
            }

            $description = field($b, 'description');
            if ($description === '') {
                $description = trim((string) ($existing['description'] ?? $fallback['description'] ?? ''));
            }

            $details = field($b, 'details');
            if ($details === '') {
                $details = trim((string) ($existing['details'] ?? $fallback['details'] ?? ''));
            }

            $featureList = field($b, 'feature_list');
            if ($featureList === '') {
                $featureList = trim((string) ($existing['feature_list'] ?? $fallback['feature_list'] ?? ''));
            }

            $specList = field($b, 'spec_list');
            if ($specList === '') {
                $specList = trim((string) ($existing['spec_list'] ?? $fallback['spec_list'] ?? ''));
            }

            $shippingNote = field($b, 'shipping_note');
            if ($shippingNote === '') {
                $shippingNote = trim((string) ($existing['shipping_note'] ?? $fallback['shipping_note'] ?? ''));
            }

            $image = field($b, 'image');
            if ($image === '') {
                $image = trim((string) ($existing['image'] ?? $fallback['image'] ?? ''));
            }

            if (array_key_exists('price', $b) && trim((string) $b['price']) !== '') {
                $price = (float) $b['price'];
            } elseif (isset($existing['price']) && $existing['price'] !== null && $existing['price'] !== '') {
                $price = (float) $existing['price'];
            } else {
                $price = (float) ($fallback['price'] ?? 0);
            }

            $stock = array_key_exists('stock', $b) && trim((string) $b['stock']) !== ''
                ? (int) $b['stock']
                : (int) ($existing['stock'] ?? ($fallback['stock'] ?? 0));

            $threshold = array_key_exists('low_stock_threshold', $b) && trim((string) $b['low_stock_threshold']) !== ''
                ? (int) $b['low_stock_threshold']
                : (int) ($existing['low_stock_threshold'] ?? ($fallback['threshold'] ?? 5));

            $visibility = field($b, 'visibility');
            if ($visibility === '') {
                $visibility = trim((string) ($existing['visibility'] ?? ($fallback['visibility'] ?? 'live')));
            }

            $sortOrder = array_key_exists('sort_order', $b) && trim((string) $b['sort_order']) !== ''
                ? (int) $b['sort_order']
                : (int) ($existing['sort_order'] ?? ($fallback['sort_order'] ?? 0));

            $note = field($b, 'restock_note');
            if ($note === '') {
                $note = trim((string) ($existing['restock_note'] ?? ($fallback['restock_note'] ?? '')));
            }

            if ($stock < 0 || $threshold < 0 || $sortOrder < 0) {
                json(['error' => 'Stock values must be zero or greater.'], 422);
            }
            if ($price < 0) {
                json(['error' => 'Price values must be zero or greater.'], 422);
            }
            if (!in_array($visibility, ['live', 'upcoming', 'hidden'], true)) {
                json(['error' => 'Invalid visibility status.'], 422);
            }

            $stmt = db()->prepare(
                'INSERT INTO store_inventory
                    (product_id, name, category, tagline, description, details, feature_list, spec_list, shipping_note, image, price, stock, low_stock_threshold, restock_note, visibility, sort_order)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    name = VALUES(name),
                    category = VALUES(category),
                    tagline = VALUES(tagline),
                    description = VALUES(description),
                    details = VALUES(details),
                    feature_list = VALUES(feature_list),
                    spec_list = VALUES(spec_list),
                    shipping_note = VALUES(shipping_note),
                    image = VALUES(image),
                    price = VALUES(price),
                    stock = VALUES(stock),
                    low_stock_threshold = VALUES(low_stock_threshold),
                    restock_note = VALUES(restock_note),
                    visibility = VALUES(visibility),
                    sort_order = VALUES(sort_order)'
            );
            $stmt->execute([
                $productId,
                $name,
                $category !== '' ? $category : null,
                $tagline !== '' ? $tagline : null,
                $description !== '' ? $description : null,
                $details !== '' ? $details : null,
                $featureList !== '' ? $featureList : null,
                $specList !== '' ? $specList : null,
                $shippingNote !== '' ? $shippingNote : null,
                $image !== '' ? $image : null,
                $price,
                $stock,
                $threshold,
                $note !== '' ? $note : null,
                $visibility,
                $sortOrder,
            ]);
            json(['message' => 'Inventory updated.']);
        }


        case $method === 'DELETE' && preg_match('#^admin/inventory/([a-z0-9_-]+)$#', $route, $m) === 1: {
            require_admin();
            if (!storefront_inventory_has_catalog_columns()) {
                json(['error' => 'Run db/update.sql to enable merch product management.'], 409);
            }
            $stmt = db()->prepare('DELETE FROM store_inventory WHERE product_id = ?');
            $stmt->execute([$m[1]]);
            json(['message' => 'Inventory item deleted.']);
        }

        case $key === 'GET admin/community': {
            require_admin();
            $threads = db()->query(
                'SELECT t.id, t.title, t.body, t.audience, t.author_name, t.is_pinned, t.created_at,
                        (SELECT COUNT(*) FROM community_comments c WHERE c.thread_id = t.id) AS comment_count
                 FROM community_threads t
                 ORDER BY t.is_pinned DESC, t.created_at DESC'
            )->fetchAll();
            $comments = db()->query(
                'SELECT c.id, c.thread_id, c.author_name, c.body, c.created_at
                 FROM community_comments c
                 ORDER BY c.created_at DESC'
            )->fetchAll();
            json(['threads' => $threads, 'comments' => $comments]);
        }

        case $method === 'PUT' && preg_match('#^admin/community/thread/(\d+)$#', $route, $m) === 1: {
            require_admin();
            $b = body();
            $title = field($b, 'title');
            $bodyText = field($b, 'body');
            $audience = field($b, 'audience') ?: 'public';
            if ($title === '') json(['error' => 'Title is required.'], 422);
            if ($bodyText === '') json(['error' => 'Body is required.'], 422);
            if (!in_array($audience, ['public', 'member', 'vip'], true)) {
                json(['error' => 'Invalid audience.'], 422);
            }
            $stmt = db()->prepare(
                'UPDATE community_threads SET title = ?, body = ?, audience = ?, is_pinned = ? WHERE id = ?'
            );
            $stmt->execute([
                $title,
                $bodyText,
                $audience,
                !empty($b['is_pinned']) ? 1 : 0,
                (int) $m[1],
            ]);
            json(['message' => 'Community thread updated.']);
        }

        case $method === 'DELETE' && preg_match('#^admin/community/thread/(\d+)$#', $route, $m) === 1: {
            require_admin();
            $stmt = db()->prepare('DELETE FROM community_threads WHERE id = ?');
            $stmt->execute([(int) $m[1]]);
            json(['message' => 'Community thread deleted.']);
        }

        case $method === 'DELETE' && preg_match('#^admin/community/comment/(\d+)$#', $route, $m) === 1: {
            require_admin();
            $stmt = db()->prepare('DELETE FROM community_comments WHERE id = ?');
            $stmt->execute([(int) $m[1]]);
            json(['message' => 'Community comment deleted.']);
        }

        /* ---------------- ADMIN: AWARDS CRUD ---------------- */
        case $key === 'GET admin/awards': {
            require_admin();
            $rows = db()->query(
                'SELECT id, title, year, level, presenter, short_text, description, image, is_featured, sort_order
                 FROM awards ORDER BY sort_order ASC'
            )->fetchAll();
            json(['awards' => $rows]);
        }

        case $key === 'POST admin/award': {
            require_admin();
            $b = body();
            $title = field($b, 'title');
            if ($title === '') json(['error' => 'Title is required.'], 422);
            $stmt = db()->prepare(
                'INSERT INTO awards (title, year, level, presenter, short_text, description, image, is_featured, sort_order)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([
                $title,
                field($b, 'year') ?: null,
                field($b, 'level') ?: null,
                field($b, 'presenter') ?: null,
                field($b, 'short_text') ?: null,
                field($b, 'description') ?: null,
                field($b, 'image') ?: null,
                !empty($b['is_featured']) ? 1 : 0,
                (int) ($b['sort_order'] ?? 0),
            ]);
            json(['id' => (int) db()->lastInsertId(), 'message' => 'Award created.'], 201);
        }

        case $method === 'PUT' && preg_match('#^admin/award/(\d+)$#', $route, $m) === 1: {
            require_admin();
            $b = body();
            $title = field($b, 'title');
            if ($title === '') json(['error' => 'Title is required.'], 422);
            $stmt = db()->prepare(
                'UPDATE awards SET title=?, year=?, level=?, presenter=?, short_text=?, description=?, image=?, is_featured=?, sort_order=?
                 WHERE id=?'
            );
            $stmt->execute([
                $title,
                field($b, 'year') ?: null,
                field($b, 'level') ?: null,
                field($b, 'presenter') ?: null,
                field($b, 'short_text') ?: null,
                field($b, 'description') ?: null,
                field($b, 'image') ?: null,
                !empty($b['is_featured']) ? 1 : 0,
                (int) ($b['sort_order'] ?? 0),
                (int) $m[1],
            ]);
            json(['message' => 'Award updated.']);
        }

        case $method === 'DELETE' && preg_match('#^admin/award/(\d+)$#', $route, $m) === 1: {
            require_admin();
            $stmt = db()->prepare('DELETE FROM awards WHERE id = ?');
            $stmt->execute([(int) $m[1]]);
            json(['message' => 'Award deleted.']);
        }

        /* ---------------- ADMIN: TESTIMONIALS CRUD ---------------- */
        case $key === 'GET admin/testimonials': {
            require_admin();
            $rows = db()->query(
                'SELECT id, quote, author_name, author_title, company, image, is_featured, sort_order, created_at
                 FROM testimonials ORDER BY is_featured DESC, sort_order ASC, created_at DESC'
            )->fetchAll();
            json(['testimonials' => $rows]);
        }

        case $key === 'POST admin/testimonial': {
            require_admin();
            $b = body();
            $quote = field($b, 'quote');
            $name  = field($b, 'author_name');
            if ($quote === '') json(['error' => 'Quote is required.'], 422);
            if ($name === '')  json(['error' => 'Author name is required.'], 422);
            $stmt = db()->prepare(
                'INSERT INTO testimonials (quote, author_name, author_title, company, image, is_featured, sort_order)
                 VALUES (?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([
                $quote,
                $name,
                field($b, 'author_title') ?: null,
                field($b, 'company') ?: null,
                field($b, 'image') ?: null,
                !empty($b['is_featured']) ? 1 : 0,
                (int) ($b['sort_order'] ?? 0),
            ]);
            json(['id' => (int) db()->lastInsertId(), 'message' => 'Testimonial created.'], 201);
        }

        case $method === 'PUT' && preg_match('#^admin/testimonial/(\d+)$#', $route, $m) === 1: {
            require_admin();
            $b = body();
            $quote = field($b, 'quote');
            $name  = field($b, 'author_name');
            if ($quote === '') json(['error' => 'Quote is required.'], 422);
            if ($name === '')  json(['error' => 'Author name is required.'], 422);
            $stmt = db()->prepare(
                'UPDATE testimonials SET quote=?, author_name=?, author_title=?, company=?, image=?, is_featured=?, sort_order=? WHERE id=?'
            );
            $stmt->execute([
                $quote,
                $name,
                field($b, 'author_title') ?: null,
                field($b, 'company') ?: null,
                field($b, 'image') ?: null,
                !empty($b['is_featured']) ? 1 : 0,
                (int) ($b['sort_order'] ?? 0),
                (int) $m[1],
            ]);
            json(['message' => 'Testimonial updated.']);
        }

        case $method === 'DELETE' && preg_match('#^admin/testimonial/(\d+)$#', $route, $m) === 1: {
            require_admin();
            $stmt = db()->prepare('DELETE FROM testimonials WHERE id = ?');
            $stmt->execute([(int) $m[1]]);
            json(['message' => 'Testimonial deleted.']);
        }

        /* ---------------- ADMIN: MEDIA CRUD ---------------- */
        case $key === 'GET admin/media': {
            require_admin();
            $rows = db()->query(
                'SELECT id, title, type, summary, body, image, link_url, published_at, is_featured, sort_order
                 FROM media_items ORDER BY is_featured DESC, sort_order ASC, published_at DESC, id DESC'
            )->fetchAll();
            json(['media' => $rows]);
        }

        case $key === 'POST admin/media': {
            require_admin();
            $b = body();
            $title = field($b, 'title');
            $type  = field($b, 'type');
            $allowedTypes = ['podcast', 'interview', 'tv', 'press_release', 'article', 'photo', 'video'];
            if ($title === '') json(['error' => 'Title is required.'], 422);
            if (!in_array($type, $allowedTypes, true)) json(['error' => 'Valid media type is required.'], 422);
            $stmt = db()->prepare(
                'INSERT INTO media_items (title, type, summary, body, image, link_url, published_at, is_featured, sort_order)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([
                $title,
                $type,
                field($b, 'summary') ?: null,
                field($b, 'body') ?: null,
                field($b, 'image') ?: null,
                field($b, 'link_url') ?: null,
                field($b, 'published_at') ?: null,
                !empty($b['is_featured']) ? 1 : 0,
                (int) ($b['sort_order'] ?? 0),
            ]);
            json(['id' => (int) db()->lastInsertId(), 'message' => 'Media item created.'], 201);
        }

        case $method === 'PUT' && preg_match('#^admin/media/(\d+)$#', $route, $m) === 1: {
            require_admin();
            $b = body();
            $title = field($b, 'title');
            $type  = field($b, 'type');
            $allowedTypes = ['podcast', 'interview', 'tv', 'press_release', 'article', 'photo', 'video'];
            if ($title === '') json(['error' => 'Title is required.'], 422);
            if (!in_array($type, $allowedTypes, true)) json(['error' => 'Valid media type is required.'], 422);
            $stmt = db()->prepare(
                'UPDATE media_items SET title=?, type=?, summary=?, body=?, image=?, link_url=?, published_at=?, is_featured=?, sort_order=? WHERE id=?'
            );
            $stmt->execute([
                $title,
                $type,
                field($b, 'summary') ?: null,
                field($b, 'body') ?: null,
                field($b, 'image') ?: null,
                field($b, 'link_url') ?: null,
                field($b, 'published_at') ?: null,
                !empty($b['is_featured']) ? 1 : 0,
                (int) ($b['sort_order'] ?? 0),
                (int) $m[1],
            ]);
            json(['message' => 'Media item updated.']);
        }

        case $method === 'DELETE' && preg_match('#^admin/media/(\d+)$#', $route, $m) === 1: {
            require_admin();
            $stmt = db()->prepare('DELETE FROM media_items WHERE id = ?');
            $stmt->execute([(int) $m[1]]);
            json(['message' => 'Media item deleted.']);
        }

        /* ---------------- ADMIN: EVENTS CRUD ---------------- */
        case $key === 'GET admin/events': {
            require_admin();
            $rows = db()->query(
                'SELECT id, title, location, role, event_date, is_past FROM events ORDER BY event_date ASC'
            )->fetchAll();
            json(['events' => $rows]);
        }

        case $key === 'POST admin/event': {
            require_admin();
            $b = body();
            $title = field($b, 'title');
            $date  = field($b, 'event_date');
            if ($title === '') json(['error' => 'Title is required.'], 422);
            if ($date === '')  json(['error' => 'Event date is required.'], 422);
            $stmt = db()->prepare(
                'INSERT INTO events (title, location, role, event_date, is_past) VALUES (?, ?, ?, ?, ?)'
            );
            $stmt->execute([$title, field($b, 'location') ?: null, field($b, 'role') ?: null, $date, !empty($b['is_past']) ? 1 : 0]);
            json(['id' => (int) db()->lastInsertId(), 'message' => 'Event created.'], 201);
        }

        case $method === 'PUT' && preg_match('#^admin/event/(\d+)$#', $route, $m) === 1: {
            require_admin();
            $b = body();
            $title = field($b, 'title');
            $date  = field($b, 'event_date');
            if ($title === '') json(['error' => 'Title is required.'], 422);
            if ($date === '')  json(['error' => 'Event date is required.'], 422);
            $stmt = db()->prepare(
                'UPDATE events SET title=?, location=?, role=?, event_date=?, is_past=? WHERE id=?'
            );
            $stmt->execute([$title, field($b, 'location') ?: null, field($b, 'role') ?: null, $date, !empty($b['is_past']) ? 1 : 0, (int) $m[1]]);
            json(['message' => 'Event updated.']);
        }

        case $method === 'DELETE' && preg_match('#^admin/event/(\d+)$#', $route, $m) === 1: {
            require_admin();
            $stmt = db()->prepare('DELETE FROM events WHERE id = ?');
            $stmt->execute([(int) $m[1]]);
            json(['message' => 'Event deleted.']);
        }

        /* ---------------- ADMIN: POSTS CRUD ---------------- */
        case $key === 'GET admin/posts': {
            require_admin();
            $rows = db()->query(
                'SELECT id, title, category, excerpt, body, cover_image, is_featured, published_at
                 FROM posts ORDER BY published_at DESC'
            )->fetchAll();
            json(['posts' => $rows]);
        }

        case $key === 'POST admin/post': {
            require_admin();
            $b = body();
            $title = field($b, 'title');
            if ($title === '') json(['error' => 'Title is required.'], 422);
            $stmt = db()->prepare(
                'INSERT INTO posts (title, category, excerpt, body, cover_image, is_featured, published_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([
                $title,
                field($b, 'category') ?: null,
                field($b, 'excerpt') ?: null,
                field($b, 'body') ?: null,
                field($b, 'cover_image') ?: null,
                !empty($b['is_featured']) ? 1 : 0,
                field($b, 'published_at') ?: null,
            ]);
            json(['id' => (int) db()->lastInsertId(), 'message' => 'Post created.'], 201);
        }

        case $method === 'PUT' && preg_match('#^admin/post/(\d+)$#', $route, $m) === 1: {
            require_admin();
            $b = body();
            $title = field($b, 'title');
            if ($title === '') json(['error' => 'Title is required.'], 422);
            $stmt = db()->prepare(
                'UPDATE posts SET title=?, category=?, excerpt=?, body=?, cover_image=?, is_featured=?, published_at=? WHERE id=?'
            );
            $stmt->execute([
                $title,
                field($b, 'category') ?: null,
                field($b, 'excerpt') ?: null,
                field($b, 'body') ?: null,
                field($b, 'cover_image') ?: null,
                !empty($b['is_featured']) ? 1 : 0,
                field($b, 'published_at') ?: null,
                (int) $m[1],
            ]);
            json(['message' => 'Post updated.']);
        }

        case $method === 'DELETE' && preg_match('#^admin/post/(\d+)$#', $route, $m) === 1: {
            require_admin();
            $stmt = db()->prepare('DELETE FROM posts WHERE id = ?');
            $stmt->execute([(int) $m[1]]);
            json(['message' => 'Post deleted.']);
        }

        /* ---------------- ADMIN: IMAGE UPLOAD ---------------- */
        case $key === 'POST admin/upload': {
            require_admin();
            // Admin uploads allow documents (PDF) too — used by content panels + ecosystem docs.
            json(['url' => media_store_uploaded_file('file', true), 'message' => 'Uploaded.'], 201);
        }

        /* ---------------- FALLBACK ---------------- */
        default:
            json(['error' => 'Not found', 'route' => $route, 'method' => $method], 404);
    }
} catch (Throwable $e) {
    $payload = ['error' => 'Server error'];
    if (app_debug()) {
        $payload['detail'] = $e->getMessage();
    }
    json($payload, 500);
}


