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
            $b    = body();
            $name = field($b, 'full_name') ?: field($b, 'name');
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
                             email_verified_at = NOW(),
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
                         ) VALUES (?, ?, ?, "pending", NULL, NULL, NULL, NOW(), NULL, NULL, NULL, 0)'
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
            json(['user' => current_user(), 'csrfToken' => csrf_token()]);
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

        case $key === 'GET testimonials': {
            $rows = db()->query(
                'SELECT id, quote, author_name, author_title, company, image, is_featured, sort_order, created_at
                 FROM testimonials ORDER BY is_featured DESC, sort_order ASC, created_at DESC'
            )->fetchAll();
            json(['testimonials' => $rows]);
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

        /* ---------------- ADMIN ---------------- */
        case $key === 'GET admin/submissions': {
            require_admin();
            json([
                'requests'    => db()->query('SELECT * FROM requests ORDER BY created_at DESC LIMIT 200')->fetchAll(),
                'subscribers' => db()->query('SELECT * FROM subscribers ORDER BY created_at DESC LIMIT 200')->fetchAll(),
                'contacts'    => db()->query('SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 200')->fetchAll(),
                'members'     => db()->query('SELECT id, full_name, email, role, approval_status, approval_note, approval_reviewed_at, created_at, updated_at FROM users ORDER BY CASE approval_status WHEN "pending" THEN 0 WHEN "rejected" THEN 1 ELSE 2 END, created_at DESC LIMIT 200')->fetchAll(),
                'orders'      => db()->query('SELECT * FROM orders ORDER BY created_at DESC LIMIT 200')->fetchAll(),
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

            json([
                'totals' => [
                    'users'        => $count('SELECT COUNT(*) FROM users'),
                    'members'      => $count("SELECT COUNT(*) FROM users WHERE role = 'member' AND approval_status = 'approved'"),
                    'vip'          => $count("SELECT COUNT(*) FROM users WHERE role = 'vip'"),
                    'admin'        => $count("SELECT COUNT(*) FROM users WHERE role IN ('admin','super_admin','editor')"),
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
            ]);
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

            json([
                'message' => 'Approval updated.',
                'user' => $updatedUser ?: null,
            ]);
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
            $stmt = db()->prepare('UPDATE orders SET status = ? WHERE id = ?');
            $stmt->execute([$status, (int) $m[1]]);
            json(['message' => 'Order updated.']);
        }

        case $method === 'GET' && preg_match('#^admin/user/(\d+)$#', $route, $m) === 1: {
            require_admin();
            $detail = admin_user_detail_payload((int) $m[1]);
            if (!$detail) {
                json(['error' => 'User not found.'], 404);
            }
            json($detail);
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
                'SELECT product_id, name, category, description, image, price, stock, low_stock_threshold,
                        restock_note, visibility, sort_order
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

            $description = field($b, 'description');
            if ($description === '') {
                $description = trim((string) ($existing['description'] ?? $fallback['description'] ?? ''));
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
                    (product_id, name, category, description, image, price, stock, low_stock_threshold, restock_note, visibility, sort_order)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    name = VALUES(name),
                    category = VALUES(category),
                    description = VALUES(description),
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
                $description !== '' ? $description : null,
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
            if (empty($_FILES['file']) || ($_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
                json(['error' => 'No file uploaded.'], 422);
            }
            $f = $_FILES['file'];
            if ($f['size'] > 6 * 1024 * 1024) json(['error' => 'Image must be 6MB or smaller.'], 422);

            $allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
            $mime = function_exists('mime_content_type') ? mime_content_type($f['tmp_name']) : ($f['type'] ?? '');
            if (!isset($allowed[$mime])) json(['error' => 'Only JPG, PNG or WebP images are allowed.'], 422);

            $dir = __DIR__ . '/uploads/media';
            if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
                json(['error' => 'Could not create upload directory.'], 500);
            }
            $name = 'media-' . bin2hex(random_bytes(8)) . '.' . $allowed[$mime];
            if (!move_uploaded_file($f['tmp_name'], $dir . '/' . $name)) {
                json(['error' => 'Failed to save the uploaded file.'], 500);
            }
            json(['url' => '/api/uploads/media/' . $name, 'message' => 'Uploaded.'], 201);
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
