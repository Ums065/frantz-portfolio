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

// Auto-migration: on the first request after a deploy (when APP_SCHEMA_VERSION
// has been bumped) this runs all idempotent schema routines once, then it's a
// single cheap version check. Fails open so it never blocks a request.
db_auto_migrate();

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
            assert_password_strength($pass);

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
                    // Optional profile photo picked during registration.
                    $avatar = (string) field($b, 'avatar_url');
                    $avatar = preg_match('#^(/api/uploads/|https?://)#', $avatar) ? mb_substr($avatar, 0, 255) : null;
                    $insert = $pdo->prepare(
                        'INSERT INTO users (
                            full_name,
                            email,
                            password_hash,
                            avatar_url,
                            approval_status,
                            approval_note,
                            approval_reviewed_by_user_id,
                            approval_reviewed_at,
                            email_verified_at,
                            email_verification_otp_hash,
                            email_verification_otp_expires_at,
                            email_verification_otp_sent_at,
                            email_verification_otp_attempts
                         ) VALUES (?, ?, ?, ?, "pending", NULL, NULL, NULL, ' . $verifiedExpr . ', NULL, NULL, NULL, 0)'
                    );
                    $insert->execute([$name, $email, $passwordHash, $avatar]);
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
            // Account lockout: block sign-in if this account has 10+ recent wrong
            // passwords (locked for 5 minutes). Runs before we check the password.
            login_lock_check($email);
            $pass  = field($b, 'password');

            $pdo = db();
            $stmt = $pdo->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
            $stmt->execute([$email]);
            $u = $stmt->fetch();

            if (!$u || !password_verify($pass, $u['password_hash'])) {
                // Generic message on purpose — never reveal whether the email exists
                // (prevents account enumeration). Security is the priority.
                login_fail_record($email); // count this wrong attempt toward the lockout
                $st = login_fail_status($email);
                $remaining = max(0, LOGIN_MAX_FAILS - $st['count']);
                $lockMins = max(1, (int) ceil(LOGIN_LOCK_SECONDS / 60));
                if ($remaining <= 0) {
                    // This attempt hit the limit — the account is now locked.
                    json([
                        'error'       => "Too many incorrect password attempts. This account is locked for 5 minutes. Please wait for the timer to finish or reset your password.",
                        'locked'      => true,
                        'retry_after' => $st['retry_after'] ?: LOGIN_LOCK_SECONDS,
                        'max'         => LOGIN_MAX_FAILS,
                    ], 429);
                }
                $resp = [
                    'error'              => 'Invalid email or password.',
                    'attempts_used'      => $st['count'],
                    'attempts_remaining' => $remaining,
                    'max'                => LOGIN_MAX_FAILS,
                    'lock_minutes'       => $lockMins,
                ];
                // Start warning the user once they are halfway to the lockout.
                if ($st['count'] >= 5) {
                    $resp['warn'] = "$remaining attempt" . ($remaining === 1 ? '' : 's') . " remaining before this account is locked for $lockMins minutes.";
                }
                json($resp, 401);
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
                login_fail_clear($email); // successful sign-in resets the lockout counter
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
            assert_password_strength($pass);

            $u = consume_password_reset($token);
            if (!$u) {
                json(['error' => 'This reset link is invalid or has expired. Please request a new one.'], 400);
            }

            ensure_session_version_column();
            // Bump session_version so any sessions opened before the reset (e.g. an
            // attacker's) are invalidated. The user re-logs in with the new password.
            $update = db()->prepare('UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?');
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
            // new_school_handle_route() exits (json) for any route it matches; if it
            // returns, no new-school route matched — 404 instead of falling through
            // into the next case (which would run the wrong handler).
            json(['error' => 'Not found.'], 404);
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
            if ($pass !== '') {
                // Changing the password requires the current one, verified server-side.
                $current = field($b, 'current_password');
                if ($current === '') {
                    json(['error' => 'Enter your current password to set a new one.'], 422);
                }
                $row = db()->prepare('SELECT password_hash FROM users WHERE id = ? LIMIT 1');
                $row->execute([(int) $u['id']]);
                $hash = (string) ($row->fetchColumn() ?: '');
                if ($hash === '' || !password_verify($current, $hash)) {
                    json(['error' => 'Your current password is incorrect.'], 422);
                }
                assert_password_strength($pass);
            }

            // Build the update dynamically so name, avatar, and password are all
            // optional-but-together in one request.
            $cols = ['full_name = ?'];
            $args = [$name];
            if (array_key_exists('avatar_url', $b)) {
                $cols[] = 'avatar_url = ?';
                $args[] = trim((string) $b['avatar_url']) !== '' ? trim((string) $b['avatar_url']) : null;
            }
            $bumpSession = false;
            if ($pass !== '') {
                ensure_session_version_column();
                $cols[] = 'password_hash = ?';
                $args[] = password_hash($pass, PASSWORD_DEFAULT);
                $cols[] = 'session_version = session_version + 1';
                $bumpSession = true;
            }
            $args[] = (int) $u['id'];
            db()->prepare('UPDATE users SET ' . implode(', ', $cols) . ' WHERE id = ?')->execute($args);

            if ($bumpSession) {
                // Keep THIS session valid; only other sessions are evicted.
                $nv = db()->prepare('SELECT session_version FROM users WHERE id = ?');
                $nv->execute([(int) $u['id']]);
                $_SESSION['sv'] = (int) $nv->fetchColumn();
            }

            $_SESSION['uid'] = (int) $u['id'];
            json(['user' => current_user(), 'message' => 'Profile updated.']);
        }

        /* ---------------- PUBLIC CONTENT ---------------- */
        case $key === 'GET press': {
            json(['items' => press_public_items()]);
        }

        case $key === 'GET events': {
            events_ensure_schema();
            $rows = db()->query(
                'SELECT e.id, e.title, e.location, e.role, e.event_date, e.is_past,
                        e.image_url, e.description, e.is_featured, e.badge_label,
                        e.event_time, e.end_date, e.cta_label, e.cta_url, e.publish_at,
                        e.video_url, e.gallery_images, e.accent,
                        (SELECT COUNT(*) FROM event_rsvps r
                         WHERE r.event_id = e.id AND r.status IN ("going", "maybe", "interested")) AS rsvp_count
                 FROM events e ORDER BY e.event_date ASC'
            )->fetchAll();
            json(['events' => $rows]);
        }

        // Lightweight public analytics for the home featured banner (view / CTA click).
        case $method === 'POST' && preg_match('#^events/(\d+)/track$#', $route, $m) === 1: {
            events_ensure_schema();
            $type = field(body(), 'type');
            $col = $type === 'click' ? 'click_count' : 'view_count';
            try {
                $stmt = db()->prepare("UPDATE events SET $col = $col + 1 WHERE id = ?");
                $stmt->execute([(int) $m[1]]);
            } catch (Throwable $e) { /* analytics are best-effort */ }
            json(['ok' => true]);
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
            rate_limit('event_rsvp', 12, 3600); // anti-spam
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
            rate_limit('community_thread', 10, 3600); // anti-spam
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

        // A logged-in user's own gallery submissions + approval status (media dashboard etc.).
        case $key === 'GET gallery/my-submissions': {
            $u = require_login();
            json(['submissions' => gallery_user_submissions((int) $u['id'])]);
        }

        // Generic 1:1 "Messages with the team" — available to ANY logged-in role
        // that doesn't already have a dedicated chat (business/member/fellow…).
        // Reuses the role-agnostic ecosystem_messages store; admin reads via the
        // Team Inbox (admin/team/*).
        case $key === 'GET team/messages': {
            $u = require_login();
            ecosystem_messages_mark_read((int) $u['id'], 'user');
            json(['messages' => ecosystem_messages_for_user((int) $u['id'])]);
        }
        case $key === 'POST team/message': {
            $u = require_login();
            rate_limit('team_message', 30, 300, (string) $u['id']);
            json(['messages' => ecosystem_send_message((int) $u['id'], 'user', (string) field(body(), 'body'))]);
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
            rate_limit('subscribe', 6, 3600); // anti-spam
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
            rate_limit('sponsorship_apply', 6, 3600); // anti-spam
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
            rate_limit('gallery_submit', 8, 3600); // anti-spam
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
            rate_limit('service_request', 8, 3600); // anti-spam
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
            rate_limit('contact', 6, 3600); // anti-spam
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

            // L1: bind + amount-check the Stripe confirmation the same way as PayPal —
            // go through storefront_mark_order_paid() instead of a bespoke UPDATE.
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

        /* ---- Donations: same Stripe/PayPal plumbing as the store ---- */
        case $key === 'GET donate/config': {
            donations_ensure_schema();
            $org = org_identity();
            json(storefront_payment_config() + [
                'designations' => donation_designations(),
                'org_legal_name' => $org['org_legal_name'],
                // Tells the UI whether receipts will be tax-complete yet.
                'receipts_complete' => trim($org['org_ein']) !== '',
            ]);
        }
        case $key === 'POST donate/checkout': {
            rate_limit('donate_checkout', 20, 3600);
            donations_ensure_schema();
            $b = body();
            $u = current_user();
            $name = mb_substr(trim((string) field($b, 'donor_name')), 0, 160);
            $email = require_email(field($b, 'email'));
            $amount = round((float) ($b['amount'] ?? 0), 2);
            $provider = (string) field($b, 'provider') ?: 'stripe';
            if ($name === '') json(['error' => 'Please tell us your name for the receipt.'], 422);
            if ($amount < 1) json(['error' => 'The smallest donation we can take is 1.'], 422);
            if ($amount > 100000) json(['error' => 'For gifts above 100,000 please contact us directly.'], 422);
            if (!in_array($provider, storefront_payment_methods(), true)) json(['error' => 'That payment method is not available.'], 503);
            $designation = (string) field($b, 'designation');
            if ($designation !== '' && !in_array($designation, donation_designations(), true)) $designation = '';

            $currency = storefront_currency();
            $no = 'D' . date('ymd') . strtoupper(bin2hex(random_bytes(3)));
            db()->prepare('INSERT INTO donations (donation_no, user_id, donor_name, email, organization, donor_role,
                    amount, currency, designation, message, is_anonymous, provider)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
                ->execute([$no, $u['id'] ?? null, $name, $email,
                    mb_substr(trim((string) field($b, 'organization')), 0, 200) ?: null,
                    $u['role'] ?? null, $amount, $currency, $designation ?: null,
                    mb_substr(trim((string) field($b, 'message')), 0, 1000) ?: null,
                    !empty($b['is_anonymous']) ? 1 : 0, $provider]);
            $id = (int) db()->lastInsertId();

            $base = storefront_public_base_url();
            if ($provider === 'stripe') {
                if (!storefront_stripe_enabled()) json(['error' => 'Card payments are not configured.'], 503);
                $res = storefront_stripe_api_request('POST', 'checkout/sessions', [
                    'mode' => 'payment',
                    'success_url' => $base . '/donate?donation=' . rawurlencode($no) . '&session_id={CHECKOUT_SESSION_ID}',
                    'cancel_url' => $base . '/donate?cancelled=1',
                    'customer_email' => $email,
                    'client_reference_id' => $no,
                    'line_items' => [[
                        'quantity' => 1,
                        'price_data' => [
                            'currency' => $currency,
                            'unit_amount' => (int) round($amount * 100),
                            'product_data' => ['name' => 'Donation' . ($designation !== '' ? ' — ' . $designation : '')],
                        ],
                    ]],
                ]);
                if (!$res['ok'] || empty($res['data']['id'])) {
                    db()->prepare("UPDATE donations SET payment_status = 'failed', payment_error = ? WHERE id = ?")
                        ->execute([mb_substr((string) ($res['error'] ?? 'Stripe error'), 0, 500), $id]);
                    json(['error' => 'Could not start the card payment. Please try again.'], 502);
                }
                db()->prepare('UPDATE donations SET payment_session_id = ? WHERE id = ?')->execute([(string) $res['data']['id'], $id]);
                json(['donation_no' => $no, 'provider' => 'stripe', 'checkout_url' => (string) ($res['data']['url'] ?? '')], 201);
            }
            // PayPal: create the order, the browser approves, then we capture.
            if (!storefront_paypal_enabled()) json(['error' => 'PayPal is not configured.'], 503);
            $pp = storefront_paypal_create_order($amount, strtoupper($currency), $no);
            if (!$pp['ok'] || empty($pp['id'])) {
                db()->prepare("UPDATE donations SET payment_status = 'failed', payment_error = ? WHERE id = ?")
                    ->execute([mb_substr((string) ($pp['error'] ?? 'PayPal error'), 0, 500), $id]);
                json(['error' => 'Could not start the PayPal payment. Please try again.'], 502);
            }
            db()->prepare('UPDATE donations SET payment_session_id = ? WHERE id = ?')->execute([(string) $pp['id'], $id]);
            json(['donation_no' => $no, 'provider' => 'paypal', 'paypal_order_id' => (string) $pp['id']], 201);
        }
        case $key === 'POST donate/confirm': {
            donations_ensure_schema();
            $b = body();
            $no = (string) field($b, 'donation_no');
            $sessionId = (string) field($b, 'session_id');
            if ($no === '' || $sessionId === '') json(['error' => 'Missing payment reference.'], 422);
            if (!storefront_stripe_enabled()) json(['error' => 'Card payments are not configured.'], 503);
            $sess = storefront_stripe_checkout_session_detail($sessionId);
            if (!$sess['ok']) json(['error' => 'Could not verify the payment.'], 502);
            $d = $sess['data'] ?? [];
            if ((string) ($d['payment_status'] ?? '') !== 'paid') json(['error' => 'Payment has not completed.', 'status' => (string) ($d['payment_status'] ?? '')], 409);
            $res = donation_mark_paid($no, 'stripe', (string) ($d['payment_intent'] ?? $sessionId), $sessionId, [
                'expect_session' => $sessionId,
                'amount_minor' => isset($d['amount_total']) ? (int) $d['amount_total'] : null,
                'currency' => (string) ($d['currency'] ?? ''),
            ]);
            if (!$res['already']) donation_issue_receipt($res['id']);
            json(['message' => 'Thank you — your donation is confirmed.', 'donation_no' => $no]);
        }
        case $key === 'POST donate/paypal-capture': {
            donations_ensure_schema();
            $b = body();
            $no = (string) field($b, 'donation_no');
            $ppId = (string) field($b, 'paypal_order_id');
            if ($no === '' || $ppId === '') json(['error' => 'Missing PayPal reference.'], 422);
            if (!storefront_paypal_enabled()) json(['error' => 'PayPal is not configured.'], 503);
            $cap = storefront_paypal_capture_order($ppId);
            if (!$cap['ok'] || ($cap['status'] ?? '') !== 'COMPLETED') {
                json(['error' => 'Payment has not been completed.', 'status' => $cap['status'] ?? ''], 409);
            }
            $capture = $cap['data']['purchase_units'][0]['payments']['captures'][0] ?? null;
            $amtMinor = null; $cur = ''; $captureId = $ppId;
            if (is_array($capture) && isset($capture['amount']['value'])) {
                $amtMinor = (int) round(((float) $capture['amount']['value']) * 100);
                $cur = (string) ($capture['amount']['currency_code'] ?? '');
                $captureId = (string) ($capture['id'] ?? $ppId);
            }
            $res = donation_mark_paid($no, 'paypal', $captureId, $ppId, [
                'expect_session' => $ppId, 'amount_minor' => $amtMinor, 'currency' => $cur,
            ]);
            if (!$res['already']) donation_issue_receipt($res['id']);
            json(['message' => 'Thank you — your donation is confirmed.', 'donation_no' => $no]);
        }
        // A signed-in donor's own giving history.
        case $key === 'GET donate/mine': {
            $u = require_login();
            donations_ensure_schema();
            $s = db()->prepare("SELECT donation_no, receipt_no, amount, currency, designation, payment_status,
                    paid_at, receipt_url, created_at
                FROM donations WHERE user_id = ? ORDER BY created_at DESC LIMIT 100");
            $s->execute([(int) $u['id']]);
            json(['donations' => $s->fetchAll()]);
        }

        case $key === 'POST order': {
            rate_limit('guest_order', 5, 3600); // anti-abuse: this path decrements stock without a payment step
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
                'INSERT INTO business_accounts (user_id, business_name, category, borough, contact_name, contact_phone, website, about, ein, manager_name, manager_phone, manager_email, available_days, available_from, available_to)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                 ON DUPLICATE KEY UPDATE business_name=VALUES(business_name), category=VALUES(category),
                     borough=VALUES(borough), contact_name=VALUES(contact_name), contact_phone=VALUES(contact_phone),
                     website=VALUES(website), about=VALUES(about), ein=VALUES(ein), manager_name=VALUES(manager_name),
                     manager_phone=VALUES(manager_phone), manager_email=VALUES(manager_email), available_days=VALUES(available_days),
                     available_from=VALUES(available_from), available_to=VALUES(available_to), updated_at=NOW()'
            )->execute([
                (int) $user['id'], mb_substr($bizName, 0, 160),
                mb_substr(trim((string) field($b, 'category')), 0, 80) ?: null,
                mb_substr(trim((string) field($b, 'borough')), 0, 60) ?: null,
                mb_substr($fullName, 0, 120),
                mb_substr(trim((string) field($b, 'contact_phone')), 0, 40) ?: null,
                mb_substr(trim((string) field($b, 'website')), 0, 255) ?: null,
                mb_substr(trim((string) field($b, 'about')), 0, 2000) ?: null,
                mb_substr(trim((string) field($b, 'ein')), 0, 30) ?: null,
                mb_substr(trim((string) field($b, 'manager_name')), 0, 120) ?: null,
                mb_substr(trim((string) field($b, 'manager_phone')), 0, 40) ?: null,
                mb_substr(trim((string) field($b, 'manager_email')), 0, 120) ?: null,
                mb_substr(trim((string) field($b, 'available_days')), 0, 120) ?: null,
                mb_substr(trim((string) field($b, 'available_from')), 0, 20) ?: null,
                mb_substr(trim((string) field($b, 'available_to')), 0, 20) ?: null,
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
                'INSERT INTO business_accounts (user_id, business_name, category, borough, contact_name, contact_phone, website, about, ein, manager_name, manager_phone, manager_email, available_days, available_from, available_to)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                 ON DUPLICATE KEY UPDATE business_name=VALUES(business_name), category=VALUES(category),
                     borough=VALUES(borough), contact_name=VALUES(contact_name), contact_phone=VALUES(contact_phone),
                     website=VALUES(website), about=VALUES(about), ein=VALUES(ein), manager_name=VALUES(manager_name),
                     manager_phone=VALUES(manager_phone), manager_email=VALUES(manager_email), available_days=VALUES(available_days),
                     available_from=VALUES(available_from), available_to=VALUES(available_to), updated_at=NOW()'
            )->execute([
                (int) $u['id'], mb_substr($bizName, 0, 160),
                mb_substr(trim((string) field($b, 'category')), 0, 80) ?: null,
                mb_substr(trim((string) field($b, 'borough')), 0, 60) ?: null,
                mb_substr(trim((string) field($b, 'contact_name')), 0, 120) ?: null,
                mb_substr(trim((string) field($b, 'contact_phone')), 0, 40) ?: null,
                mb_substr(trim((string) field($b, 'website')), 0, 255) ?: null,
                mb_substr(trim((string) field($b, 'about')), 0, 2000) ?: null,
                mb_substr(trim((string) field($b, 'ein')), 0, 30) ?: null,
                mb_substr(trim((string) field($b, 'manager_name')), 0, 120) ?: null,
                mb_substr(trim((string) field($b, 'manager_phone')), 0, 40) ?: null,
                mb_substr(trim((string) field($b, 'manager_email')), 0, 120) ?: null,
                mb_substr(trim((string) field($b, 'available_days')), 0, 120) ?: null,
                mb_substr(trim((string) field($b, 'available_from')), 0, 20) ?: null,
                mb_substr(trim((string) field($b, 'available_to')), 0, 20) ?: null,
            ]);
            json(business_dashboard_payload($u));
        }

        // Opportunity requests (implementation / contact_school / internship / volunteer)
        // — reviewed by the admin; the business cannot rate or score students.
        case $key === 'POST business/request': {
            $u = require_business();
            json(business_create_request($u, body()), 201);
        }

        // Internship pipeline: every offer this business made, with live stage + timeline.
        case $key === 'GET business/offers': {
            $u = require_business();
            json(['offers' => business_offers_pipeline((int) $u['id'])]);
        }

        // Business answers an admin "Needs more info" note → back to the review queue.
        case $method === 'POST' && preg_match('#^business/request/(\d+)/reply$#', $route, $m) === 1: {
            $u = require_business();
            json(['message' => 'Reply sent — the team will review it.', 'requests' => business_request_reply((int) $u['id'], (int) $m[1], (string) field(body(), 'message'))]);
        }

        // Timeline (audit trail) for a single offer the business owns.
        case $method === 'GET' && preg_match('#^business/offer/(\d+)/timeline$#', $route, $m) === 1: {
            $u = require_business();
            business_ensure_schema();
            $own = db()->prepare("SELECT id FROM business_requests WHERE id = ? AND business_user_id = ? LIMIT 1");
            $own->execute([(int) $m[1], (int) $u['id']]);
            if (!$own->fetch()) json(['error' => 'Not found.'], 404);
            json(['timeline' => business_offer_timeline((int) $m[1])]);
        }

        // Business ⇄ student chat on a confirmed internship offer the business owns.
        case $method === 'GET' && preg_match('#^business/offer/(\d+)/messages$#', $route, $m) === 1: {
            $u = require_business();
            $r = business_offer_row((int) $m[1]);
            if (!$r || (int) $r['business_user_id'] !== (int) $u['id']) json(['error' => 'Offer not found.'], 404);
            $can = business_offer_is_confirmed($r);
            if ($can) business_offer_messages_mark_read((int) $m[1], 'business');
            json(['can_chat' => $can, 'messages' => $can ? business_offer_messages_list((int) $m[1]) : []]);
        }
        case $method === 'POST' && preg_match('#^business/offer/(\d+)/messages$#', $route, $m) === 1: {
            $u = require_business();
            rate_limit('offer_chat', 30, 300, (string) $u['id']);
            $r = business_offer_row((int) $m[1]);
            if (!$r || (int) $r['business_user_id'] !== (int) $u['id']) json(['error' => 'Offer not found.'], 404);
            if (!business_offer_is_confirmed($r)) json(['error' => 'Chat opens once the internship is confirmed.'], 422);
            business_offer_message_add((int) $m[1], 'business', (int) $u['id'], (string) field(body(), 'body'), (string) field(body(), 'attachment_url'));
            json(['messages' => business_offer_messages_list((int) $m[1])]);
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

        // Admin oversight of an internship offer chat (read + post).
        case $method === 'GET' && preg_match('#^admin/business-request/(\d+)/messages$#', $route, $m) === 1: {
            require_admin();
            $r = business_offer_row((int) $m[1]);
            if (!$r) json(['error' => 'Offer not found.'], 404);
            json(['can_chat' => business_offer_is_confirmed($r), 'messages' => business_offer_messages_list((int) $m[1])]);
        }
        case $method === 'POST' && preg_match('#^admin/business-request/(\d+)/messages$#', $route, $m) === 1: {
            $admin = require_admin();
            $r = business_offer_row((int) $m[1]);
            if (!$r) json(['error' => 'Offer not found.'], 404);
            business_offer_message_add((int) $m[1], 'admin', (int) $admin['id'], (string) field(body(), 'body'), (string) field(body(), 'attachment_url'));
            json(['messages' => business_offer_messages_list((int) $m[1])]);
        }

        // Global announcements feed for ANY logged-in user (audience 'all' + any
        // targeted to their role). Powers the Announcements section on every dashboard.
        case $key === 'GET announcements': {
            $u = require_login();
            json(['announcements' => ecosystem_announcements_for_role((string) ($u['role'] ?? ''))]);
        }

        // Auto-translation proxy (whole-site language toggle). Public; rate-limited.
        case $key === 'POST translate': {
            rate_limit('translate', 240, 3600);
            $b = body();
            $q = $b['q'] ?? [];
            if (!is_array($q)) $q = [];
            $q = array_slice(array_map(static fn($x): string => mb_substr((string) $x, 0, 1000), $q), 0, 300);
            json(['translations' => translate_texts($q, (string) field($b, 'target'))]);
        }

        // Unified notifications bell: per-user feed + unread count (role-scoped).
        case $key === 'GET notifications/feed': {
            $u = require_login();
            $limit = min(100, max(1, (int) ($_GET['limit'] ?? 20)));
            json(notifications_feed_for_user($u, $limit));
        }
        case $key === 'POST notifications/read-all': {
            $u = require_login();
            notifications_mark_all_read($u);
            json(notifications_feed_for_user($u));
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
        // Full profile of the account behind a request (View Profile).
        case $method === 'GET' && preg_match('#^admin/ecosystem/account/(\d+)$#', $route, $m) === 1: {
            require_admin();
            json(ecosystem_admin_account_profile((int) $m[1]));
        }
        // Toggle whether an ecosystem partner/sponsor's logo shows on the public /partner page.
        case $method === 'PUT' && preg_match('#^admin/ecosystem/account/(\d+)/listing$#', $route, $m) === 1: {
            require_admin();
            ecosystem_ensure_schema();
            $uid = (int) $m[1];
            $listed = !empty(body()['listed']) ? 1 : 0;
            db()->prepare('UPDATE ecosystem_accounts SET public_listed = ?, updated_at = NOW() WHERE user_id = ?')->execute([$listed, $uid]);
            if ($listed) {
                try {
                    new_school_add_notification(
                        null, 'all', 'partner_listed',
                        'You\'re live on our Partners page 🎉',
                        'Your logo and profile are now visible on the public Partners page. Thank you for being part of the movement!',
                        ['user_id' => $uid], $uid
                    );
                } catch (Throwable $e) { if (app_debug()) error_log('partner_listed notify: ' . $e->getMessage()); }
            }
            json(['message' => $listed ? 'Listed on the public Partners page.' : 'Removed from the public Partners page.']);
        }
        // Set the public presentation (type / featured) for a dashboard partner.
        case $method === 'PUT' && preg_match('#^admin/ecosystem/account/(\d+)/public-meta$#', $route, $m) === 1: {
            require_admin();
            ecosystem_ensure_schema();
            $uid = (int) $m[1];
            $b = body();
            $acc = ecosystem_account_for_user($uid);
            if (!$acc) json(['error' => 'Account not found.'], 404);
            $d = is_array($acc['details']) ? $acc['details'] : [];
            if (array_key_exists('partner_type', $b)) $d['public_type'] = mb_substr(trim((string) field($b, 'partner_type')), 0, 60) ?: null;
            if (array_key_exists('featured', $b)) $d['public_featured'] = !empty($b['featured']) ? 1 : 0;
            db()->prepare('UPDATE ecosystem_accounts SET details = ?, updated_at = NOW() WHERE user_id = ?')->execute([json_encode($d), $uid]);
            json(['message' => 'Updated.']);
        }
        // Reject a partner/sponsor logo: clear it, unlist, and ask them to re-upload.
        case $method === 'PUT' && preg_match('#^admin/ecosystem/account/(\d+)/logo-reject$#', $route, $m) === 1: {
            require_admin();
            ecosystem_ensure_schema();
            $uid = (int) $m[1];
            $note = trim((string) field(body(), 'note'));
            $acc = ecosystem_account_for_user($uid);
            if (!$acc) json(['error' => 'Account not found.'], 404);
            $d = is_array($acc['details']) ? $acc['details'] : [];
            $d['logo_url'] = '';
            db()->prepare('UPDATE ecosystem_accounts SET details = ?, public_listed = 0, updated_at = NOW() WHERE user_id = ?')->execute([json_encode($d), $uid]);
            try {
                new_school_add_notification(
                    null, 'all', 'partner_logo_rejected',
                    'Please re-upload your logo',
                    'Your logo wasn\'t approved for the Partners page.' . ($note !== '' ? ' Reason: ' . $note : '') . ' Please upload a new one from your dashboard.',
                    ['user_id' => $uid], $uid
                );
            } catch (Throwable $e) { if (app_debug()) error_log('logo reject notify: ' . $e->getMessage()); }
            json(['message' => 'Logo rejected — the partner has been asked to re-upload.']);
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
            ecosystem_announcement_add((string) field($b, 'audience'), (string) field($b, 'title'), (string) field($b, 'body'), (string) field($b, 'media_url'));
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

        /* ---- Research Workspace: Youth Community Impact Fellow ---- */
        // Fellow-facing (own data only).
        case $key === 'GET fellow/overview': {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            json([
                'counts' => research_counts_for_fellow((int) $u['id']),
                'assignments' => ecosystem_assignments_for_user((int) $u['id']),
                'recent' => array_slice(research_entries_for_fellow((int) $u['id']), 0, 10),
            ]);
        }
        case $key === 'GET fellow/entries': {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            $cat = isset($_GET['category']) ? (string) $_GET['category'] : null;
            json(['entries' => research_entries_for_fellow((int) $u['id'], $cat)]);
        }
        /* ---- Student verification: the Fellow calls the school, not the child ---- */
        case $key === 'GET fellow/student-verify': {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            json(fellow_school_queue($_GET));
        }
        case $method === 'GET' && preg_match('#^fellow/student-verify/school/(\d+)$#', $route, $m) === 1: {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            $out = fellow_school_students((int) $m[1]);
            if (!$out) json(['error' => 'School not found.'], 404);
            json($out);
        }
        case $method === 'POST' && preg_match('#^fellow/student-verify/school/(\d+)/call$#', $route, $m) === 1: {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            fellow_school_calls_ensure_schema();
            rate_limit('fellow_school_call', 200, 3600, (string) $u['id']);
            $sid = (int) $m[1]; $b = body();
            $chk = db()->prepare('SELECT school_name FROM new_school_schools WHERE id = ? LIMIT 1');
            $chk->execute([$sid]);
            $school = $chk->fetch();
            if (!$school) json(['error' => 'School not found.'], 404);
            $outcome = (string) field($b, 'outcome');
            if (!in_array($outcome, FELLOW_SCHOOL_CALL_OUTCOMES, true)) json(['error' => 'Pick what happened on the call.'], 422);
            $fu = trim((string) field($b, 'follow_up_date'));
            db()->prepare('INSERT INTO fellow_school_calls (school_id, fellow_user_id, spoke_to, outcome, note, follow_up_date) VALUES (?,?,?,?,?,?)')
                ->execute([$sid, (int) $u['id'], mb_substr(trim((string) field($b, 'spoke_to')), 0, 160) ?: null,
                    $outcome, mb_substr(trim((string) field($b, 'note')), 0, 1000) ?: null,
                    preg_match('/^\d{4}-\d{2}-\d{2}$/', $fu) === 1 ? $fu : null]);
            // Counts towards the Fellow's daily call target like any other call.
            fellow_log((int) $u['id'], null, 'call', 'School: ' . (string) $school['school_name'] . ' — ' . str_replace('_', ' ', $outcome));
            json(['message' => 'Call logged.'], 201);
        }
        /* ---- School verification workspace (the master school list) ---- */
        case $key === 'GET fellow/schools': {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            $out = school_list_query((int) $u['id'], $_GET);
            $out['facets'] = school_list_facets((int) $u['id']);
            json($out);
        }
        // Warn before a Fellow hand-adds a school that is already on the list.
        case $key === 'GET fellow/schools/check': {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            $dup = school_find_duplicate((int) $u['id'], (string) ($_GET['name'] ?? ''), (string) ($_GET['dbn'] ?? ''), (string) ($_GET['region'] ?? ''), true);
            json(['match' => $dup]);
        }
        case $key === 'POST fellow/schools/import': {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            rate_limit('school_import', 10, 3600, (string) $u['id']);
            $rows = is_array(body()['rows'] ?? null) ? body()['rows'] : [];
            if (!$rows) json(['error' => 'No rows found in that file.'], 422);
            $res = school_list_import((int) $u['id'], $rows);
            fellow_log((int) $u['id'], null, 'research', 'Imported ' . $res['imported'] . ' schools (' . $res['skipped'] . ' duplicates skipped)');
            json($res + ['message' => "Imported {$res['imported']} schools. {$res['skipped']} duplicates were skipped."], 201);
        }
        // Save the details a Fellow found, and record HOW they confirmed them.
        case $method === 'PUT' && preg_match('#^fellow/school/(\d+)$#', $route, $m) === 1: {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            research_ensure_schema();
            $id = (int) $m[1]; $fid = (int) $u['id']; $b = body();
            $own = db()->prepare("SELECT id, title FROM research_entries WHERE id = ? AND fellow_user_id = ? AND category = 'school_contact'");
            $own->execute([$id, $fid]);
            $row = $own->fetch();
            if (!$row) json(['error' => 'Not found.'], 404);
            $cap = static function (string $k, int $n) use ($b) {
                $t = mb_substr(trim((string) field($b, $k)), 0, $n);
                return $t === '' ? null : $t;
            };
            $name = mb_substr(trim((string) field($b, 'title')), 0, 200);
            if ($name === '') json(['error' => 'School name is required.'], 422);
            db()->prepare('UPDATE research_entries SET title=?, name_key=?, dbn=?, region=?, priority=?, school_type=?, grades=?,
                    neighborhood=?, address=?, zip=?, phone=?, website=?, contact_name=?, parent_contact=?, email=?,
                    county=?, district=?, source_url=?, notes=? WHERE id=? AND fellow_user_id=?')
                ->execute([$name, school_name_key($name), $cap('dbn', 20), $cap('region', 60), $cap('priority', 20),
                    $cap('school_type', 80), $cap('grades', 40), $cap('neighborhood', 120), $cap('address', 255),
                    $cap('zip', 20), $cap('phone', 60), $cap('website', 300), $cap('contact_name', 160),
                    $cap('parent_contact', 255), $cap('email', 200), $cap('county', 60), $cap('district', 120),
                    $cap('source_url', 500), $cap('notes', 5000), $id, $fid]);
            json(['message' => 'Saved.']);
        }
        /* Verify: the Fellow states how they confirmed it, and the school becomes
           selectable at registration. Verifying with no method is not allowed —
           the whole point is that the record can be trusted later. */
        case $method === 'POST' && preg_match('#^fellow/school/(\d+)/verify$#', $route, $m) === 1: {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            research_ensure_schema();
            $id = (int) $m[1]; $fid = (int) $u['id']; $b = body();
            $method_ = (string) field($b, 'verify_method');
            if (!in_array($method_, SCHOOL_VERIFY_METHODS, true)) json(['error' => 'Say how you verified this school.'], 422);
            $s = db()->prepare("SELECT * FROM research_entries WHERE id = ? AND fellow_user_id = ? AND category = 'school_contact'");
            $s->execute([$id, $fid]);
            $e = $s->fetch();
            if (!$e) json(['error' => 'Not found.'], 404);
            if (trim((string) $e['contact_name']) === '' && trim((string) $e['email']) === '' && trim((string) $e['phone']) === '') {
                json(['error' => 'Add at least a phone, an email or a contact name before verifying.'], 422);
            }
            db()->prepare("UPDATE research_entries SET status = 'verified', verify_method = ?, verified_on = CURDATE(),
                    source_url = COALESCE(NULLIF(?, ''), source_url) WHERE id = ?")
                ->execute([$method_, trim((string) field($b, 'source_url')), $id]);
            /* Make it selectable at registration — the point of the whole exercise.
               research_push_school() answers failures with json() (which ends the
               request), so pre-check the two cases it rejects: a school already
               claimed by a real principal is already in the dropdown, and there is
               nothing to do but say so. */
            $note = '';
            if (!empty($e['pushed_school_id'])) {
                $note = ' It was already on the registration list.';
            } else {
                $claimed = new_school_fetch_school_by_name((string) $e['title']);
                if ($claimed && ((int) ($claimed['user_id'] ?? 0) > 0 || (string) ($claimed['claim_status'] ?? '') === 'claimed')) {
                    $note = ' This school already has a principal signed up, so its own record was left untouched.';
                } else {
                    research_push_school($id); // exits with its own error only in cases ruled out above
                    $note = ' It is now selectable at registration.';
                }
            }
            fellow_log($fid, null, 'research', 'Verified school: ' . (string) $e['title'] . ' (' . str_replace('_', ' ', $method_) . ')');
            json(['message' => 'Verified.' . $note]);
        }
        // Invite the school to take part, from an approved template.
        case $method === 'POST' && preg_match('#^fellow/school/(\d+)/invite$#', $route, $m) === 1: {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            research_ensure_schema();
            $id = (int) $m[1]; $fid = (int) $u['id']; $b = body();
            rate_limit('school_invite', 120, 3600, (string) $fid);
            $s = db()->prepare("SELECT * FROM research_entries WHERE id = ? AND fellow_user_id = ? AND category = 'school_contact'");
            $s->execute([$id, $fid]);
            $e = $s->fetch();
            if (!$e) json(['error' => 'Not found.'], 404);
            $to = trim((string) $e['email']);
            if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) json(['error' => 'This school has no valid email address yet. Find one first.'], 422);
            if ((string) $e['status'] !== 'verified') json(['error' => 'Verify the school before inviting it.'], 422);
            $subject = mb_substr(trim((string) field($b, 'subject')), 0, 240) ?: 'Invitation: the Student Impact Challenge';
            $bodyTxt = trim((string) field($b, 'body'));
            if ($bodyTxt === '') json(['error' => 'The invitation message is empty.'], 422);
            $sig = "\n\n—\n" . (string) $u['full_name'] . "\nStudent Fellow, Student Impact Challenge\nA program of TrendCatch Gives Back Inc. (501(c)(3))\nFrantzCoutard.com";
            $ok = function_exists('mail_queue_enqueue')
                ? mail_queue_enqueue('school_invite', $to, $subject, $bodyTxt . $sig)
                : send_mail_message($to, $subject, $bodyTxt . $sig);
            if (!$ok) json(['error' => 'Could not queue the invitation. Try again.'], 500);
            db()->prepare("UPDATE research_entries SET outreach_status = 'invited', invited_at = NOW() WHERE id = ?")->execute([$id]);
            fellow_log($fid, null, 'email', 'Invited school: ' . (string) $e['title']);
            json(['message' => 'Invitation sent to ' . $to . '.'], 201);
        }
        // Where the invitation got to (they replied, registered, said no…).
        case $method === 'PUT' && preg_match('#^fellow/school/(\d+)/outreach$#', $route, $m) === 1: {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            research_ensure_schema();
            $st = (string) field(body(), 'outreach_status');
            if (!in_array($st, SCHOOL_OUTREACH_STATUSES, true)) json(['error' => 'Unknown outreach status.'], 422);
            $upd = db()->prepare("UPDATE research_entries SET outreach_status = ? WHERE id = ? AND fellow_user_id = ? AND category = 'school_contact'");
            $upd->execute([$st, (int) $m[1], (int) $u['id']]);
            if ($upd->rowCount() === 0) json(['error' => 'Not found.'], 404);
            json(['message' => 'Updated.']);
        }
        case $key === 'POST fellow/entry': {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            $b = body();
            $id = research_entry_add(
                (int) $u['id'],
                (string) field($b, 'category'),
                research_fields_from_body($b),
                ($aid = (int) (field($b, 'assignment_id') ?: 0)) > 0 ? $aid : null
            );
            json(['message' => 'Saved.', 'id' => $id, 'entries' => research_entries_for_fellow((int) $u['id'], (string) field($b, 'category'))], 201);
        }
        case $method === 'PUT' && preg_match('#^fellow/entry/(\d+)$#', $route, $m) === 1: {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            $b = body();
            research_entry_update_own((int) $m[1], (int) $u['id'], research_fields_from_body($b));
            json(['message' => 'Updated.']);
        }
        case $method === 'DELETE' && preg_match('#^fellow/entry/(\d+)$#', $route, $m) === 1: {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            research_entry_delete_own((int) $m[1], (int) $u['id']);
            json(['message' => 'Deleted.']);
        }
        case $method === 'PUT' && preg_match('#^fellow/assignment/(\d+)/respond$#', $route, $m) === 1: {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            $b = body();
            $list = ecosystem_assignment_respond((int) $u['id'], (int) $m[1], (string) field($b, 'action'), (string) field($b, 'note'));
            json(['message' => 'Response saved.', 'assignments' => $list]);
        }

        case $key === 'POST fellow/import': {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            rate_limit('research_import', 20, 3600, (string) $u['id']);
            $b = body();
            $rows = is_array($b['rows'] ?? null) ? $b['rows'] : [];
            if (!$rows) json(['error' => 'No rows to import.'], 422);
            $cat = (string) field($b, 'category');
            $n = research_bulk_import((int) $u['id'], $cat, $rows);
            json(['message' => "Imported $n rows.", 'imported' => $n, 'entries' => research_entries_for_fellow((int) $u['id'], $cat)], 201);
        }

        /* ---------- Fellow CRM / Operating Dashboard (Phase 1a) ---------- */
        case $key === 'GET fellow/crm/overview': {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            fellow_ops_ensure_schema();
            $fid = (int) $u['id'];
            $sc = fellow_scorecard($fid);
            $tasks = db()->prepare("SELECT id, title, priority, status, due_date FROM fellow_tasks WHERE fellow_user_id = ? AND status <> 'completed' ORDER BY (due_date IS NULL), due_date ASC, id DESC LIMIT 20");
            $tasks->execute([$fid]);
            $fu = db()->prepare("SELECT f.id, f.org_id, f.due_date, f.reason, o.name AS org_name FROM fellow_followups f JOIN fellow_orgs o ON o.id = f.org_id WHERE f.fellow_user_id = ? AND f.status = 'pending' ORDER BY f.due_date ASC LIMIT 30");
            $fu->execute([$fid]);
            $fuRows = $fu->fetchAll();
            $today = date('Y-m-d');
            json([
                'scorecard' => $sc,
                'tasks' => $tasks->fetchAll(),
                'followups' => $fuRows,
                'followups_due' => count(array_filter($fuRows, static fn($r) => (string) $r['due_date'] <= $today)),
                'orgs_total' => (int) db()->query('SELECT COUNT(*) FROM fellow_orgs WHERE fellow_user_id = ' . $fid)->fetchColumn(),
                'demo_orgs' => (int) db()->query('SELECT COUNT(*) FROM fellow_orgs WHERE is_demo = 1 AND fellow_user_id = ' . $fid)->fetchColumn(),
            ]);
        }
        case $key === 'GET fellow/orgs': {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            $out = fellow_orgs_query((int) $u['id'], $_GET);
            json($out + ['stages' => FELLOW_STAGES, 'priorities' => FELLOW_PRIORITIES, 'totals' => fellow_orgs_totals((int) $u['id'])]);
        }
        case $key === 'GET fellow/orgs/check': {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            fellow_ops_ensure_schema();
            $key2 = fellow_name_key((string) ($_GET['name'] ?? ''));
            if ($key2 === '') json(['match' => null]);
            $s = db()->prepare('SELECT o.id, o.name, o.fellow_user_id, u.full_name AS fellow_name FROM fellow_orgs o LEFT JOIN users u ON u.id = o.fellow_user_id WHERE o.name_key = ? LIMIT 1');
            $s->execute([$key2]);
            json(['match' => $s->fetch() ?: null]);
        }
        case $key === 'POST fellow/org': {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            fellow_ops_ensure_schema();
            $b = body();
            $name = mb_substr(trim((string) field($b, 'name')), 0, 200);
            if ($name === '') json(['error' => 'Organization name is required.'], 422);
            $fid = (int) $u['id'];
            $stmt = db()->prepare('INSERT INTO fellow_orgs (fellow_user_id, created_by_user_id, name, website, industry, category, org_type, location, territory, priority, stage, est_value, fit_notes, name_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
            $stmt->execute([
                $fid, $fid, $name,
                mb_substr(trim((string) field($b, 'website')), 0, 255) ?: null,
                mb_substr(trim((string) field($b, 'industry')), 0, 120) ?: null,
                mb_substr(trim((string) field($b, 'category')), 0, 80) ?: null,
                mb_substr(trim((string) field($b, 'org_type')), 0, 80) ?: null,
                mb_substr(trim((string) field($b, 'location')), 0, 160) ?: null,
                mb_substr(trim((string) field($b, 'territory')), 0, 120) ?: null,
                in_array((string) field($b, 'priority'), FELLOW_PRIORITIES, true) ? (string) field($b, 'priority') : 'unreviewed',
                'researching', max(0, (int) ($b['est_value'] ?? 0)),
                mb_substr(trim((string) field($b, 'fit_notes')), 0, 2000) ?: null,
                fellow_name_key($name),
            ]);
            $id = (int) db()->lastInsertId();
            fellow_log($fid, $id, 'research', 'Added organization: ' . $name);
            json(['id' => $id, 'message' => 'Organization added.'], 201);
        }
        case $method === 'GET' && preg_match('#^fellow/org/(\d+)$#', $route, $m) === 1: {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            fellow_ops_ensure_schema();
            $id = (int) $m[1];
            $o = db()->prepare('SELECT * FROM fellow_orgs WHERE id = ? AND fellow_user_id = ? LIMIT 1');
            $o->execute([$id, (int) $u['id']]);
            $org = $o->fetch();
            if (!$org) json(['error' => 'Not found.'], 404);
            $c = db()->prepare('SELECT * FROM fellow_contacts WHERE org_id = ? ORDER BY is_primary DESC, id ASC'); $c->execute([$id]);
            $a = db()->prepare('SELECT type, detail, created_at FROM fellow_activities WHERE org_id = ? ORDER BY created_at DESC, id DESC LIMIT 100'); $a->execute([$id]);
            $f = db()->prepare("SELECT * FROM fellow_followups WHERE org_id = ? ORDER BY (status='pending') DESC, due_date ASC"); $f->execute([$id]);
            $pr = db()->prepare('SELECT * FROM fellow_proposals WHERE org_id = ? ORDER BY id DESC'); $pr->execute([$id]);
            $mt = db()->prepare('SELECT * FROM fellow_meetings WHERE org_id = ? ORDER BY meeting_at DESC, id DESC'); $mt->execute([$id]);
            json(['org' => $org, 'contacts' => $c->fetchAll(), 'timeline' => $a->fetchAll(), 'followups' => $f->fetchAll(), 'proposals' => $pr->fetchAll(), 'meetings' => $mt->fetchAll(), 'stages' => FELLOW_STAGES, 'priorities' => FELLOW_PRIORITIES, 'proposal_statuses' => FELLOW_PROPOSAL_STATUSES, 'meeting_types' => FELLOW_MEETING_TYPES]);
        }
        case $method === 'PUT' && preg_match('#^fellow/org/(\d+)$#', $route, $m) === 1: {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            fellow_ops_ensure_schema();
            $id = (int) $m[1]; $b = body(); $fid = (int) $u['id'];
            $own = db()->prepare('SELECT id FROM fellow_orgs WHERE id = ? AND fellow_user_id = ?'); $own->execute([$id, $fid]);
            if (!$own->fetch()) json(['error' => 'Not found.'], 404);
            $name = mb_substr(trim((string) field($b, 'name')), 0, 200);
            if ($name === '') json(['error' => 'Name required.'], 422);
            db()->prepare('UPDATE fellow_orgs SET name=?, website=?, industry=?, category=?, org_type=?, location=?, territory=?, priority=?, est_value=?, fit_notes=?, internal_notes=?, name_key=? WHERE id=?')
                ->execute([
                    $name, mb_substr(trim((string) field($b, 'website')), 0, 255) ?: null,
                    mb_substr(trim((string) field($b, 'industry')), 0, 120) ?: null,
                    mb_substr(trim((string) field($b, 'category')), 0, 80) ?: null,
                    mb_substr(trim((string) field($b, 'org_type')), 0, 80) ?: null,
                    mb_substr(trim((string) field($b, 'location')), 0, 160) ?: null,
                    mb_substr(trim((string) field($b, 'territory')), 0, 120) ?: null,
                    in_array((string) field($b, 'priority'), FELLOW_PRIORITIES, true) ? (string) field($b, 'priority') : 'unreviewed',
                    max(0, (int) ($b['est_value'] ?? 0)),
                    mb_substr(trim((string) field($b, 'fit_notes')), 0, 2000) ?: null,
                    mb_substr(trim((string) field($b, 'internal_notes')), 0, 2000) ?: null,
                    fellow_name_key($name), $id,
                ]);
            json(['message' => 'Saved.']);
        }
        // Remove a prospect added by mistake, with its whole history, so it stops
        // inflating the pipeline totals. Scoped to the Fellow who owns it.
        case $method === 'DELETE' && preg_match('#^fellow/org/(\d+)$#', $route, $m) === 1: {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            fellow_ops_ensure_schema();
            $id = (int) $m[1]; $fid = (int) $u['id'];
            rate_limit('fellow_org_delete', 40, 3600, (string) $fid);
            $own = db()->prepare('SELECT name FROM fellow_orgs WHERE id = ? AND fellow_user_id = ?'); $own->execute([$id, $fid]);
            $row = $own->fetch();
            if (!$row) json(['error' => 'Not found.'], 404);
            foreach (['fellow_contacts', 'fellow_followups', 'fellow_proposals', 'fellow_meetings'] as $tbl) {
                try { db()->prepare("DELETE FROM $tbl WHERE org_id = ?")->execute([$id]); } catch (Throwable $e) { /* table may lag */ }
            }
            // Keep the logged work: deleting activities would retroactively shrink
            // counts an admin already saw, and contradict a submitted daily report.
            try { db()->prepare('UPDATE fellow_activities SET org_id = NULL WHERE org_id = ?')->execute([$id]); } catch (Throwable $e) { /* best effort */ }
            // An admin-assigned task must not point at a row that no longer exists.
            try { db()->prepare('UPDATE fellow_tasks SET org_id = NULL WHERE org_id = ?')->execute([$id]); } catch (Throwable $e) { /* best effort */ }
            db()->prepare('DELETE FROM fellow_orgs WHERE id = ?')->execute([$id]);
            fellow_log($fid, null, 'note', 'Deleted prospect: ' . (string) $row['name']);
            json(['message' => 'Prospect deleted.']);
        }
        // Fix a mistyped contact — a wrong email otherwise makes that contact
        // permanently unreachable, since sending resolves from this row.
        case $method === 'PUT' && preg_match('#^fellow/contact/(\d+)$#', $route, $m) === 1: {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            fellow_ops_ensure_schema();
            $id = (int) $m[1]; $fid = (int) $u['id']; $b = body();
            $own = db()->prepare('SELECT c.id, c.org_id FROM fellow_contacts c JOIN fellow_orgs o ON o.id = c.org_id WHERE c.id = ? AND o.fellow_user_id = ?');
            $own->execute([$id, $fid]);
            $row = $own->fetch();
            if (!$row) json(['error' => 'Not found.'], 404);
            $name = mb_substr(trim((string) field($b, 'name')), 0, 160);
            if ($name === '') json(['error' => 'Contact name required.'], 422);
            $primary = !empty($b['is_primary']) ? 1 : 0;
            // Only one primary contact per organization.
            if ($primary === 1) db()->prepare('UPDATE fellow_contacts SET is_primary = 0 WHERE org_id = ?')->execute([(int) $row['org_id']]);
            db()->prepare('UPDATE fellow_contacts SET name=?, title=?, email=?, phone=?, linkedin=?, is_primary=? WHERE id=?')
                ->execute([$name, mb_substr(trim((string) field($b, 'title')), 0, 160) ?: null, mb_substr(trim((string) field($b, 'email')), 0, 160) ?: null,
                    mb_substr(trim((string) field($b, 'phone')), 0, 60) ?: null, mb_substr(trim((string) field($b, 'linkedin')), 0, 255) ?: null, $primary, $id]);
            json(['message' => 'Contact saved.']);
        }
        case $method === 'DELETE' && preg_match('#^fellow/contact/(\d+)$#', $route, $m) === 1: {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            fellow_ops_ensure_schema();
            $id = (int) $m[1]; $fid = (int) $u['id'];
            $own = db()->prepare('SELECT c.id FROM fellow_contacts c JOIN fellow_orgs o ON o.id = c.org_id WHERE c.id = ? AND o.fellow_user_id = ?');
            $own->execute([$id, $fid]);
            if (!$own->fetch()) json(['error' => 'Not found.'], 404);
            db()->prepare('DELETE FROM fellow_contacts WHERE id = ?')->execute([$id]);
            json(['message' => 'Contact removed.']);
        }
        // Record what actually happened after a meeting takes place.
        case $method === 'PUT' && preg_match('#^fellow/meeting/(\d+)$#', $route, $m) === 1: {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            fellow_ops_ensure_schema();
            $id = (int) $m[1]; $fid = (int) $u['id']; $b = body();
            $own = db()->prepare('SELECT id, org_id FROM fellow_meetings WHERE id = ? AND fellow_user_id = ?');
            $own->execute([$id, $fid]);
            $row = $own->fetch();
            if (!$row) json(['error' => 'Not found.'], 404);
            $when = trim((string) field($b, 'meeting_at'));
            $type = in_array((string) field($b, 'type'), FELLOW_MEETING_TYPES, true) ? (string) field($b, 'type') : 'zoom';
            db()->prepare('UPDATE fellow_meetings SET meeting_at=?, type=?, purpose=?, notes=?, outcome=?, next_steps=? WHERE id=?')
                ->execute([$when !== '' ? str_replace('T', ' ', $when) : null, $type,
                    mb_substr(trim((string) field($b, 'purpose')), 0, 255) ?: null,
                    mb_substr(trim((string) field($b, 'notes')), 0, 2000) ?: null,
                    mb_substr(trim((string) field($b, 'outcome')), 0, 255) ?: null,
                    mb_substr(trim((string) field($b, 'next_steps')), 0, 2000) ?: null, $id]);
            $outcome = trim((string) field($b, 'outcome'));
            if ($outcome !== '') fellow_log($fid, (int) $row['org_id'], 'meeting', 'Meeting outcome: ' . $outcome);
            // Chase the agreed next step rather than trusting memory.
            $fu = trim((string) field($b, 'follow_up_date'));
            if ($fu !== '') db()->prepare('INSERT INTO fellow_followups (org_id, fellow_user_id, due_date, method, reason) VALUES (?,?,?,?,?)')
                ->execute([(int) $row['org_id'], $fid, $fu, 'meeting', mb_substr('Next step: ' . trim((string) field($b, 'next_steps')), 0, 255)]);
            json(['message' => 'Meeting updated.']);
        }
        // Reschedule or cancel a follow-up. Neither counts as work done, so
        // neither writes an activity row — the scorecard stays honest.
        case $method === 'PUT' && preg_match('#^fellow/followup/(\d+)$#', $route, $m) === 1: {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            fellow_ops_ensure_schema();
            $id = (int) $m[1]; $fid = (int) $u['id']; $b = body();
            $own = db()->prepare("SELECT id FROM fellow_followups WHERE id = ? AND fellow_user_id = ? AND status = 'pending'");
            $own->execute([$id, $fid]);
            if (!$own->fetch()) json(['error' => 'Not found.'], 404);
            $due = trim((string) field($b, 'due_date'));
            if ($due === '') json(['error' => 'Pick a date.'], 422);
            db()->prepare('UPDATE fellow_followups SET due_date = ?, reason = ? WHERE id = ?')
                ->execute([$due, mb_substr(trim((string) field($b, 'reason')), 0, 255) ?: null, $id]);
            json(['message' => 'Follow-up rescheduled.']);
        }
        case $method === 'DELETE' && preg_match('#^fellow/followup/(\d+)$#', $route, $m) === 1: {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            fellow_ops_ensure_schema();
            $id = (int) $m[1]; $fid = (int) $u['id'];
            $own = db()->prepare("SELECT id FROM fellow_followups WHERE id = ? AND fellow_user_id = ? AND status = 'pending'");
            $own->execute([$id, $fid]);
            if (!$own->fetch()) json(['error' => 'Not found.'], 404);
            db()->prepare("UPDATE fellow_followups SET status = 'cancelled', done_at = NOW() WHERE id = ?")->execute([$id]);
            json(['message' => 'Follow-up cancelled.']);
        }
        case $method === 'PUT' && preg_match('#^fellow/org/(\d+)/stage$#', $route, $m) === 1: {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            fellow_ops_ensure_schema();
            $id = (int) $m[1]; $fid = (int) $u['id'];
            $stage = (string) field(body(), 'stage');
            if (!in_array($stage, FELLOW_STAGES, true)) json(['error' => 'Invalid stage.'], 422);
            $own = db()->prepare('SELECT name FROM fellow_orgs WHERE id = ? AND fellow_user_id = ?'); $own->execute([$id, $fid]);
            $row = $own->fetch();
            if (!$row) json(['error' => 'Not found.'], 404);
            db()->prepare('UPDATE fellow_orgs SET stage = ? WHERE id = ?')->execute([$stage, $id]);
            fellow_log($fid, $id, 'stage', 'Moved to ' . str_replace('_', ' ', $stage));
            json(['message' => 'Stage updated.']);
        }
        case $method === 'POST' && preg_match('#^fellow/org/(\d+)/contact$#', $route, $m) === 1: {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            fellow_ops_ensure_schema();
            $id = (int) $m[1]; $fid = (int) $u['id']; $b = body();
            $own = db()->prepare('SELECT id FROM fellow_orgs WHERE id = ? AND fellow_user_id = ?'); $own->execute([$id, $fid]);
            if (!$own->fetch()) json(['error' => 'Not found.'], 404);
            $name = mb_substr(trim((string) field($b, 'name')), 0, 160);
            if ($name === '') json(['error' => 'Contact name required.'], 422);
            db()->prepare('INSERT INTO fellow_contacts (org_id, name, title, email, phone, linkedin, is_primary) VALUES (?,?,?,?,?,?,?)')
                ->execute([$id, $name, mb_substr(trim((string) field($b, 'title')), 0, 160) ?: null, mb_substr(trim((string) field($b, 'email')), 0, 160) ?: null, mb_substr(trim((string) field($b, 'phone')), 0, 60) ?: null, mb_substr(trim((string) field($b, 'linkedin')), 0, 255) ?: null, !empty($b['is_primary']) ? 1 : 0]);
            fellow_log($fid, $id, 'contact', 'Added contact: ' . $name);
            json(['message' => 'Contact added.'], 201);
        }
        case $method === 'POST' && preg_match('#^fellow/org/(\d+)/activity$#', $route, $m) === 1: {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            fellow_ops_ensure_schema();
            $id = (int) $m[1]; $fid = (int) $u['id']; $b = body();
            $own = db()->prepare('SELECT id FROM fellow_orgs WHERE id = ? AND fellow_user_id = ?'); $own->execute([$id, $fid]);
            if (!$own->fetch()) json(['error' => 'Not found.'], 404);
            $type = (string) field($b, 'type');
            if (!in_array($type, FELLOW_ACTIVITY_TYPES, true)) json(['error' => 'Invalid activity type.'], 422);
            fellow_log($fid, $id, $type, (string) field($b, 'detail'));
            // Optionally schedule a follow-up in the same step.
            $fuDate = trim((string) field($b, 'follow_up_date'));
            if ($fuDate !== '') {
                db()->prepare('INSERT INTO fellow_followups (org_id, fellow_user_id, due_date, method, reason) VALUES (?,?,?,?,?)')
                    ->execute([$id, $fid, $fuDate, mb_substr(trim((string) field($b, 'method')), 0, 40) ?: null, mb_substr(trim((string) field($b, 'detail')), 0, 255) ?: null]);
            }
            json(['message' => 'Logged.'], 201);
        }

        /* ---- Proposals & Meetings (Phase 2a) ---- */
        case $key === 'GET fellow/proposals': {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            fellow_ops_ensure_schema();
            $s = db()->prepare("SELECT p.*, o.name AS org_name FROM fellow_proposals p JOIN fellow_orgs o ON o.id = p.org_id WHERE p.fellow_user_id = ? ORDER BY p.updated_at DESC");
            $s->execute([(int) $u['id']]);
            json(['proposals' => $s->fetchAll(), 'statuses' => FELLOW_PROPOSAL_STATUSES]);
        }
        case $method === 'POST' && preg_match('#^fellow/org/(\d+)/proposal$#', $route, $m) === 1: {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            fellow_ops_ensure_schema();
            $fid = (int) $u['id']; $id = (int) $m[1]; $b = body();
            $own = db()->prepare('SELECT name FROM fellow_orgs WHERE id = ? AND fellow_user_id = ?'); $own->execute([$id, $fid]);
            $org = $own->fetch();
            if (!$org) json(['error' => 'Not found.'], 404);
            // Fellows may NOT set "approved" — that's the admin's gate.
            $fellowStatuses = ['draft', 'submitted', 'sent', 'under_review', 'accepted', 'declined'];
            $status = in_array((string) field($b, 'status'), $fellowStatuses, true) ? (string) field($b, 'status') : 'draft';
            db()->prepare('INSERT INTO fellow_proposals (org_id, fellow_user_id, contact_name, amount, level, status, notes, next_followup) VALUES (?,?,?,?,?,?,?,?)')
                ->execute([$id, $fid, mb_substr(trim((string) field($b, 'contact_name')), 0, 160) ?: null, max(0, (int) ($b['amount'] ?? 0)), mb_substr(trim((string) field($b, 'level')), 0, 80) ?: null, $status, mb_substr(trim((string) field($b, 'notes')), 0, 2000) ?: null, trim((string) field($b, 'next_followup')) ?: null]);
            fellow_log($fid, $id, 'proposal', 'Proposal ' . ($status === 'submitted' ? 'submitted for approval' : $status) . (($b['amount'] ?? 0) ? ' ($' . (int) $b['amount'] . ')' : ''));
            if ($status === 'submitted') { try { new_school_add_notification(null, 'admin', 'fellow_proposal', 'Proposal needs approval', ($org['name'] ?? 'Org') . ' — $' . (int) ($b['amount'] ?? 0), []); } catch (Throwable $e) {} }
            json(['message' => 'Proposal saved.'], 201);
        }
        case $method === 'PUT' && preg_match('#^fellow/proposal/(\d+)$#', $route, $m) === 1: {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            fellow_ops_ensure_schema();
            $status = (string) field(body(), 'status');
            // Fellows may NOT self-approve — "approved" is admin-only.
            if (!in_array($status, ['draft', 'submitted', 'sent', 'under_review', 'accepted', 'declined'], true)) json(['error' => 'Invalid status.'], 422);
            $r = db()->prepare('UPDATE fellow_proposals SET status = ? WHERE id = ? AND fellow_user_id = ?');
            $r->execute([$status, (int) $m[1], (int) $u['id']]);
            if ($status === 'submitted' && $r->rowCount() > 0) {
                $og = db()->prepare('SELECT o.name FROM fellow_proposals p JOIN fellow_orgs o ON o.id = p.org_id WHERE p.id = ?'); $og->execute([(int) $m[1]]);
                try { new_school_add_notification(null, 'admin', 'fellow_proposal', 'Proposal needs approval', (string) ($og->fetchColumn() ?: 'Proposal'), []); } catch (Throwable $e) {}
            }
            json(['message' => 'Updated.']);
        }
        // Every contact this Fellow can email — powers the standalone composer.
        case $key === 'GET fellow/contacts': {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            fellow_ops_ensure_schema();
            $s = db()->prepare("SELECT c.id, c.name, c.title, c.email, c.phone, o.id AS org_id, o.name AS org_name, o.stage
                FROM fellow_contacts c JOIN fellow_orgs o ON o.id = c.org_id
                WHERE o.fellow_user_id = ? AND c.email IS NOT NULL AND c.email <> ''
                ORDER BY o.name, c.is_primary DESC, c.name");
            $s->execute([(int) $u['id']]);
            json(['contacts' => $s->fetchAll()]);
        }
        case $method === 'POST' && preg_match('#^fellow/org/(\d+)/send-email$#', $route, $m) === 1: {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            fellow_ops_ensure_schema();
            $fid = (int) $u['id']; $id = (int) $m[1]; $b = body();
            rate_limit('fellow_send_email', 40, 3600, (string) $fid);
            // The recipient must be a saved contact on THIS fellow's org (anti-abuse).
            $cq = db()->prepare('SELECT c.name, c.email FROM fellow_contacts c JOIN fellow_orgs o ON o.id = c.org_id WHERE c.id = ? AND o.id = ? AND o.fellow_user_id = ? LIMIT 1');
            $cq->execute([(int) ($b['contact_id'] ?? 0), $id, $fid]);
            $contact = $cq->fetch();
            if (!$contact || trim((string) $contact['email']) === '') json(['error' => 'Pick a contact that has an email address.'], 422);
            $subject = mb_substr(trim((string) field($b, 'subject')), 0, 240);
            $bodyTxt = trim((string) field($b, 'body'));
            if ($subject === '' || $bodyTxt === '') json(['error' => 'Subject and message are required.'], 422);
            $sig = "\n\n—\nSent via the Student Impact Challenge on behalf of " . (string) $u['full_name'] . "\nFrantzCoutard.com";
            $ok = function_exists('mail_queue_enqueue')
                ? mail_queue_enqueue('fellow_outreach', (string) $contact['email'], $subject, $bodyTxt . $sig)
                : send_mail_message((string) $contact['email'], $subject, $bodyTxt . $sig);
            if (!$ok) json(['error' => 'Could not queue the email. Try again.'], 500);
            fellow_log($fid, $id, 'email', 'Sent "' . $subject . '" → ' . $contact['name']);
            $fu = trim((string) field($b, 'follow_up_date'));
            if ($fu !== '') db()->prepare('INSERT INTO fellow_followups (org_id, fellow_user_id, due_date, method, reason) VALUES (?,?,?,?,?)')->execute([$id, $fid, $fu, 'email', 'Reply to: ' . $subject]);
            json(['message' => 'Email sent to ' . $contact['email'] . '.'], 201);
        }
        case $method === 'POST' && preg_match('#^fellow/org/(\d+)/meeting$#', $route, $m) === 1: {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            fellow_ops_ensure_schema();
            $fid = (int) $u['id']; $id = (int) $m[1]; $b = body();
            $own = db()->prepare('SELECT id FROM fellow_orgs WHERE id = ? AND fellow_user_id = ?'); $own->execute([$id, $fid]);
            if (!$own->fetch()) json(['error' => 'Not found.'], 404);
            $type = in_array((string) field($b, 'type'), FELLOW_MEETING_TYPES, true) ? (string) field($b, 'type') : 'zoom';
            $when = trim((string) field($b, 'meeting_at'));
            db()->prepare('INSERT INTO fellow_meetings (org_id, fellow_user_id, contact_name, meeting_at, type, purpose, notes, outcome, next_steps) VALUES (?,?,?,?,?,?,?,?,?)')
                ->execute([$id, $fid, mb_substr(trim((string) field($b, 'contact_name')), 0, 160) ?: null, $when !== '' ? str_replace('T', ' ', $when) : null, $type, mb_substr(trim((string) field($b, 'purpose')), 0, 255) ?: null, mb_substr(trim((string) field($b, 'notes')), 0, 2000) ?: null, mb_substr(trim((string) field($b, 'outcome')), 0, 255) ?: null, mb_substr(trim((string) field($b, 'next_steps')), 0, 2000) ?: null]);
            fellow_log($fid, $id, 'meeting', trim(($type) . ' meeting' . (field($b, 'purpose') ? ' — ' . field($b, 'purpose') : '')));
            json(['message' => 'Meeting logged.'], 201);
        }
        case $key === 'GET fellow/crm/performance': {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            json(['performance' => fellow_performance((int) $u['id'])]);
        }
        case $key === 'GET fellow/templates': {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            fellow_ops_ensure_schema();
            json(['templates' => db()->query("SELECT id, kind, category, name, subject, body FROM fellow_templates WHERE is_active = 1 ORDER BY kind, sort_order, id")->fetchAll(), 'kinds' => FELLOW_TEMPLATE_KINDS]);
        }
        case $key === 'GET fellow/call-list': {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            json(fellow_call_list((int) $u['id'], $_GET) + ['stages' => FELLOW_STAGES]);
        }
        case $key === 'GET fellow/modules': {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            fellow_ops_ensure_schema();
            if ((int) db()->query('SELECT COUNT(*) FROM fellow_modules')->fetchColumn() === 0) fellow_modules_sync();
            $mods = db()->query('SELECT id, category, title, description, doc_url, video_url, sort_order FROM fellow_modules WHERE is_active = 1 ORDER BY category, sort_order, id')->fetchAll();
            $pr = db()->prepare('SELECT module_id FROM fellow_module_progress WHERE fellow_user_id = ?'); $pr->execute([(int) $u['id']]);
            $done = array_map(static fn($r) => (int) $r['module_id'], $pr->fetchAll());
            json(['modules' => $mods, 'completed' => $done]);
        }
        case $key === 'GET fellow/quiz': {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            fellow_ops_ensure_schema();
            $qs = db()->query('SELECT id, question, options_json FROM fellow_quiz_questions WHERE is_active = 1 ORDER BY sort_order, id')->fetchAll();
            $questions = array_map(static fn($q) => ['id' => (int) $q['id'], 'question' => $q['question'], 'options' => json_decode((string) $q['options_json'], true) ?: []], $qs);
            json(['questions' => $questions, 'cert' => fellow_cert_status((int) $u['id'])]);
        }
        case $key === 'POST fellow/quiz/submit': {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            fellow_ops_ensure_schema();
            $fid = (int) $u['id'];
            $answers = is_array(body()['answers'] ?? null) ? body()['answers'] : [];
            $qs = db()->query('SELECT id, correct_index FROM fellow_quiz_questions WHERE is_active = 1')->fetchAll();
            if (count($qs) === 0) json(['error' => 'No exam questions are set up yet.'], 422);
            $correct = 0;
            foreach ($qs as $q) { if ((int) ($answers[(string) $q['id']] ?? -1) === (int) $q['correct_index']) $correct++; }
            $total = count($qs);
            $score = (int) round(($correct / $total) * 100);
            $passed = $score >= FELLOW_QUIZ_PASS ? 1 : 0;
            db()->prepare('INSERT INTO fellow_quiz_attempts (fellow_user_id, score, passed, total, correct) VALUES (?,?,?,?,?)')
                ->execute([$fid, $score, $passed, $total, $correct]);
            fellow_log($fid, null, 'note', 'Certification exam: ' . $score . '% (' . ($passed ? 'passed' : 'not passed') . ')');
            if ($passed) { try { new_school_add_notification(null, 'admin', 'fellow_certified', 'Fellow certified', (string) $u['full_name'] . ' passed the certification exam (' . $score . '%).', []); } catch (Throwable $e) {} }
            json(['score' => $score, 'passed' => (bool) $passed, 'correct' => $correct, 'total' => $total, 'cert' => fellow_cert_status($fid)]);
        }
        case $method === 'POST' && preg_match('#^fellow/module/(\d+)/complete$#', $route, $m) === 1: {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            fellow_ops_ensure_schema();
            $done = !empty(body()['done']);
            if ($done) db()->prepare('INSERT IGNORE INTO fellow_module_progress (fellow_user_id, module_id) VALUES (?,?)')->execute([(int) $u['id'], (int) $m[1]]);
            else db()->prepare('DELETE FROM fellow_module_progress WHERE fellow_user_id = ? AND module_id = ?')->execute([(int) $u['id'], (int) $m[1]]);
            json(['message' => 'Saved.']);
        }
        case $key === 'GET admin/fellow-ops/quiz': {
            require_admin(); fellow_ops_ensure_schema();
            $qs = array_map(static function ($q) {
                $q['options'] = json_decode((string) $q['options_json'], true) ?: []; unset($q['options_json']);
                $q['correct_index'] = (int) $q['correct_index']; return $q;
            }, db()->query('SELECT * FROM fellow_quiz_questions ORDER BY sort_order, id')->fetchAll());
            json(['questions' => $qs, 'pass' => FELLOW_QUIZ_PASS]);
        }
        case $key === 'POST admin/fellow-ops/quiz-question': {
            require_admin(); fellow_ops_ensure_schema();
            $b = body();
            $q = mb_substr(trim((string) field($b, 'question')), 0, 600);
            $opts = is_array($b['options'] ?? null) ? array_values(array_map(static fn($o) => mb_substr(trim((string) $o), 0, 300), $b['options'])) : [];
            $opts = array_values(array_filter($opts, static fn($o) => $o !== ''));
            if ($q === '' || count($opts) < 2) json(['error' => 'A question and at least two options are required.'], 422);
            $ci = max(0, min(count($opts) - 1, (int) ($b['correct_index'] ?? 0)));
            db()->prepare('INSERT INTO fellow_quiz_questions (question, options_json, correct_index, sort_order, is_active) VALUES (?,?,?,?,?)')
                ->execute([$q, json_encode($opts, JSON_UNESCAPED_UNICODE), $ci, (int) ($b['sort_order'] ?? 0), empty($b['is_active']) ? 0 : 1]);
            json(['id' => (int) db()->lastInsertId(), 'message' => 'Question added.'], 201);
        }
        case $method === 'PUT' && preg_match('#^admin/fellow-ops/quiz-question/(\d+)$#', $route, $m) === 1: {
            require_admin(); fellow_ops_ensure_schema();
            $b = body();
            $q = mb_substr(trim((string) field($b, 'question')), 0, 600);
            $opts = is_array($b['options'] ?? null) ? array_values(array_filter(array_map(static fn($o) => mb_substr(trim((string) $o), 0, 300), $b['options']), static fn($o) => $o !== '')) : [];
            if ($q === '' || count($opts) < 2) json(['error' => 'A question and at least two options are required.'], 422);
            $ci = max(0, min(count($opts) - 1, (int) ($b['correct_index'] ?? 0)));
            db()->prepare('UPDATE fellow_quiz_questions SET question=?, options_json=?, correct_index=?, sort_order=?, is_active=? WHERE id=?')
                ->execute([$q, json_encode($opts, JSON_UNESCAPED_UNICODE), $ci, (int) ($b['sort_order'] ?? 0), empty($b['is_active']) ? 0 : 1, (int) $m[1]]);
            json(['message' => 'Question updated.']);
        }
        case $method === 'DELETE' && preg_match('#^admin/fellow-ops/quiz-question/(\d+)$#', $route, $m) === 1: {
            require_admin(); fellow_ops_ensure_schema();
            db()->prepare('DELETE FROM fellow_quiz_questions WHERE id = ?')->execute([(int) $m[1]]);
            json(['message' => 'Deleted.']);
        }
        case $key === 'GET admin/fellow-ops/certifications': {
            require_admin(); fellow_ops_ensure_schema();
            $rows = db()->query(
                "SELECT u.id, u.full_name,
                        (SELECT COUNT(*) FROM fellow_quiz_attempts a WHERE a.fellow_user_id = u.id) AS attempts,
                        (SELECT MAX(a.score) FROM fellow_quiz_attempts a WHERE a.fellow_user_id = u.id) AS best,
                        (SELECT MAX(a.passed) FROM fellow_quiz_attempts a WHERE a.fellow_user_id = u.id) AS passed
                 FROM users u WHERE u.role = 'fellow' ORDER BY u.full_name"
            )->fetchAll();
            $out = array_map(static function ($r) {
                $att = (int) $r['attempts'];
                $r['status'] = $att === 0 ? 'Training' : ((int) $r['passed'] === 1 ? 'Certified' : 'Needs Retraining');
                $r['best'] = (int) $r['best']; $r['attempts'] = $att; return $r;
            }, $rows);
            json(['fellows' => $out, 'pass' => FELLOW_QUIZ_PASS]);
        }
        case $key === 'GET admin/fellow-ops/modules': {
            require_admin(); fellow_ops_ensure_schema(); fellow_modules_sync();
            json(['modules' => db()->query('SELECT * FROM fellow_modules ORDER BY category, sort_order, id')->fetchAll()]);
        }
        case $key === 'POST admin/fellow-ops/modules/sync': {
            require_admin();
            $n = fellow_modules_sync();
            json(['message' => "Synced — $n new document(s) added.", 'added' => $n]);
        }
        case $method === 'PUT' && preg_match('#^admin/fellow-ops/module/(\d+)$#', $route, $m) === 1: {
            require_admin(); fellow_ops_ensure_schema();
            $b = body();
            $title = mb_substr(trim((string) field($b, 'title')), 0, 240);
            if ($title === '') json(['error' => 'Title required.'], 422);
            db()->prepare('UPDATE fellow_modules SET category=?, title=?, description=?, video_url=?, sort_order=?, is_active=? WHERE id=?')
                ->execute([mb_substr(trim((string) field($b, 'category')) ?: 'Training & Playbooks', 0, 60), $title,
                    mb_substr(trim((string) field($b, 'description')), 0, 400) ?: null,
                    mb_substr(trim((string) field($b, 'video_url')), 0, 500) ?: null,
                    (int) ($b['sort_order'] ?? 0), empty($b['is_active']) ? 0 : 1, (int) $m[1]]);
            json(['message' => 'Module updated.']);
        }
        case $key === 'GET fellow/materials': {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            fellow_ops_ensure_schema();
            json(['materials' => db()->query("SELECT id, category, title, description, url FROM fellow_materials WHERE is_active = 1 ORDER BY category, sort_order, id")->fetchAll()]);
        }
        case $key === 'GET fellow/reports': {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            fellow_ops_ensure_schema();
            $s = db()->prepare('SELECT report_date, numbers_json, wins, challenges, help_needed, plan FROM fellow_reports WHERE fellow_user_id = ? ORDER BY report_date DESC LIMIT 30');
            $s->execute([(int) $u['id']]);
            json(['reports' => $s->fetchAll(), 'today_numbers' => fellow_scorecard((int) $u['id'])['counts']]);
        }
        case $key === 'POST fellow/report': {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            fellow_ops_ensure_schema();
            $b = body();
            $numbers = json_encode(fellow_scorecard((int) $u['id'])['counts'], JSON_UNESCAPED_SLASHES);
            db()->prepare('INSERT INTO fellow_reports (fellow_user_id, report_date, numbers_json, wins, challenges, help_needed, plan) VALUES (?, CURDATE(), ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE numbers_json=VALUES(numbers_json), wins=VALUES(wins), challenges=VALUES(challenges), help_needed=VALUES(help_needed), plan=VALUES(plan)')
                ->execute([(int) $u['id'], $numbers,
                    mb_substr(trim((string) field($b, 'wins')), 0, 2000) ?: null,
                    mb_substr(trim((string) field($b, 'challenges')), 0, 2000) ?: null,
                    mb_substr(trim((string) field($b, 'help_needed')), 0, 2000) ?: null,
                    mb_substr(trim((string) field($b, 'plan')), 0, 2000) ?: null]);
            json(['message' => 'Daily report submitted.'], 201);
        }
        // Load / clear sample prospects so a new Fellow can learn the tool with data in it.
        case $key === 'POST fellow/demo-data': {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            rate_limit('fellow_demo', 10, 3600, (string) $u['id']);
            $n = fellow_demo_seed((int) $u['id']);
            json(['message' => $n > 0 ? "Loaded $n sample prospects. Clear them any time." : 'Sample prospects are already loaded.', 'added' => $n]);
        }
        case $key === 'DELETE fellow/demo-data': {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            rate_limit('fellow_demo', 10, 3600, (string) $u['id']);
            $n = fellow_demo_clear((int) $u['id']);
            json(['message' => "Removed $n sample prospects.", 'removed' => $n]);
        }
        case $key === 'POST fellow/orgs/import': {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            fellow_ops_ensure_schema();
            rate_limit('fellow_import', 20, 3600, (string) $u['id']);
            $fid = (int) $u['id'];
            $rows = is_array(body()['rows'] ?? null) ? body()['rows'] : [];
            $cat = mb_substr(trim((string) field(body(), 'category')), 0, 80) ?: null;
            $n = 0;
            foreach ($rows as $r) {
                $name = mb_substr(trim((string) (is_array($r) ? ($r['name'] ?? '') : $r)), 0, 200);
                if ($name === '') continue;
                $keyN = fellow_name_key($name);
                $dup = db()->prepare('SELECT id FROM fellow_orgs WHERE name_key = ? AND fellow_user_id = ? LIMIT 1');
                $dup->execute([$keyN, $fid]);
                if ($dup->fetch()) continue; // skip duplicates for this fellow
                db()->prepare('INSERT INTO fellow_orgs (fellow_user_id, created_by_user_id, name, website, category, priority, stage, name_key) VALUES (?,?,?,?,?,?,?,?)')
                    ->execute([$fid, $fid, $name, mb_substr(trim((string) (is_array($r) ? ($r['website'] ?? '') : '')), 0, 255) ?: null, $cat, 'unreviewed', 'researching', $keyN]);
                // One research activity per org so the scorecard credits each (matches the manual Add path).
                fellow_log($fid, (int) db()->lastInsertId(), 'research', 'Imported: ' . $name);
                $n++;
            }
            json(['message' => "Imported $n organizations.", 'imported' => $n], 201);
        }
        /* ---- Shared task workspace: the Fellow's side ---- */
        case $key === 'GET fellow/tasks': {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            $filter = in_array((string) ($_GET['filter'] ?? 'open'), ['open', 'done', 'all'], true) ? (string) ($_GET['filter'] ?? 'open') : 'open';
            json(['tasks' => fellow_tasks_for((int) $u['id'], $filter), 'statuses' => FELLOW_TASK_STATUSES]);
        }
        case $method === 'GET' && preg_match('#^fellow/task/(\d+)$#', $route, $m) === 1: {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            fellow_ops_ensure_schema();
            $own = db()->prepare('SELECT id FROM fellow_tasks WHERE id = ? AND fellow_user_id = ?');
            $own->execute([(int) $m[1], (int) $u['id']]);
            if (!$own->fetch()) json(['error' => 'Not found.'], 404);
            $t = fellow_task_thread((int) $m[1], 'fellow');
            json($t + ['statuses' => FELLOW_TASK_STATUSES]);
        }
        // A Fellow hands in a real file rather than hosting it somewhere else.
        case $method === 'POST' && preg_match('#^fellow/task/(\d+)/upload$#', $route, $m) === 1: {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            fellow_ops_ensure_schema();
            rate_limit('fellow_task_upload', 60, 3600, (string) $u['id']);
            $own = db()->prepare('SELECT id FROM fellow_tasks WHERE id = ? AND fellow_user_id = ?');
            $own->execute([(int) $m[1], (int) $u['id']]);
            if (!$own->fetch()) json(['error' => 'Not found.'], 404);
            $f = fellow_task_store_upload();
            json(['message' => 'Uploaded.', 'url' => $f['url'], 'name' => $f['name']], 201);
        }
        // A Fellow raises their own item - a request, a blocker, an idea.
        case $key === 'POST fellow/task/request': {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            fellow_ops_ensure_schema();
            rate_limit('fellow_task_request', 30, 3600, (string) $u['id']);
            $b = body();
            $title = mb_substr(trim((string) field($b, 'title')), 0, 200);
            if ($title === '') json(['error' => 'Give your request a short title.'], 422);
            $detail = mb_substr(trim((string) field($b, 'instructions')), 0, 2000);
            db()->prepare("INSERT INTO fellow_tasks (fellow_user_id, assigned_by_user_id, title, instructions, priority, status, requested_by_fellow)
                VALUES (?, NULL, ?, ?, ?, 'waiting', 1)")
                ->execute([(int) $u['id'], $title, $detail ?: null,
                    in_array((string) field($b, 'priority'), ['low', 'medium', 'high'], true) ? (string) field($b, 'priority') : 'medium']);
            $tid = (int) db()->lastInsertId();
            if ($detail !== '') { try { fellow_task_post($tid, (int) $u['id'], 'fellow', $detail); } catch (Throwable $e) { /* best effort */ } }
            try {
                new_school_add_notification(null, 'admin', 'fellow_task', 'Fellow raised a request: ' . $title,
                    (string) $u['full_name'] . ($detail !== '' ? ' - ' . mb_substr($detail, 0, 140) : ''), ['task_id' => $tid]);
            } catch (Throwable $e) { /* best effort */ }
            json(['message' => 'Sent to your manager.', 'id' => $tid], 201);
        }
        case $method === 'POST' && preg_match('#^fellow/task/(\d+)/message$#', $route, $m) === 1: {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            fellow_ops_ensure_schema();
            rate_limit('fellow_task_msg', 200, 3600, (string) $u['id']);
            $own = db()->prepare('SELECT id FROM fellow_tasks WHERE id = ? AND fellow_user_id = ?');
            $own->execute([(int) $m[1], (int) $u['id']]);
            if (!$own->fetch()) json(['error' => 'Not found.'], 404);
            fellow_task_post((int) $m[1], (int) $u['id'], 'fellow', (string) field(body(), 'body'), (string) field(body(), 'attachment_url'));
            json(['message' => 'Sent.'], 201);
        }
        /* Status, plus the work itself: a Fellow can accept, decline with a
           reason, hand in a deliverable, or ask for review. */
        case $method === 'PUT' && preg_match('#^fellow/task/(\d+)$#', $route, $m) === 1: {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            fellow_ops_ensure_schema();
            $id = (int) $m[1]; $fid = (int) $u['id']; $b = body();
            $own = db()->prepare('SELECT status, title FROM fellow_tasks WHERE id = ? AND fellow_user_id = ?');
            $own->execute([$id, $fid]);
            $cur = $own->fetch();
            if (!$cur) json(['error' => 'Not found.'], 404);
            $status = (string) field($b, 'status');
            // 'needs_review' is the admin's verdict, not something a Fellow claims.
            $allowed = ['not_started', 'accepted', 'in_progress', 'waiting', 'submitted', 'completed', 'declined'];
            if (!in_array($status, $allowed, true)) json(['error' => 'Invalid status.'], 422);
            $reason = mb_substr(trim((string) field($b, 'declined_reason')), 0, 500);
            if ($status === 'declined' && $reason === '') json(['error' => 'Say why you cannot take this on.'], 422);
            db()->prepare('UPDATE fellow_tasks SET status = ?, notes = COALESCE(NULLIF(?, \'\'), notes),
                    deliverable_url = COALESCE(NULLIF(?, \'\'), deliverable_url),
                    declined_reason = COALESCE(NULLIF(?, \'\'), declined_reason),
                    accepted_at = CASE WHEN ? IN (\'accepted\',\'in_progress\') AND accepted_at IS NULL THEN NOW() ELSE accepted_at END,
                    submitted_at = CASE WHEN ? = \'submitted\' THEN NOW() ELSE submitted_at END,
                    completed_at = CASE WHEN ? = \'completed\' THEN NOW() ELSE NULL END
                WHERE id = ? AND fellow_user_id = ?')
                ->execute([$status, mb_substr(trim((string) field($b, 'notes')), 0, 2000),
                    mb_substr(trim((string) field($b, 'deliverable_url')), 0, 500), $reason,
                    $status, $status, $status, $id, $fid]);
            // Tell the admin about the moments they need to act on.
            if (in_array($status, ['submitted', 'declined', 'waiting'], true) && $status !== (string) $cur['status']) {
                try {
                    new_school_add_notification(null, 'admin', 'fellow_task',
                        'Task ' . str_replace('_', ' ', $status) . ': ' . (string) $cur['title'],
                        (string) $u['full_name'] . ($reason !== '' ? ' — ' . $reason : ''), ['task_id' => $id]);
                } catch (Throwable $e) { /* best effort */ }
            }
            json(['message' => 'Task updated.']);
        }
        case $method === 'POST' && preg_match('#^fellow/followup/(\d+)/done$#', $route, $m) === 1: {
            $u = require_login();
            if (($u['role'] ?? '') !== 'fellow') json(['error' => 'Fellows only.'], 403);
            fellow_ops_ensure_schema();
            $fid = (int) $u['id']; $b = body();
            $fu = db()->prepare('SELECT org_id FROM fellow_followups WHERE id = ? AND fellow_user_id = ?'); $fu->execute([(int) $m[1], $fid]);
            $row = $fu->fetch();
            if (!$row) json(['error' => 'Not found.'], 404);
            db()->prepare("UPDATE fellow_followups SET status='done', done_at=NOW() WHERE id=?")->execute([(int) $m[1]]);
            fellow_log($fid, (int) $row['org_id'], 'follow_up', (string) field($b, 'note'));
            $next = trim((string) field($b, 'next_date'));
            if ($next !== '') {
                db()->prepare('INSERT INTO fellow_followups (org_id, fellow_user_id, due_date, reason) VALUES (?,?,?,?)')
                    ->execute([(int) $row['org_id'], $fid, $next, mb_substr(trim((string) field($b, 'reason')), 0, 255) ?: null]);
            }
            json(['message' => 'Follow-up completed.']);
        }

        /* ---------- Admin: Fellow Operating Command Center ---------- */
        case $key === 'GET admin/fellow-ops/summary': {
            require_admin();
            json(['summary' => fellow_admin_summary(), 'fellows' => fellow_admin_fellows()]);
        }
        case $key === 'GET admin/fellow-ops/activity': {
            require_admin();
            fellow_ops_ensure_schema();
            $rows = db()->query(
                // Sample-data activity belongs to the Fellow learning the tool, not the team feed.
                "SELECT a.type, a.detail, a.created_at, u.full_name AS fellow_name, o.name AS org_name
                 FROM fellow_activities a JOIN users u ON u.id = a.fellow_user_id
                 LEFT JOIN fellow_orgs o ON o.id = a.org_id
                 WHERE o.id IS NULL OR o.is_demo = 0
                 ORDER BY a.created_at DESC, a.id DESC LIMIT 60"
            )->fetchAll();
            json(['activity' => $rows]);
        }
        // The same feed, paged and filterable — 60 rows was a peek, not a record.
        case $key === 'GET admin/fellow-ops/activity-page': {
            require_admin();
            fellow_ops_ensure_schema();
            $where = ['(o.id IS NULL OR o.is_demo = 0)'];
            $args = [];
            if (($fid = (int) ($_GET['fellow_user_id'] ?? 0)) > 0) { $where[] = 'a.fellow_user_id = ?'; $args[] = $fid; }
            if (in_array((string) ($_GET['type'] ?? ''), FELLOW_ACTIVITY_TYPES, true)) { $where[] = 'a.type = ?'; $args[] = (string) $_GET['type']; }
            if (($s = trim((string) ($_GET['q'] ?? ''))) !== '') {
                $where[] = '(a.detail LIKE ? OR o.name LIKE ? OR u.full_name LIKE ?)';
                $like = '%' . $s . '%'; array_push($args, $like, $like, $like);
            }
            $from = "FROM fellow_activities a JOIN users u ON u.id = a.fellow_user_id
                     LEFT JOIN fellow_orgs o ON o.id = a.org_id WHERE " . implode(' AND ', $where);
            $cnt = db()->prepare("SELECT COUNT(*) $from");
            $cnt->execute($args);
            $total = (int) $cnt->fetchColumn();
            ['per' => $per, 'page' => $page, 'offset' => $off] = page_window($_GET);
            $s2 = db()->prepare("SELECT a.id, a.type, a.detail, a.created_at, u.full_name AS fellow_name, o.name AS org_name
                $from ORDER BY a.created_at DESC, a.id DESC LIMIT $per OFFSET $off");
            $s2->execute($args);
            json(['activity' => $s2->fetchAll(), 'total' => $total, 'page' => $page, 'per' => $per, 'types' => FELLOW_ACTIVITY_TYPES]);
        }
        // The Fellows' end-of-day reports. Without this the whole daily-report
        // feature was write-only — Fellows are told their manager can read it.
        case $key === 'GET admin/fellow-ops/reports': {
            require_admin();
            fellow_ops_ensure_schema();
            $where = ['1=1'];
            $args = [];
            if (($fid = (int) ($_GET['fellow_user_id'] ?? 0)) > 0) { $where[] = 'r.fellow_user_id = ?'; $args[] = $fid; }
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($_GET['from'] ?? '')) === 1) { $where[] = 'r.report_date >= ?'; $args[] = (string) $_GET['from']; }
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($_GET['to'] ?? '')) === 1) { $where[] = 'r.report_date <= ?'; $args[] = (string) $_GET['to']; }
            if (!empty($_GET['needs_help'])) $where[] = "r.help_needed IS NOT NULL AND r.help_needed <> ''";
            $from = 'FROM fellow_reports r JOIN users u ON u.id = r.fellow_user_id WHERE ' . implode(' AND ', $where);
            $cnt = db()->prepare("SELECT COUNT(*) $from");
            $cnt->execute($args);
            $total = (int) $cnt->fetchColumn();
            ['per' => $per, 'page' => $page, 'offset' => $off] = page_window($_GET, 25);
            $s = db()->prepare("SELECT r.id, r.report_date, r.numbers_json, r.wins, r.challenges, r.help_needed, r.plan,
                        r.fellow_user_id, u.full_name AS fellow_name
                 $from ORDER BY r.report_date DESC, u.full_name ASC LIMIT $per OFFSET $off");
            $s->execute($args);
            json(['reports' => $s->fetchAll(), 'total' => $total, 'page' => $page, 'per' => $per]);
        }
        /* ---- Admin: donations + the org identity that receipts depend on ---- */
        case $key === 'GET admin/donations': {
            require_admin();
            donations_ensure_schema();
            $where = ['1=1'];
            $args = [];
            if (in_array((string) ($_GET['status'] ?? ''), DONATION_STATUSES, true)) { $where[] = 'payment_status = ?'; $args[] = (string) $_GET['status']; }
            if (in_array((string) ($_GET['provider'] ?? ''), ['stripe', 'paypal'], true)) { $where[] = 'provider = ?'; $args[] = (string) $_GET['provider']; }
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($_GET['from'] ?? '')) === 1) { $where[] = 'DATE(created_at) >= ?'; $args[] = (string) $_GET['from']; }
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($_GET['to'] ?? '')) === 1) { $where[] = 'DATE(created_at) <= ?'; $args[] = (string) $_GET['to']; }
            if (!empty($_GET['unreceipted'])) $where[] = "payment_status = 'paid' AND receipt_sent_at IS NULL";
            if (($q = trim((string) ($_GET['q'] ?? ''))) !== '') {
                $where[] = '(donor_name LIKE ? OR email LIKE ? OR organization LIKE ? OR donation_no LIKE ? OR receipt_no LIKE ?)';
                $like = '%' . $q . '%'; array_push($args, $like, $like, $like, $like, $like);
            }
            $w = implode(' AND ', $where);
            $agg = db()->prepare("SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN amount ELSE 0 END),0) AS raised FROM donations WHERE $w");
            $agg->execute($args);
            $a = $agg->fetch() ?: [];
            ['per' => $per, 'page' => $page, 'offset' => $off] = page_window($_GET);
            $rows = db()->prepare("SELECT d.*, u.full_name AS account_name FROM donations d LEFT JOIN users u ON u.id = d.user_id
                WHERE $w ORDER BY d.created_at DESC LIMIT $per OFFSET $off");
            $rows->execute($args);
            // All-time totals, independent of the filters, for the header tiles.
            $all = db()->query("SELECT COALESCE(SUM(amount),0) AS raised, COUNT(*) AS n,
                    COUNT(DISTINCT email) AS donors,
                    COALESCE(AVG(amount),0) AS average
                FROM donations WHERE payment_status = 'paid'")->fetch() ?: [];
            json(['donations' => $rows->fetchAll(), 'total' => (int) ($a['n'] ?? 0), 'filtered_raised' => (float) ($a['raised'] ?? 0),
                'page' => $page, 'per' => $per, 'statuses' => DONATION_STATUSES, 'all_time' => $all,
                'org' => org_identity()]);
        }
        case $method === 'POST' && preg_match('#^admin/donation/(\d+)/receipt$#', $route, $m) === 1: {
            require_admin();
            $ok = donation_issue_receipt((int) $m[1]);
            json($ok
                ? ['message' => 'Receipt sent to the donor, with a copy to the office.']
                : ['error' => 'Could not send the receipt. Only a paid donation can be receipted.'], $ok ? 200 : 422);
        }
        case $key === 'GET admin/org-identity': {
            require_admin();
            json(['org' => org_identity()]);
        }
        case $key === 'PUT admin/org-identity': {
            require_admin();
            org_identity_save(body());
            json(['message' => 'Saved. New receipts will use these details.', 'org' => org_identity()]);
        }
        // School verification progress across the team, by region and by Fellow.
        case $key === 'GET admin/fellow-ops/schools': {
            require_admin();
            research_ensure_schema();
            $base = "FROM research_entries WHERE category = 'school_contact'";
            $byRegion = db()->query("SELECT COALESCE(NULLIF(region,''),'(no region)') AS region, COUNT(*) AS total,
                    SUM(status = 'verified') AS verified,
                    SUM(outreach_status <> 'not_contacted') AS contacted,
                    SUM(outreach_status = 'registered') AS registered
                $base GROUP BY region ORDER BY region")->fetchAll();
            $byFellow = db()->query("SELECT u.full_name AS fellow_name, COUNT(*) AS total,
                    SUM(r.status = 'verified') AS verified,
                    SUM(r.outreach_status <> 'not_contacted') AS contacted,
                    SUM(r.verify_method = 'phone_call') AS by_phone,
                    SUM(r.verify_method IN ('online_research','official_website')) AS by_research
                FROM research_entries r JOIN users u ON u.id = r.fellow_user_id
                WHERE r.category = 'school_contact' GROUP BY r.fellow_user_id, u.full_name ORDER BY verified DESC")->fetchAll();
            $totals = db()->query("SELECT COUNT(*) AS total, SUM(status = 'verified') AS verified,
                    SUM(outreach_status <> 'not_contacted') AS contacted, SUM(outreach_status = 'registered') AS registered,
                    SUM(pushed_school_id IS NOT NULL) AS on_dropdown $base")->fetch();
            json(['by_region' => $byRegion, 'by_fellow' => $byFellow, 'totals' => $totals]);
        }
        case $key === 'GET admin/fellow-ops/pipeline': {
            require_admin();
            fellow_ops_ensure_schema();
            $where = ['o.is_demo = 0'];
            $args = [];
            if (($fid = (int) ($_GET['fellow_user_id'] ?? 0)) > 0) { $where[] = 'o.fellow_user_id = ?'; $args[] = $fid; }
            if (in_array((string) ($_GET['stage'] ?? ''), FELLOW_STAGES, true)) { $where[] = 'o.stage = ?'; $args[] = (string) $_GET['stage']; }
            if (($s = trim((string) ($_GET['q'] ?? ''))) !== '') {
                $where[] = '(o.name LIKE ? OR o.category LIKE ? OR o.location LIKE ?)';
                $like = '%' . $s . '%'; array_push($args, $like, $like, $like);
            }
            $from = 'FROM fellow_orgs o LEFT JOIN users u ON u.id = o.fellow_user_id WHERE ' . implode(' AND ', $where);
            $cnt = db()->prepare("SELECT COUNT(*) AS n, COALESCE(SUM(o.est_value),0) AS value $from");
            $cnt->execute($args);
            $agg = $cnt->fetch() ?: [];
            ['per' => $per, 'page' => $page, 'offset' => $off] = page_window($_GET);
            $rows = db()->prepare("SELECT o.id, o.name, o.category, o.location, o.stage, o.est_value, o.fellow_user_id,
                        u.full_name AS fellow_name
                 $from ORDER BY o.est_value DESC, o.updated_at DESC LIMIT $per OFFSET $off");
            $rows->execute($args);
            json(['orgs' => $rows->fetchAll(), 'total' => (int) ($agg['n'] ?? 0), 'value' => (int) ($agg['value'] ?? 0),
                'page' => $page, 'per' => $per, 'stages' => FELLOW_STAGES]);
        }
        case $key === 'POST admin/fellow-ops/task': {
            $admin = require_admin();
            fellow_ops_ensure_schema();
            $b = body();
            $fid = (int) ($b['fellow_user_id'] ?? 0);
            $title = mb_substr(trim((string) field($b, 'title')), 0, 200);
            if ($fid <= 0 || $title === '') json(['error' => 'Pick a Fellow and enter a task title.'], 422);
            // Optionally tie the task to a work screen so it counts itself.
            $target = (string) field($b, 'work_target') === 'schools' ? 'schools' : null;
            $wf = is_array($b['work_filter'] ?? null) ? array_filter(array_map('strval', $b['work_filter'])) : [];
            db()->prepare('INSERT INTO fellow_tasks (fellow_user_id, assigned_by_user_id, title, instructions, due_date, priority, work_target, work_filter, target_count) VALUES (?,?,?,?,?,?,?,?,?)')
                ->execute([$fid, (int) $admin['id'], $title, mb_substr(trim((string) field($b, 'instructions')), 0, 2000) ?: null,
                    trim((string) field($b, 'due_date')) ?: null,
                    in_array((string) field($b, 'priority'), ['low', 'medium', 'high'], true) ? (string) field($b, 'priority') : 'medium',
                    $target, $target && $wf ? json_encode($wf) : null,
                    ($tc = (int) ($b['target_count'] ?? 0)) > 0 ? $tc : null]);
            $taskId = (int) db()->lastInsertId();
            // The brief starts the conversation, so the Fellow can reply to it.
            $kick = trim((string) field($b, 'instructions'));
            if ($kick !== '') { try { fellow_task_post($taskId, (int) $admin['id'], 'admin', $kick); } catch (Throwable $e) { /* best effort */ } }
            try { new_school_add_notification(null, 'fellow', 'fellow_task', 'New task assigned', $title, ['task_id' => $taskId], $fid); } catch (Throwable $e) { /* best effort */ }
            json(['message' => 'Task assigned.', 'id' => $taskId], 201);
        }
        /* ---- Shared task workspace: the admin's side ---- */
        case $key === 'GET admin/fellow-ops/tasks': {
            require_admin();
            fellow_ops_ensure_schema();
            $where = '1=1';
            $args = [];
            $fid = (int) ($_GET['fellow_user_id'] ?? 0);
            if ($fid > 0) { $where .= ' AND t.fellow_user_id = ?'; $args[] = $fid; }
            $filter = (string) ($_GET['filter'] ?? 'open');
            if ($filter === 'open') $where .= " AND t.status NOT IN ('completed','declined')";
            elseif ($filter === 'done') $where .= " AND t.status IN ('completed','declined')";
            elseif ($filter === 'needs_me') $where .= " AND t.status IN ('submitted','waiting','declined')";
            $s = db()->prepare("SELECT t.*, u.full_name AS fellow_name, a.full_name AS assigned_by_name,
                    (SELECT COUNT(*) FROM fellow_task_messages m WHERE m.task_id = t.id) AS msgs,
                    (SELECT COUNT(*) FROM fellow_task_messages m WHERE m.task_id = t.id AND m.read_by_admin = 0) AS unread
                FROM fellow_tasks t LEFT JOIN users u ON u.id = t.fellow_user_id
                LEFT JOIN users a ON a.id = t.assigned_by_user_id
                WHERE $where
                ORDER BY FIELD(t.status,'submitted','declined','waiting','not_started','accepted','in_progress','needs_review','completed'),
                    (t.due_date IS NULL), t.due_date ASC, t.id DESC LIMIT 300");
            $s->execute($args);
            $counts = db()->query("SELECT status, COUNT(*) AS n FROM fellow_tasks GROUP BY status")->fetchAll();
            json(['tasks' => $s->fetchAll(), 'counts' => array_column($counts, 'n', 'status'), 'statuses' => FELLOW_TASK_STATUSES]);
        }
        case $method === 'GET' && preg_match('#^admin/fellow-ops/task/(\d+)$#', $route, $m) === 1: {
            require_admin();
            $t = fellow_task_thread((int) $m[1], 'admin');
            if (!$t) json(['error' => 'Not found.'], 404);
            json($t + ['statuses' => FELLOW_TASK_STATUSES]);
        }
        case $method === 'POST' && preg_match('#^admin/fellow-ops/task/(\d+)/message$#', $route, $m) === 1: {
            $admin = require_admin();
            fellow_ops_ensure_schema();
            $chk = db()->prepare('SELECT id FROM fellow_tasks WHERE id = ?');
            $chk->execute([(int) $m[1]]);
            if (!$chk->fetch()) json(['error' => 'Not found.'], 404);
            fellow_task_post((int) $m[1], (int) $admin['id'], 'admin', (string) field(body(), 'body'), (string) field(body(), 'attachment_url'));
            json(['message' => 'Sent.'], 201);
        }
        case $method === 'POST' && preg_match('#^admin/fellow-ops/task/(\d+)/upload$#', $route, $m) === 1: {
            require_admin();
            fellow_ops_ensure_schema();
            $chk = db()->prepare('SELECT id FROM fellow_tasks WHERE id = ?');
            $chk->execute([(int) $m[1]]);
            if (!$chk->fetch()) json(['error' => 'Not found.'], 404);
            $f = fellow_task_store_upload();
            json(['message' => 'Uploaded.', 'url' => $f['url'], 'name' => $f['name']], 201);
        }
        // A task assigned by mistake has to be removable, or it clutters the
        // Fellow's list forever and skews the board counts.
        case $method === 'DELETE' && preg_match('#^admin/fellow-ops/task/(\d+)$#', $route, $m) === 1: {
            require_admin();
            fellow_ops_ensure_schema();
            $id = (int) $m[1];
            $chk = db()->prepare('SELECT id FROM fellow_tasks WHERE id = ?');
            $chk->execute([$id]);
            if (!$chk->fetch()) json(['error' => 'Not found.'], 404);
            db()->prepare('DELETE FROM fellow_task_messages WHERE task_id = ?')->execute([$id]);
            db()->prepare('DELETE FROM fellow_tasks WHERE id = ?')->execute([$id]);
            json(['message' => 'Task deleted.']);
        }
        /* Assign one brief to several Fellows at once, optionally splitting a
           work target between them (e.g. a borough each). */
        case $key === 'POST admin/fellow-ops/tasks/bulk': {
            $admin = require_admin();
            fellow_ops_ensure_schema();
            $b = body();
            $ids = array_values(array_unique(array_filter(array_map('intval', is_array($b['fellow_user_ids'] ?? null) ? $b['fellow_user_ids'] : []))));
            $title = mb_substr(trim((string) field($b, 'title')), 0, 200);
            if (!$ids || $title === '') json(['error' => 'Pick at least one Fellow and enter a title.'], 422);
            if (count($ids) > 50) json(['error' => 'At most 50 Fellows at a time.'], 422);
            $instructions = mb_substr(trim((string) field($b, 'instructions')), 0, 2000);
            $due = trim((string) field($b, 'due_date'));
            $prio = in_array((string) field($b, 'priority'), ['low', 'medium', 'high'], true) ? (string) field($b, 'priority') : 'medium';
            $target = (string) field($b, 'work_target');
            $target = $target === 'schools' ? 'schools' : null;
            // One region per Fellow when splitting; otherwise everyone gets the same filter.
            $regions = is_array($b['split_regions'] ?? null) ? array_values(array_filter(array_map('strval', $b['split_regions']))) : [];
            $count = max(0, (int) ($b['target_count'] ?? 0));
            $ins = db()->prepare('INSERT INTO fellow_tasks (fellow_user_id, assigned_by_user_id, title, instructions, due_date, priority, work_target, work_filter, target_count) VALUES (?,?,?,?,?,?,?,?,?)');
            $made = 0;
            foreach ($ids as $i => $fid) {
                $region = $regions === [] ? '' : (string) ($regions[$i % count($regions)] ?? '');
                $filter = $target === 'schools' && $region !== '' ? json_encode(['region' => $region]) : null;
                $ttl = $region !== '' ? mb_substr($title . ' - ' . $region, 0, 200) : $title;
                $ins->execute([$fid, (int) $admin['id'], $ttl, $instructions ?: null, $due ?: null, $prio, $target, $filter, $count ?: null]);
                $tid = (int) db()->lastInsertId();
                if ($instructions !== '') { try { fellow_task_post($tid, (int) $admin['id'], 'admin', $instructions); } catch (Throwable $e) { /* best effort */ } }
                try { new_school_add_notification(null, 'fellow', 'fellow_task', 'New task assigned', $ttl, ['task_id' => $tid], $fid); } catch (Throwable $e) { /* best effort */ }
                $made++;
            }
            json(['message' => "Assigned to $made Fellow" . ($made === 1 ? '' : 's') . '.', 'created' => $made], 201);
        }
        /* Reusable briefs. */
        case $key === 'GET admin/fellow-ops/task-templates': {
            require_admin();
            fellow_ops_ensure_schema();
            json(['templates' => db()->query('SELECT * FROM fellow_task_templates ORDER BY name')->fetchAll()]);
        }
        case $key === 'POST admin/fellow-ops/task-template': {
            require_admin();
            fellow_ops_ensure_schema();
            $b = body();
            $name = mb_substr(trim((string) field($b, 'name')), 0, 160);
            $title = mb_substr(trim((string) field($b, 'title')), 0, 200);
            if ($name === '' || $title === '') json(['error' => 'A template needs a name and a task title.'], 422);
            $target = (string) field($b, 'work_target') === 'schools' ? 'schools' : null;
            db()->prepare('INSERT INTO fellow_task_templates (name, title, instructions, priority, due_in_days, work_target, target_count) VALUES (?,?,?,?,?,?,?)')
                ->execute([$name, $title, mb_substr(trim((string) field($b, 'instructions')), 0, 2000) ?: null,
                    in_array((string) field($b, 'priority'), ['low', 'medium', 'high'], true) ? (string) field($b, 'priority') : 'medium',
                    ($d = (int) ($b['due_in_days'] ?? 0)) > 0 ? $d : null, $target,
                    ($c = (int) ($b['target_count'] ?? 0)) > 0 ? $c : null]);
            json(['message' => 'Template saved.'], 201);
        }
        case $method === 'DELETE' && preg_match('#^admin/fellow-ops/task-template/(\d+)$#', $route, $m) === 1: {
            require_admin();
            fellow_ops_ensure_schema();
            db()->prepare('DELETE FROM fellow_task_templates WHERE id = ?')->execute([(int) $m[1]]);
            json(['message' => 'Template deleted.']);
        }
        // Admin can retitle, re-brief, re-date, reassign, and set the verdict.
        case $method === 'PUT' && preg_match('#^admin/fellow-ops/task/(\d+)$#', $route, $m) === 1: {
            require_admin();
            fellow_ops_ensure_schema();
            $id = (int) $m[1]; $b = body();
            $chk = db()->prepare('SELECT fellow_user_id, title, status FROM fellow_tasks WHERE id = ?');
            $chk->execute([$id]);
            $cur = $chk->fetch();
            if (!$cur) json(['error' => 'Not found.'], 404);
            $status = (string) field($b, 'status');
            if ($status !== '' && !in_array($status, FELLOW_TASK_STATUSES, true)) json(['error' => 'Invalid status.'], 422);
            $newFid = (int) ($b['fellow_user_id'] ?? 0);
            db()->prepare('UPDATE fellow_tasks SET
                    title = COALESCE(NULLIF(?, \'\'), title),
                    instructions = COALESCE(NULLIF(?, \'\'), instructions),
                    due_date = COALESCE(NULLIF(?, \'\'), due_date),
                    priority = COALESCE(NULLIF(?, \'\'), priority),
                    status = COALESCE(NULLIF(?, \'\'), status),
                    fellow_user_id = IF(? > 0, ?, fellow_user_id),
                    completed_at = CASE WHEN ? = \'completed\' THEN NOW() WHEN ? <> \'\' THEN NULL ELSE completed_at END
                WHERE id = ?')
                ->execute([mb_substr(trim((string) field($b, 'title')), 0, 200),
                    mb_substr(trim((string) field($b, 'instructions')), 0, 2000),
                    trim((string) field($b, 'due_date')),
                    in_array((string) field($b, 'priority'), ['low', 'medium', 'high'], true) ? (string) field($b, 'priority') : '',
                    $status, $newFid, $newFid, $status, $status, $id]);
            // Reassignment and a verdict both matter to the Fellow.
            $target = $newFid > 0 ? $newFid : (int) $cur['fellow_user_id'];
            if ($status !== '' && $status !== (string) $cur['status']) {
                try {
                    new_school_add_notification(null, 'fellow', 'fellow_task',
                        'Task ' . str_replace('_', ' ', $status) . ': ' . (string) $cur['title'],
                        mb_substr(trim((string) field($b, 'admin_note')), 0, 200) ?: 'Your manager updated this task.',
                        ['task_id' => $id], $target);
                } catch (Throwable $e) { /* best effort */ }
            }
            json(['message' => 'Task updated.']);
        }
        case $key === 'GET admin/fellow-ops/analytics': {
            require_admin(); fellow_ops_ensure_schema();
            // Every aggregate here excludes sample data — see FELLOW_REAL_ORG.
            $byStage = db()->query("SELECT stage, COUNT(*) AS n, COALESCE(SUM(est_value),0) AS value FROM fellow_orgs WHERE is_demo = 0 GROUP BY stage")->fetchAll();
            $stageMap = [];
            foreach ($byStage as $r) $stageMap[(string) $r['stage']] = ['n' => (int) $r['n'], 'value' => (int) $r['value']];
            $ordered = [];
            foreach (FELLOW_STAGES as $s) if (isset($stageMap[$s])) $ordered[] = ['stage' => $s] + $stageMap[$s];
            $totalFellows = (int) db()->query("SELECT COUNT(*) FROM users WHERE role = 'fellow'")->fetchColumn();
            $activeToday = (int) db()->query("SELECT COUNT(DISTINCT a.fellow_user_id) FROM fellow_activities a " . FELLOW_REAL_ACT . " AND DATE(a.created_at) = CURDATE()")->fetchColumn();
            $alerts = [
                'overdue_followups' => (int) db()->query("SELECT COUNT(*) FROM fellow_followups f JOIN fellow_orgs o ON o.id = f.org_id WHERE o.is_demo = 0 AND f.status = 'pending' AND f.due_date < CURDATE()")->fetchColumn(),
                'proposals_pending' => (int) db()->query("SELECT COUNT(*) FROM fellow_proposals WHERE status = 'submitted'")->fetchColumn(),
                'inactive_fellows' => max(0, $totalFellows - $activeToday),
                'verbal_commitments' => (int) db()->query("SELECT COUNT(*) FROM fellow_orgs WHERE is_demo = 0 AND stage = 'verbal_commitment'")->fetchColumn(),
                'confirmed' => (int) db()->query("SELECT COUNT(*) FROM fellow_orgs WHERE is_demo = 0 AND stage IN ('confirmed','paid')")->fetchColumn(),
            ];
            $week = (int) db()->query("SELECT COUNT(*) FROM fellow_activities a " . FELLOW_REAL_ACT . " AND a.created_at >= CURDATE() - INTERVAL 6 DAY")->fetchColumn();
            $month = (int) db()->query("SELECT COUNT(*) FROM fellow_activities a " . FELLOW_REAL_ACT . " AND a.created_at >= CURDATE() - INTERVAL 29 DAY")->fetchColumn();
            json(['funnel' => $ordered, 'alerts' => $alerts, 'activity_week' => $week, 'activity_month' => $month]);
        }
        case $key === 'GET admin/fellow-ops/proposals': {
            require_admin(); fellow_ops_ensure_schema();
            $rows = db()->query("SELECT p.*, o.name AS org_name, u.full_name AS fellow_name FROM fellow_proposals p JOIN fellow_orgs o ON o.id = p.org_id LEFT JOIN users u ON u.id = p.fellow_user_id ORDER BY (p.status='submitted') DESC, p.updated_at DESC LIMIT 300")->fetchAll();
            json(['proposals' => $rows, 'statuses' => FELLOW_PROPOSAL_STATUSES]);
        }
        case $method === 'PUT' && preg_match('#^admin/fellow-ops/proposal/(\d+)$#', $route, $m) === 1: {
            require_admin(); fellow_ops_ensure_schema();
            $b = body();
            $status = (string) field($b, 'status');
            if (!in_array($status, FELLOW_PROPOSAL_STATUSES, true)) json(['error' => 'Invalid status.'], 422);
            db()->prepare('UPDATE fellow_proposals SET status = ?, admin_note = ? WHERE id = ?')
                ->execute([$status, mb_substr(trim((string) field($b, 'admin_note')), 0, 500) ?: null, (int) $m[1]]);
            // Notify the owning fellow.
            $own = db()->prepare('SELECT fellow_user_id, org_id FROM fellow_proposals WHERE id = ?'); $own->execute([(int) $m[1]]); $row = $own->fetch();
            if ($row) { try { new_school_add_notification(null, 'fellow', 'fellow_proposal', 'Proposal ' . $status, 'Your proposal was ' . $status . '.', [], (int) $row['fellow_user_id']); } catch (Throwable $e) {} }
            json(['message' => 'Proposal ' . $status . '.']);
        }
        case $key === 'GET admin/fellow-ops/templates': {
            require_admin(); fellow_ops_ensure_schema();
            json(['templates' => db()->query('SELECT * FROM fellow_templates ORDER BY kind, sort_order, id')->fetchAll(), 'kinds' => FELLOW_TEMPLATE_KINDS]);
        }
        case $key === 'POST admin/fellow-ops/template': {
            require_admin(); fellow_ops_ensure_schema();
            $b = body();
            $name = mb_substr(trim((string) field($b, 'name')), 0, 160);
            if ($name === '') json(['error' => 'Name required.'], 422);
            db()->prepare('INSERT INTO fellow_templates (kind, category, name, subject, body, sort_order, is_active) VALUES (?,?,?,?,?,?,?)')
                ->execute([in_array((string) field($b, 'kind'), FELLOW_TEMPLATE_KINDS, true) ? (string) field($b, 'kind') : 'email',
                    mb_substr(trim((string) field($b, 'category')), 0, 80) ?: null, $name,
                    mb_substr(trim((string) field($b, 'subject')), 0, 240) ?: null,
                    mb_substr(trim((string) field($b, 'body')), 0, 6000) ?: null, (int) ($b['sort_order'] ?? 0), empty($b['is_active']) ? 0 : 1]);
            json(['id' => (int) db()->lastInsertId(), 'message' => 'Template added.'], 201);
        }
        case $method === 'PUT' && preg_match('#^admin/fellow-ops/template/(\d+)$#', $route, $m) === 1: {
            require_admin(); fellow_ops_ensure_schema();
            $b = body();
            $name = mb_substr(trim((string) field($b, 'name')), 0, 160);
            if ($name === '') json(['error' => 'Name required.'], 422);
            db()->prepare('UPDATE fellow_templates SET kind=?, category=?, name=?, subject=?, body=?, sort_order=?, is_active=? WHERE id=?')
                ->execute([in_array((string) field($b, 'kind'), FELLOW_TEMPLATE_KINDS, true) ? (string) field($b, 'kind') : 'email',
                    mb_substr(trim((string) field($b, 'category')), 0, 80) ?: null, $name,
                    mb_substr(trim((string) field($b, 'subject')), 0, 240) ?: null,
                    mb_substr(trim((string) field($b, 'body')), 0, 6000) ?: null, (int) ($b['sort_order'] ?? 0), empty($b['is_active']) ? 0 : 1, (int) $m[1]]);
            json(['message' => 'Template updated.']);
        }
        case $method === 'DELETE' && preg_match('#^admin/fellow-ops/template/(\d+)$#', $route, $m) === 1: {
            require_admin(); fellow_ops_ensure_schema();
            db()->prepare('DELETE FROM fellow_templates WHERE id = ?')->execute([(int) $m[1]]);
            json(['message' => 'Template deleted.']);
        }
        case $key === 'GET admin/fellow-ops/materials': {
            require_admin(); fellow_ops_ensure_schema();
            json(['materials' => db()->query('SELECT * FROM fellow_materials ORDER BY category, sort_order, id')->fetchAll()]);
        }
        case $key === 'POST admin/fellow-ops/material': {
            require_admin(); fellow_ops_ensure_schema();
            $b = body();
            $title = mb_substr(trim((string) field($b, 'title')), 0, 200);
            if ($title === '') json(['error' => 'Title required.'], 422);
            db()->prepare('INSERT INTO fellow_materials (category, title, description, url, sort_order, is_active) VALUES (?,?,?,?,?,?)')
                ->execute([mb_substr(trim((string) field($b, 'category')) ?: 'Sponsor Materials', 0, 80), $title,
                    mb_substr(trim((string) field($b, 'description')), 0, 400) ?: null,
                    mb_substr(trim((string) field($b, 'url')), 0, 500) ?: null,
                    (int) ($b['sort_order'] ?? 0), empty($b['is_active']) ? 0 : 1]);
            json(['id' => (int) db()->lastInsertId(), 'message' => 'Material added.'], 201);
        }
        case $method === 'PUT' && preg_match('#^admin/fellow-ops/material/(\d+)$#', $route, $m) === 1: {
            require_admin(); fellow_ops_ensure_schema();
            $b = body();
            $title = mb_substr(trim((string) field($b, 'title')), 0, 200);
            if ($title === '') json(['error' => 'Title required.'], 422);
            db()->prepare('UPDATE fellow_materials SET category=?, title=?, description=?, url=?, sort_order=?, is_active=? WHERE id=?')
                ->execute([mb_substr(trim((string) field($b, 'category')) ?: 'Sponsor Materials', 0, 80), $title,
                    mb_substr(trim((string) field($b, 'description')), 0, 400) ?: null,
                    mb_substr(trim((string) field($b, 'url')), 0, 500) ?: null,
                    (int) ($b['sort_order'] ?? 0), empty($b['is_active']) ? 0 : 1, (int) $m[1]]);
            json(['message' => 'Material updated.']);
        }
        case $method === 'DELETE' && preg_match('#^admin/fellow-ops/material/(\d+)$#', $route, $m) === 1: {
            require_admin(); fellow_ops_ensure_schema();
            db()->prepare('DELETE FROM fellow_materials WHERE id = ?')->execute([(int) $m[1]]);
            json(['message' => 'Material deleted.']);
        }
        case $key === 'GET admin/fellow-ops/targets': {
            require_admin(); fellow_ops_ensure_schema();
            $fid = (int) ($_GET['fellow_user_id'] ?? 0);
            $q = db()->prepare('SELECT orgs, emails, calls, linkedin, follow_ups FROM fellow_targets WHERE fellow_user_id = ? LIMIT 1');
            $q->execute([$fid]);
            $row = $q->fetch();
            if (!$row && $fid !== 0) { $g = db()->query('SELECT orgs, emails, calls, linkedin, follow_ups FROM fellow_targets WHERE fellow_user_id = 0'); $row = $g->fetch(); }
            json(['targets' => $row ?: ['orgs' => 10, 'emails' => 10, 'calls' => 5, 'linkedin' => 5, 'follow_ups' => 10], 'custom' => (bool) ($q->rowCount() && $fid !== 0)]);
        }
        case $key === 'PUT admin/fellow-ops/targets': {
            require_admin();
            fellow_ops_ensure_schema();
            $b = body();
            $fid = max(0, (int) ($b['fellow_user_id'] ?? 0));
            db()->prepare('INSERT INTO fellow_targets (fellow_user_id, orgs, emails, calls, linkedin, follow_ups) VALUES (?,?,?,?,?,?)
                ON DUPLICATE KEY UPDATE orgs=VALUES(orgs), emails=VALUES(emails), calls=VALUES(calls), linkedin=VALUES(linkedin), follow_ups=VALUES(follow_ups)')
                ->execute([$fid, max(0, (int) ($b['orgs'] ?? 10)), max(0, (int) ($b['emails'] ?? 10)), max(0, (int) ($b['calls'] ?? 5)), max(0, (int) ($b['linkedin'] ?? 5)), max(0, (int) ($b['follow_ups'] ?? 10))]);
            json(['message' => 'Targets saved.']);
        }

        // Admin side of the Research Workspace.
        case $key === 'POST admin/research/import': {
            require_admin();
            $b = body();
            $rows = is_array($b['rows'] ?? null) ? $b['rows'] : [];
            if (!$rows) json(['error' => 'No rows to import.'], 422);
            $fid = (int) (field($b, 'fellow_user_id') ?: 0);
            if ($fid <= 0) json(['error' => 'Choose a Fellow to attribute the import to.'], 422);
            $n = research_bulk_import($fid, (string) field($b, 'category'), $rows);
            json(['message' => "Imported $n rows.", 'imported' => $n], 201);
        }
        case $key === 'POST admin/fellow/create': {
            require_admin();
            $b = body();
            $name = require_name_field(field($b, 'full_name'), 'Full name', 3);
            $email = require_email(field($b, 'email'));
            $pass = (string) field($b, 'password');
            $user = new_school_upsert_user_account($name, $email, $pass, 'fellow');
            db()->prepare("UPDATE users SET role = 'fellow', approval_status = 'approved', email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = ?")
                ->execute([(int) $user['id']]);
            json(['message' => 'Fellow account created.', 'fellows' => research_fellows()], 201);
        }
        case $key === 'GET admin/research': {
            require_admin();
            json([
                'entries' => research_all_for_admin([
                    'category' => $_GET['category'] ?? '',
                    'status' => $_GET['status'] ?? '',
                    'fellow_user_id' => $_GET['fellow_user_id'] ?? '',
                ]),
                'fellows' => research_fellows(),
            ]);
        }
        case $method === 'PUT' && preg_match('#^admin/research/entry/(\d+)$#', $route, $m) === 1: {
            require_admin();
            $b = body();
            research_entry_set_status((int) $m[1], (string) field($b, 'status'), (string) field($b, 'admin_note'));
            json(['message' => 'Updated.']);
        }
        case $method === 'POST' && preg_match('#^admin/research/entry/(\d+)/push-school$#', $route, $m) === 1: {
            require_admin();
            $res = research_push_school((int) $m[1]);
            json(['message' => 'Pushed to Schools as an unclaimed TrendCatch EDU school.', 'result' => $res]);
        }
        case $key === 'GET admin/research/export': {
            require_admin();
            $cat = isset($_GET['category']) ? (string) $_GET['category'] : '';
            $rows = array_map(static function (array $e): array {
                return [
                    'id' => $e['id'], 'category' => $e['category'], 'title' => $e['title'],
                    'organization' => $e['organization'], 'contact_name' => $e['contact_name'],
                    'email' => $e['email'], 'phone' => $e['phone'], 'website' => $e['website'],
                    'location' => $e['location'], 'source_url' => $e['source_url'], 'notes' => $e['notes'],
                    'status' => $e['status'], 'fellow' => $e['fellow_name'],
                ];
            }, research_all_for_admin(['category' => $cat]));
            $suffix = $cat !== '' ? $cat : 'all';
            json(['filename' => 'research-' . $suffix . '.csv', 'rows' => $rows, 'csv' => new_school_rows_to_csv($rows)]);
        }
        case $key === 'POST admin/research/assignment': {
            require_admin();
            $b = body();
            $uid = (int) (field($b, 'user_id') ?: 0);
            if ($uid <= 0) json(['error' => 'Choose a Fellow.'], 422);
            if (trim((string) field($b, 'title')) === '') json(['error' => 'Title is required.'], 422);
            ecosystem_assignment_add($uid, 'fellow', (string) field($b, 'title'), (string) field($b, 'detail'), (string) field($b, 'assign_date'));
            try { new_school_add_notification(null, 'fellow', 'assignment', 'New research assignment', 'You have a new research assignment: ' . trim((string) field($b, 'title')) . '.', [], $uid); } catch (Throwable $e) { /* non-fatal */ }
            json(['message' => 'Assignment created.', 'assignments' => ecosystem_assignments_for_user($uid)], 201);
        }
        case $method === 'PUT' && preg_match('#^admin/research/assignment/(\d+)$#', $route, $m) === 1: {
            require_admin();
            ecosystem_assignment_set_status((int) $m[1], (string) field(body(), 'status'));
            json(['message' => 'Assignment updated.']);
        }
        case $method === 'DELETE' && preg_match('#^admin/research/assignment/(\d+)$#', $route, $m) === 1: {
            require_admin();
            ecosystem_assignment_delete((int) $m[1]);
            json(['message' => 'Assignment removed.']);
        }
        // Direct messaging: admin side of the thread with an ecosystem account.
        case $method === 'GET' && preg_match('#^admin/ecosystem/messages/(\d+)$#', $route, $m) === 1: {
            require_admin();
            ecosystem_messages_mark_read((int) $m[1], 'admin');
            json(['messages' => ecosystem_messages_for_user((int) $m[1])]);
        }
        case $key === 'POST admin/ecosystem/message': {
            require_admin();
            $b = body();
            $uid = (int) (field($b, 'user_id') ?: 0);
            if ($uid <= 0) json(['error' => 'A recipient is required.'], 422);
            json(['messages' => ecosystem_send_message($uid, 'admin', (string) field($b, 'body'))], 201);
        }

        // Unified admin Team Inbox: every user with a team-message thread + read/reply.
        case $key === 'GET admin/team/threads': {
            require_admin();
            json(['threads' => team_message_threads()]);
        }
        case $method === 'GET' && preg_match('#^admin/team/messages/(\d+)$#', $route, $m) === 1: {
            require_admin();
            ecosystem_messages_mark_read((int) $m[1], 'admin');
            json(['messages' => ecosystem_messages_for_user((int) $m[1])]);
        }
        case $key === 'POST admin/team/message': {
            require_admin();
            $b = body();
            $uid = (int) (field($b, 'user_id') ?: 0);
            if ($uid <= 0) json(['error' => 'A recipient is required.'], 422);
            json(['messages' => ecosystem_send_message($uid, 'admin', (string) field($b, 'body'))]);
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
        // Ecosystem account removes its logo/branding image.
        case $method === 'DELETE' && preg_match('#^ecosystem/(sponsor|partner|media|volunteer)/logo$#', $route, $m) === 1: {
            $u = require_ecosystem($m[1]);
            json(ecosystem_set_logo($u, ''));
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
        // Two-way assignments: the account responds to an assignment handed to them
        // (accept / decline / complete). Owner-scoped; the admin is notified.
        case $method === 'PUT' && preg_match('#^ecosystem/(sponsor|partner|media|volunteer)/assignment/(\d+)/respond$#', $route, $m) === 1: {
            $u = require_ecosystem($m[1]);
            $b = body();
            $assignments = ecosystem_assignment_respond((int) $u['id'], (int) $m[2], (string) field($b, 'action'), trim((string) field($b, 'note')));
            json(['message' => 'Assignment updated.', 'assignments' => $assignments]);
        }
        // Direct messaging: the account's own thread with the program team.
        case $method === 'GET' && preg_match('#^ecosystem/(sponsor|partner|media|volunteer)/messages$#', $route, $m) === 1: {
            $u = require_ecosystem($m[1]);
            ecosystem_messages_mark_read((int) $u['id'], 'user');
            json(['messages' => ecosystem_messages_for_user((int) $u['id'])]);
        }
        case $method === 'POST' && preg_match('#^ecosystem/(sponsor|partner|media|volunteer)/message$#', $route, $m) === 1: {
            $u = require_ecosystem($m[1]);
            json(['messages' => ecosystem_send_message((int) $u['id'], 'user', (string) field(body(), 'body'))], 201);
        }

        /* ---------------- SPONSOR JOB POSTS (global, age-filtered) ---------------- */
        // Sponsor: list own jobs / post a new job (goes to admin for approval).
        case $key === 'GET ecosystem/sponsor/jobs': {
            $u = require_ecosystem('sponsor');
            json(['jobs' => sponsor_jobs_for_sponsor((int) $u['id'])]);
        }
        case $key === 'POST ecosystem/sponsor/jobs': {
            $u = require_ecosystem('sponsor');
            rate_limit('sponsor_job_post', 20, 3600, (string) $u['id']);
            json(['message' => 'Job submitted for approval.', 'jobs' => sponsor_job_create((int) $u['id'], body())], 201);
        }
        // Sponsor closes / reopens one of their jobs.
        case $method === 'POST' && preg_match('#^ecosystem/sponsor/job/(\d+)/status$#', $route, $m) === 1: {
            $u = require_ecosystem('sponsor');
            json(['jobs' => sponsor_job_set_status((int) $m[1], (string) field(body(), 'status'), (int) $u['id'])]);
        }
        // Sponsor: applications for one of their jobs.
        case $method === 'GET' && preg_match('#^ecosystem/sponsor/job/(\d+)/applications$#', $route, $m) === 1: {
            $u = require_ecosystem('sponsor');
            $job = sponsor_job_row((int) $m[1]);
            if (!$job || (int) $job['sponsor_user_id'] !== (int) $u['id']) json(['error' => 'Job not found.'], 404);
            json(['applications' => sponsor_job_applications_for_job((int) $m[1])]);
        }
        // Sponsor accepts / declines an application on their job.
        case $method === 'POST' && preg_match('#^ecosystem/sponsor/application/(\d+)/respond$#', $route, $m) === 1: {
            $u = require_ecosystem('sponsor');
            $b = body();
            json(['applications' => sponsor_application_respond((int) $m[1], (string) field($b, 'decision'), (string) field($b, 'reason'), (int) $u['id'])]);
        }
        // Sponsor ⇄ student chat on an accepted application.
        case $method === 'GET' && preg_match('#^ecosystem/sponsor/application/(\d+)/messages$#', $route, $m) === 1: {
            $u = require_ecosystem('sponsor');
            $r = sponsor_application_row((int) $m[1]);
            if (!$r || (int) $r['sponsor_user_id'] !== (int) $u['id']) json(['error' => 'Application not found.'], 404);
            $can = sponsor_application_is_accepted($r);
            if ($can) sponsor_application_messages_mark_read((int) $m[1], 'sponsor');
            json(['can_chat' => $can, 'messages' => $can ? sponsor_application_messages_list((int) $m[1]) : []]);
        }
        case $method === 'POST' && preg_match('#^ecosystem/sponsor/application/(\d+)/messages$#', $route, $m) === 1: {
            $u = require_ecosystem('sponsor');
            rate_limit('sponsor_chat', 30, 300, (string) $u['id']);
            $r = sponsor_application_row((int) $m[1]);
            if (!$r || (int) $r['sponsor_user_id'] !== (int) $u['id']) json(['error' => 'Application not found.'], 404);
            if (!sponsor_application_is_accepted($r)) json(['error' => 'Chat opens once you accept the application.'], 422);
            sponsor_application_message_add((int) $m[1], 'sponsor', (int) $u['id'], (string) field(body(), 'body'), (string) field(body(), 'attachment_url'));
            json(['messages' => sponsor_application_messages_list((int) $m[1])]);
        }

        // Admin: sponsor job approvals + oversight of an accepted application's chat.
        case $key === 'GET admin/sponsor-jobs': {
            require_admin();
            json(['jobs' => sponsor_jobs_all()]);
        }
        case $method === 'PUT' && preg_match('#^admin/sponsor-job/(\d+)$#', $route, $m) === 1: {
            $admin = require_admin();
            $b = body();
            json(['message' => 'Job updated.', 'jobs' => sponsor_job_review((int) $m[1], (string) field($b, 'status'), (string) field($b, 'admin_note'), (int) $admin['id'])]);
        }
        case $method === 'GET' && preg_match('#^admin/sponsor-job/(\d+)/applications$#', $route, $m) === 1: {
            require_admin();
            json(['applications' => sponsor_job_applications_for_job((int) $m[1])]);
        }
        case $method === 'GET' && preg_match('#^admin/sponsor-application/(\d+)/messages$#', $route, $m) === 1: {
            require_admin();
            $r = sponsor_application_row((int) $m[1]);
            if (!$r) json(['error' => 'Application not found.'], 404);
            json(['can_chat' => sponsor_application_is_accepted($r), 'messages' => sponsor_application_messages_list((int) $m[1])]);
        }
        case $method === 'POST' && preg_match('#^admin/sponsor-application/(\d+)/messages$#', $route, $m) === 1: {
            $admin = require_admin();
            $r = sponsor_application_row((int) $m[1]);
            if (!$r) json(['error' => 'Application not found.'], 404);
            sponsor_application_message_add((int) $m[1], 'admin', (int) $admin['id'], (string) field(body(), 'body'), (string) field(body(), 'attachment_url'));
            json(['messages' => sponsor_application_messages_list((int) $m[1])]);
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
            // Same, for a custom COUNT query (e.g. WHERE status = 'pending'). Trusted SQL only.
            $countWhere = static function (string $sql): int {
                try { return (int) db()->query($sql)->fetchColumn(); }
                catch (Throwable $e) { return 0; }
            };
            json([
                'requests'    => db()->query('SELECT * FROM requests ORDER BY created_at DESC LIMIT 2000')->fetchAll(),
                'subscribers' => db()->query('SELECT * FROM subscribers ORDER BY created_at DESC LIMIT 2000')->fetchAll(),
                'contacts'    => db()->query('SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 2000')->fetchAll(),
                'members'     => db()->query('SELECT id, full_name, email, role, approval_status, approval_note, approval_reviewed_at, created_at, updated_at FROM users ORDER BY CASE approval_status WHEN "pending" THEN 0 WHEN "rejected" THEN 1 ELSE 2 END, created_at DESC LIMIT 2000')->fetchAll(),
                'orders'      => db()->query('SELECT * FROM orders ORDER BY created_at DESC LIMIT 2000')->fetchAll(),
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
                    // Pending counts that drive the sidebar "needs attention" badges.
                    'business_requests'  => $countWhere("SELECT COUNT(*) FROM business_requests WHERE status = 'pending'"),
                    'ecosystem_requests' => $countWhere("SELECT COUNT(*) FROM ecosystem_requests WHERE status = 'pending'"),
                    'research_pending'   => $countWhere("SELECT COUNT(*) FROM research_entries WHERE status = 'submitted'"),
                    'sponsors_pending'   => $countWhere("SELECT COUNT(*) FROM sponsor_applications WHERE approval_status = 'pending_review'"),
                    'sponsor_jobs_pending' => $countWhere("SELECT COUNT(*) FROM sponsor_jobs WHERE status = 'pending'"),
                    // Approved partner/sponsor accounts with an uploaded logo awaiting publication.
                    'partner_logos_pending' => $countWhere("SELECT COUNT(*) FROM ecosystem_accounts e JOIN users u ON u.id = e.user_id WHERE e.role IN ('partner','sponsor') AND u.approval_status = 'approved' AND e.public_listed = 0 AND e.details LIKE '%\"logo_url\":\"%' AND e.details NOT LIKE '%\"logo_url\":\"\"%'"),
                    // Sponsorship proposals a Fellow submitted for approval — the
                    // Fellow is blocked until an admin answers, so surface it.
                    'fellow_proposals_pending' => $countWhere("SELECT COUNT(*) FROM fellow_proposals WHERE status = 'submitted'"),
                    // Fully-consented internships — a headline achievement for the program.
                    'internships_confirmed' => $countWhere("SELECT COUNT(*) FROM business_requests br LEFT JOIN new_school_students s ON s.id = br.student_id WHERE br.request_type = 'internship' AND (br.parent_consent = 'accepted' OR (s.age >= 18 AND br.student_consent = 'accepted'))"),
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
            // Safe variants: New School / internship tables may not exist on every
            // install, so a missing table degrades to 0 / [] instead of a 500.
            $countS = static function (string $sql) use ($count): int { try { return $count($sql); } catch (Throwable $e) { return 0; } };
            $seriesS = static function (string $sql) use ($series): array { try { return $series($sql); } catch (Throwable $e) { return []; } };
            business_ensure_schema(); // make sure student_consent/parent_consent columns exist

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
                // Internship pipeline funnel — how offers move from approval to a confirmed placement.
                'internship_funnel' => [
                    ['label' => 'Offers approved', 'value' => $countS("SELECT COUNT(*) FROM business_requests WHERE request_type='internship' AND status='approved'")],
                    ['label' => 'Student accepted', 'value' => $countS("SELECT COUNT(*) FROM business_requests WHERE request_type='internship' AND student_consent='accepted'")],
                    ['label' => 'Parent consented', 'value' => $countS("SELECT COUNT(*) FROM business_requests WHERE request_type='internship' AND parent_consent='accepted'")],
                    ['label' => 'Confirmed', 'value' => $countS("SELECT COUNT(*) FROM business_requests br LEFT JOIN new_school_students s ON s.id = br.student_id WHERE br.request_type='internship' AND (br.parent_consent='accepted' OR (s.age >= 18 AND br.student_consent='accepted'))")],
                    ['label' => 'Declined', 'value' => $countS("SELECT COUNT(*) FROM business_requests WHERE request_type='internship' AND (status='declined' OR student_consent='declined' OR parent_consent='declined')")],
                ],
                // Top schools by total student points (auto + bonus from the points ledger).
                'school_leaderboard' => $seriesS(
                    "SELECT sc.school_name AS label, COALESCE(SUM(p.points),0) AS value
                     FROM new_school_points p
                     JOIN new_school_students st ON st.id = p.recipient_id AND p.recipient_role = 'student'
                     JOIN new_school_schools sc ON sc.id = st.school_id
                     GROUP BY sc.id ORDER BY value DESC, label ASC LIMIT 8"
                ),
                // Where students are in the challenge lifecycle.
                'student_status' => $seriesS('SELECT overall_status AS label, COUNT(*) AS value FROM new_school_students GROUP BY overall_status ORDER BY value DESC'),
                // New School headline counts.
                'ns' => [
                    'schools_approved' => $countS("SELECT COUNT(*) FROM new_school_schools WHERE status='approved'"),
                    'schools_total'    => $countS('SELECT COUNT(*) FROM new_school_schools'),
                    'teachers_approved'=> $countS("SELECT COUNT(*) FROM new_school_teachers WHERE status='approved'"),
                    'students'         => $countS('SELECT COUNT(*) FROM new_school_students'),
                    'submissions'      => $countS('SELECT COUNT(*) FROM new_school_submissions'),
                    'submissions_done' => $countS("SELECT COUNT(*) FROM new_school_submissions WHERE status IN ('submitted','approved','winner')"),
                    'interviews'       => $countS('SELECT COUNT(*) FROM new_school_business_interviews'),
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

        case $method === 'PUT' && preg_match('#^admin/user/(\d+)/role$#', $route, $m) === 1: {
            $admin = require_admin();
            $targetId = (int) $m[1];
            $newRole = strtolower(trim((string) field(body(), 'role')));
            // Admins may assign any role except super_admin (no privilege escalation
            // beyond their own tier). super_admin can only be set in the database.
            $allowed = ['member', 'vip', 'editor', 'admin', 'student', 'parent', 'school', 'teacher', 'judge', 'business', 'sponsor', 'partner', 'media', 'volunteer', 'fellow'];
            if (!in_array($newRole, $allowed, true)) {
                json(['error' => 'Invalid role.'], 422);
            }
            if ($targetId === (int) $admin['id']) {
                json(['error' => 'You cannot change your own role.'], 422);
            }
            $lookup = db()->prepare('SELECT id, role FROM users WHERE id = ? LIMIT 1');
            $lookup->execute([$targetId]);
            $target = $lookup->fetch();
            if (!$target) {
                json(['error' => 'User not found.'], 404);
            }
            if ((string) $target['role'] === 'super_admin') {
                json(['error' => 'Super-admin accounts are protected and cannot be changed here.'], 403);
            }
            // Bump session_version so the user's existing sessions are invalidated and
            // they re-authenticate with the new role/permissions.
            db()->prepare('UPDATE users SET role = ?, session_version = session_version + 1, updated_at = NOW() WHERE id = ?')
                ->execute([$newRole, $targetId]);
            $fresh = db()->prepare('SELECT id, full_name, email, role, approval_status, approval_note, approval_reviewed_at, created_at, updated_at FROM users WHERE id = ? LIMIT 1');
            $fresh->execute([$targetId]);
            json([
                'message' => 'Role updated to ' . $newRole . '. The user will need to sign in again.',
                'user' => $fresh->fetch() ?: null,
            ]);
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
            events_ensure_schema();
            $rows = db()->query(
                'SELECT id, title, location, role, event_date, is_past, image_url, description, is_featured, badge_label,
                        event_time, end_date, cta_label, cta_url, publish_at, video_url, gallery_images, accent,
                        view_count, click_count
                 FROM events ORDER BY event_date ASC'
            )->fetchAll();
            json(['events' => $rows]);
        }

        case $key === 'POST admin/event': {
            require_admin();
            events_ensure_schema();
            $b = body();
            $title = field($b, 'title');
            $date  = field($b, 'event_date');
            if ($title === '') json(['error' => 'Title is required.'], 422);
            if ($date === '')  json(['error' => 'Event date is required.'], 422);
            // gallery_images arrives as an array — field() would stringify it, so read $b directly.
            $gallery = isset($b['gallery_images']) && is_array($b['gallery_images'])
                ? json_encode(array_values(array_filter(array_map('strval', $b['gallery_images']))), JSON_UNESCAPED_SLASHES) : null;
            $featured = !empty($b['is_featured']) ? 1 : 0;
            $stmt = db()->prepare(
                'INSERT INTO events (title, location, role, event_date, is_past, image_url, description, is_featured, badge_label,
                                     event_time, end_date, cta_label, cta_url, publish_at, video_url, gallery_images, accent)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([$title, field($b, 'location') ?: null, field($b, 'role') ?: null, $date, !empty($b['is_past']) ? 1 : 0,
                field($b, 'image_url') ?: null, field($b, 'description') ?: null, $featured, field($b, 'badge_label') ?: null,
                field($b, 'event_time') ?: null, field($b, 'end_date') ?: null, field($b, 'cta_label') ?: null,
                field($b, 'cta_url') ?: null, field($b, 'publish_at') ?: null, field($b, 'video_url') ?: null, $gallery,
                field($b, 'accent') ?: null]);
            $newId = (int) db()->lastInsertId();
            if ($featured) events_notify_featured($newId, $title);
            json(['id' => $newId, 'message' => 'Event created.'], 201);
        }

        case $method === 'PUT' && preg_match('#^admin/event/(\d+)$#', $route, $m) === 1: {
            require_admin();
            events_ensure_schema();
            $b = body();
            $eventId = (int) $m[1];
            $title = field($b, 'title');
            $date  = field($b, 'event_date');
            if ($title === '') json(['error' => 'Title is required.'], 422);
            if ($date === '')  json(['error' => 'Event date is required.'], 422);
            $gallery = isset($b['gallery_images']) && is_array($b['gallery_images'])
                ? json_encode(array_values(array_filter(array_map('strval', $b['gallery_images']))), JSON_UNESCAPED_SLASHES) : null;
            $featured = !empty($b['is_featured']) ? 1 : 0;
            // Was it featured before? Only notify when it becomes featured (not on every edit).
            $wasFeatured = (int) (db()->query('SELECT is_featured FROM events WHERE id = ' . $eventId)->fetchColumn() ?: 0);
            $stmt = db()->prepare(
                'UPDATE events SET title=?, location=?, role=?, event_date=?, is_past=?, image_url=?, description=?, is_featured=?, badge_label=?,
                        event_time=?, end_date=?, cta_label=?, cta_url=?, publish_at=?, video_url=?, gallery_images=?, accent=? WHERE id=?'
            );
            $stmt->execute([$title, field($b, 'location') ?: null, field($b, 'role') ?: null, $date, !empty($b['is_past']) ? 1 : 0,
                field($b, 'image_url') ?: null, field($b, 'description') ?: null, $featured, field($b, 'badge_label') ?: null,
                field($b, 'event_time') ?: null, field($b, 'end_date') ?: null, field($b, 'cta_label') ?: null,
                field($b, 'cta_url') ?: null, field($b, 'publish_at') ?: null, field($b, 'video_url') ?: null, $gallery,
                field($b, 'accent') ?: null, $eventId]);
            if ($featured && !$wasFeatured) events_notify_featured($eventId, $title);
            json(['message' => 'Event updated.']);
        }

        case $method === 'DELETE' && preg_match('#^admin/event/(\d+)$#', $route, $m) === 1: {
            require_admin();
            $stmt = db()->prepare('DELETE FROM events WHERE id = ?');
            $stmt->execute([(int) $m[1]]);
            json(['message' => 'Event deleted.']);
        }

        /* ---------------- ADMIN: PRESS / FEATURED MEDIA ---------------- */
        case $key === 'GET admin/press': {
            require_admin(); press_ensure_schema();
            json(['items' => db()->query('SELECT id, kind, title, url, thumbnail_url, source_name, sort_order, is_active FROM press_items ORDER BY sort_order ASC, id DESC')->fetchAll() ?: []]);
        }
        case $key === 'POST admin/press/resolve': {
            require_admin();
            json(press_resolve((string) field(body(), 'url')));
        }
        case $key === 'POST admin/press': {
            require_admin(); press_ensure_schema();
            $b = body();
            $title = mb_substr(trim((string) field($b, 'title')), 0, 200);
            if ($title === '') json(['error' => 'Title is required.'], 422);
            $stmt = db()->prepare('INSERT INTO press_items (kind, title, url, thumbnail_url, source_name, sort_order, is_active) VALUES (?,?,?,?,?,?,?)');
            $stmt->execute([
                mb_substr(trim((string) field($b, 'kind')) ?: 'website', 0, 20), $title,
                mb_substr(trim((string) field($b, 'url')), 0, 500) ?: null,
                mb_substr(trim((string) field($b, 'thumbnail_url')), 0, 500) ?: null,
                mb_substr(trim((string) field($b, 'source_name')), 0, 120) ?: null,
                (int) ($b['sort_order'] ?? 0), empty($b['is_active']) ? 0 : 1,
            ]);
            json(['id' => (int) db()->lastInsertId(), 'message' => 'Press item added.'], 201);
        }
        case $method === 'PUT' && preg_match('#^admin/press/(\d+)$#', $route, $m) === 1: {
            require_admin(); press_ensure_schema();
            $b = body();
            $title = mb_substr(trim((string) field($b, 'title')), 0, 200);
            if ($title === '') json(['error' => 'Title is required.'], 422);
            $stmt = db()->prepare('UPDATE press_items SET kind=?, title=?, url=?, thumbnail_url=?, source_name=?, sort_order=?, is_active=? WHERE id=?');
            $stmt->execute([
                mb_substr(trim((string) field($b, 'kind')) ?: 'website', 0, 20), $title,
                mb_substr(trim((string) field($b, 'url')), 0, 500) ?: null,
                mb_substr(trim((string) field($b, 'thumbnail_url')), 0, 500) ?: null,
                mb_substr(trim((string) field($b, 'source_name')), 0, 120) ?: null,
                (int) ($b['sort_order'] ?? 0), empty($b['is_active']) ? 0 : 1, (int) $m[1],
            ]);
            json(['message' => 'Press item updated.']);
        }
        case $method === 'DELETE' && preg_match('#^admin/press/(\d+)$#', $route, $m) === 1: {
            require_admin(); press_ensure_schema();
            db()->prepare('DELETE FROM press_items WHERE id = ?')->execute([(int) $m[1]]);
            json(['message' => 'Press item deleted.']);
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


