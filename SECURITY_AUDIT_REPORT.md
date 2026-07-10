# 🔐 Security Audit & Vulnerability Report
### FrantzCoutard.com — Student "Leave It Better Than You Found It" Platform

| | |
|---|---|
| **Application** | PHP 8.2 (no framework) API + React/Vite frontend |
| **Audit type** | Full static + dynamic code review (OWASP Top 10, CWE, SANS 25) |
| **Codebase** | `c:\wamp64\www\frantz-portfolio` — `api/`, `frontend/` |
| **Date** | 2026-07-09 |
| **Auditor** | Senior AppSec review (automated multi-agent sweep + manual verification) |

> ⚠️ Two of the Critical findings were **verified live** against the running server (not assumptions). Items that could not be confirmed are marked **"Manual verification recommended."**

---

## 1. Executive Summary

The platform is **well-engineered in several important ways** — SQL is almost entirely parameterized (no SQL injection found), the React frontend has no unsafe HTML sinks (no stored/reflected XSS found), session IDs are regenerated on login (no session fixation), CSRF is enforced with a strong random token, CORS is not wildcarded, and store prices are re-derived server-side (no price tampering).

However, the audit found **serious, exploitable problems** that must be fixed **before this goes live**. The two most urgent were confirmed by directly exercising the running server:

1. **A hardcoded admin backdoor.** A demo admin account with a **publicly documented password** logs in through the normal login form and grants full admin — and it keeps working even if "demo mode" is turned off.
2. **The secrets file (`api/.env`) is downloadable over the web.** `GET /api/.env` returned HTTP 200 with the file contents, exposing the Google OAuth client secret and refresh token (full mailbox-send access).

In addition, the **payment verification for Razorpay and PayPal can be replayed/abused** to mark expensive orders as paid, there is **no rate limiting anywhere** (brute-force friendly), **account takeover is possible via public re-registration**, and several **access-control gaps** let the wrong user write another user's data.

**The platform is not safe to expose publicly until the Critical and High items below are remediated.**

### Scores

| Metric | Value |
|---|---|
| **Security Score** | **41 / 100** (Poor — driven by 4 Critical auth/secret/payment issues) |
| **Overall Risk Rating** | **CRITICAL** |
| **Production-ready?** | ❌ Not until Critical + High items are fixed |

### Issue count by severity

| Severity | Count |
|---|---|
| 🔴 Critical | 4 |
| 🟠 High | 7 |
| 🟡 Medium | 8 |
| 🔵 Low | 5 |
| ⚪ Informational (positive controls) | 11 |
| **Total actionable** | **24** |

---

## 2. Findings by Severity (index)

**🔴 Critical**
- C-1 Hardcoded demo **admin backdoor** usable via normal login
- C-2 `api/.env` **secrets downloadable** over HTTP
- C-3 **Razorpay** payment verification replay / order-not-bound
- C-4 **PayPal** payment capture — order-not-bound / no amount check

**🟠 High**
- H-1 **Account takeover** via public re-registration (password/role overwrite)
- H-2 **IDOR write** — any role can create/overwrite any student's business interview
- H-3 **No rate limiting** (login brute-force, enumeration, flooding)
- H-4 **Stock drained without payment** (pre-payment decrement + unpaid `POST order`)
- H-5 **Unauthenticated 70 MB file upload** (`new-school/upload`)
- H-6 `APP_DEBUG=true` in deployed `.env` **leaks exceptions / DB errors**
- H-7 Weak **password policy** (6-char minimum, no complexity/breach check)

**🟡 Medium**
- M-1 Student can **self-award "winner" / score / rank** on own submission
- M-2 Judge can **view & score ANY submission** (assignment gate ineffective)
- M-3 Stripe confirm does **not re-verify amount/currency**
- M-4 **Email verification globally bypassed**
- M-5 **No security headers** (CSP, X-Frame-Options, HSTS, X-Content-Type-Options) / no HTTPS enforcement
- M-6 **User enumeration** (register / forgot-password reveal which emails exist)
- M-7 **`editor` role treated as full admin** (incl. impersonation)
- M-8 Uploads directory has **no script-execution block**

**🔵 Low**
- L-1 Enumerable **unauthenticated student lookup** (minor PII)
- L-2 `government_id_url` stored **without format validation**
- L-3 **No session idle/absolute timeout**
- L-4 Leftover **test files** in a public upload directory
- L-5 **Vite 5.4.8** (dev-server advisories) — bump

---

## 3. Detailed Findings

---

### 🔴 C-1 — Hardcoded demo *admin* backdoor usable through the normal login form
- **Severity:** Critical (CWE-798 Hardcoded Credentials, CWE-912 Hidden Functionality)
- **Status:** ✅ **Verified live** — `POST auth/login` with `demo.admin@frantzcoutard.demo` / `demo1234` returned an **admin** session; `GET admin/submissions` then returned **HTTP 200**.
- **Affected files:** `api/lib.php` (`demo_user`, `demo_ensure_accounts`, `demo_mode_enabled` ~lines 3713–3890), `api/index.php` (`POST auth/login` ~125–173; demo routes ~1347–1357)

**Description (simple English):** For presentations, the app auto-creates ready-made accounts (Admin, Sponsor, Student, …) all with the **same public password `demo1234`**. That password is even shown on the `/demo` page and written in commit messages. The "demo mode" switch only hides the one-click demo buttons — it does **not** stop those accounts from logging in through the ordinary login form.

**Why it is dangerous:** Anyone who knows (or reads) `demo.admin@frantzcoutard.demo` / `demo1234` gets **full administrator control** — even after you set `DEMO_MODE=off`. It is a permanent admin backdoor with a known password.

**Code snippet:**
```php
// api/lib.php — demo_user()
$hash = password_hash('demo1234', PASSWORD_DEFAULT);
// creates users with role='admin', approval_status='approved', verified
```
```php
// api/index.php — POST auth/login has NO demo gating; password_verify('demo1234', ...) passes
```

**Attack scenario:** Attacker visits `/demo` once (or reads the frontend source / this repo), learns the email pattern + `demo1234`, then logs in at the normal login page as `demo.admin@…` → full admin: edit content, approve/reject users, impersonate anyone, read all data.

**Recommended fix:**
- Only *create* demo accounts when `DEMO_MODE` is on **and** `APP_ENV=local`.
- Give demo accounts a **random** password each seed (login only via the demo endpoint, which bypasses password); never a shared known password.
- When `DEMO_MODE=off`, **delete or disable** the demo rows, and reject login for any `@frantzcoutard.demo` email.

**Example secure code:**
```php
function demo_user(string $role, string $name): array {
    // random, unknowable password — normal login can never use it
    $hash = password_hash(bin2hex(random_bytes(24)), PASSWORD_DEFAULT);
    /* …insert/update… */
}
// in require_csrf()/login: if (!demo_mode_enabled() && str_ends_with($email,'@frantzcoutard.demo')) reject();
```
**References:** OWASP A07:2021 Identification & Authentication Failures; CWE-798; OWASP ASVS 2.10.

---

### 🔴 C-2 — `api/.env` (with live secrets) is downloadable over HTTP
- **Severity:** Critical (CWE-538 File/Path Disclosure, CWE-312 Cleartext Storage)
- **Status:** ✅ **Verified live** — `GET /api/.env` → **HTTP 200** and returned the file body.
- **Affected files:** `api/.env` (contains `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, mail creds), `api/.htaccess` (no dotfile deny), root `.htaccess`

**Description:** The environment file that holds real secrets sits inside the web-served `api/` directory, and no web-server rule blocks it. Requesting the URL directly returns the file.

**Why it is dangerous:** The Google OAuth **client secret** + **refresh token** grant the ability to send email as your account and potentially access Google APIs. DB config is also revealed. Anyone on the internet can download it.

**Code snippet:**
```apache
# api/.htaccess — real files (like .env) are served directly; rewrite is skipped for them
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.*)$ index.php?r=$1 [QSA,L]
```
(The file **is** correctly gitignored — it is *not* committed — but it is still web-served.)

**Attack scenario:** `curl https://yoursite.com/api/.env` → attacker downloads Google refresh token → sends phishing email as you / abuses your Google quota; reads DB name/user.

**Recommended fix (do immediately):**
```apache
# api/.htaccess — top of file
<FilesMatch "^\.env">
    Require all denied
</FilesMatch>
# (Apache < 2.4: Order allow,deny / Deny from all)
```
Better: move `.env` **outside the web root**. **Rotate** `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, and the Gmail app password now — assume they are compromised.
**References:** OWASP A05:2021 Security Misconfiguration; CWE-538; Apache `FilesMatch` docs.

---

### 🔴 C-3 — Razorpay verification can be replayed to mark any order "paid"
- **Severity:** Critical (CWE-345 Insufficient Verification of Data Authenticity, CWE-639 Authorization Bypass Through User-Controlled Key)
- **Status:** Confirmed by code review (live exploit needs a valid Razorpay signature, i.e. one real payment).
- **Affected files:** `api/index.php` (`POST store/checkout/razorpay-verify` ~1197–1212), `api/lib.php` (`storefront_razorpay_verify_signature`, `storefront_mark_order_paid`)

**Description:** On return from Razorpay, the client sends `order_no`, `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`. The signature is checked correctly — **but the server never checks that `razorpay_order_id` is the one it created for `order_no`, and never compares the paid amount to the order total.** It then marks the order (looked up only by the client-supplied `order_no`) as paid.

**Why it is dangerous:** A buyer can pay for one cheap item, get a genuine (valid-signature) payment, then re-send the verify call with a **different, more expensive `order_no`** — marking it paid without paying for it. Order numbers are guessable (`FC-` + 6 digits), so other people's orders can be targeted.

**Code snippet:**
```php
if (!storefront_razorpay_verify_signature($rzpOrderId, $paymentId, $signature)) json([...], 400);
storefront_mark_order_paid($orderNo, 'razorpay', 'razorpay', $paymentId, $rzpOrderId);
// ^ no check that the order's stored payment_session_id === $rzpOrderId, no amount check
```

**Attack scenario:** Attacker checks out a $1 sticker → pays legitimately → replays `razorpay-verify` with `order_no` of their $500 order → $500 order flips to paid/fulfilled.

**Recommended fix:** Load the order; require `order.payment_session_id === razorpay_order_id`; fetch the payment from Razorpay's API and assert `amount === round(order.total*100)` and matching currency; add a **UNIQUE** DB constraint on `payment_intent_id` to block replay.

**Example secure code:**
```php
$order = /* SELECT * FROM orders WHERE order_no=? FOR UPDATE */;
if ($order['payment_session_id'] !== $rzpOrderId) json(['error'=>'Order mismatch.'],400);
$pay = razorpay_fetch_payment($paymentId);           // server-to-server
if ((int)$pay['amount'] !== (int) round($order['total']*100) || strtoupper($pay['currency']) !== strtoupper($currency)) json(['error'=>'Amount mismatch.'],400);
storefront_mark_order_paid($orderNo, ...);
```
**References:** OWASP A08:2021 Software & Data Integrity Failures; Razorpay "Verify Payment Signature" docs; CWE-345.

---

### 🔴 C-4 — PayPal capture is not bound to the order and skips amount check
- **Severity:** Critical (CWE-345, CWE-639)
- **Affected files:** `api/index.php` (`POST store/checkout/paypal-capture` ~1215–1228), `api/lib.php` (`storefront_paypal_capture_order`)

**Description:** Same class of flaw as C-3. The route captures a PayPal order id supplied by the client and, if the capture status is `COMPLETED`, marks the client-supplied `order_no` paid. It never confirms the `paypal_order_id` belongs to that `order_no`, nor that the captured amount/currency equals the order total.

**Why it is dangerous / Attack scenario:** Same as C-3 — pay once, mark a different/expensive order paid; underpayment (partial capture / different currency) is accepted.

**Recommended fix:** Verify `order.payment_session_id === paypal_order_id`; read the capture's `purchase_units[].amount.value` + `currency_code` and assert they equal the order total; enforce `payment_intent_id` uniqueness.
**References:** PayPal Orders v2 "Capture payment" docs; OWASP A08:2021; CWE-345.

---

### 🟠 H-1 — Account takeover via public re-registration (password & role overwrite)
- **Severity:** High (CWE-620 Unverified Password Change, CWE-287)
- **Affected files:** `api/new_school_routes.php` (`new_school_upsert_user_account` ~5–46) — reached by public routes: `new-school/student/register`, `new-school/school/register`, `new-school/teacher/register`, `new-school/parent/consent`, and `api/index.php` `business/register`, `ecosystem/{role}/register`.

**Description:** When someone registers with an email that **already exists** (and is not an admin-tier account), the function **overwrites that account's `password_hash` and `role`** with the values from the new (attacker's) request and logs them in — with no check that the email was already verified / owned.

**Why it is dangerous:** An unauthenticated attacker can take over any existing student/teacher/parent/business/sponsor/judge/member account just by "registering" again with that email and a password of their choice.

**Code snippet:**
```php
if ($existing) {
    if (in_array($existing['role'], ['admin','super_admin','editor'], true)) json([...],409); // only admins protected
    // UPDATE users SET password_hash=?, role=? ... WHERE id=?  ← overwrites victim
}
```

**Attack scenario:** Attacker submits `POST new-school/student/register` with `email=victim@school.edu`, `password=attacker123`. Victim's password is overwritten; attacker is logged in as them.

**Recommended fix:** Mirror `POST auth/register` — if `$existing['email_verified_at']` is set, **reject with 409** instead of overwriting. Never reset `password_hash`/`role` on an existing verified account during registration.
**References:** OWASP A07:2021; CWE-620.

---

### 🟠 H-2 — IDOR write: any approved user can create/overwrite any student's business interview
- **Severity:** High (CWE-639 Authorization Bypass Through User-Controlled Key / IDOR)
- **Affected files:** `api/new_school_routes.php` (`POST new-school/business` ~2316–2388)

**Description:** The handler blocks `teacher`/`school`, resolves the record for `student`/`parent` — but every **other** approved role (`judge`, `business`, `sponsor`, `media`, `volunteer`, `member`) falls into an `elseif ($studentId > 0)` branch that trusts a `student_id` from the request **without any ownership or admin check** (the comment claims it's "admin acting on their behalf", but no admin check exists).

**Why it is dangerous:** Any logged-in, approved user can insert or overwrite (visit-number upsert) interview evidence for **any** student, corrupting contest data.

**Code snippet:**
```php
} elseif ($studentId > 0) {                 // meant for admins, but no require_admin()
    $student = new_school_fetch_student_by_id($studentId);   // arbitrary student
}
```

**Attack scenario:** An approved `business` account posts to `new-school/business` with another child's `student_id` and rewrites their interviews.

**Recommended fix:** Restrict the `elseif ($studentId > 0)` branch to admin roles, exactly like `POST new-school/submission` already does (`in_array($user['role'], ['admin','super_admin','editor'])`).
**References:** OWASP A01:2021 Broken Access Control; CWE-639.

---

### 🟠 H-3 — No rate limiting anywhere (brute-force, enumeration, flooding)
- **Severity:** High (CWE-307 Improper Restriction of Excessive Authentication Attempts)
- **Affected files:** `api/index.php` (`auth/login` ~125, `auth/register` ~34, `auth/admin-login` ~242, `auth/forgot-password` ~175), all payment-verify + upload routes.

**Description:** There is no throttling, lockout, delay, or CAPTCHA on any endpoint. `password_verify` runs on every login attempt with no attempt counter.

**Why it is dangerous:** Unlimited online password brute-force / credential stuffing (especially dangerous with the weak 6-char policy H-7 and the `demo1234` accounts C-1); payment-verify hammering (amplifies C-3/C-4); upload flooding (amplifies H-5).

**Recommended fix:** Per-IP **and** per-account rate limiting (token bucket in DB/Redis) with exponential backoff + temporary lockout on repeated failures; CAPTCHA after N failures; throttle payment-verify and upload endpoints.
**References:** OWASP A07:2021; CWE-307; OWASP ASVS 2.2.1.

---

### 🟠 H-4 — Inventory can be drained without paying
- **Severity:** High (CWE-840 Business Logic Errors)
- **Affected files:** `api/index.php` (`store/checkout` ~1050–1053; `POST order` ~1230–1310)

**Description:** Two problems: (a) stock is **decremented when checkout starts**, before payment, and there is **no restoration** if the buyer abandons the payment (no cancel/expiry/webhook handler); (b) `POST order` confirms an order and decrements stock **with no payment step at all**.

**Why it is dangerous:** An attacker (or normal abandonment) starts many checkouts to drive stock to 0, blocking real buyers ("Not enough stock"). `POST order` lets anyone zero inventory instantly.

**Recommended fix:** Reserve stock with a TTL or only decrement on **confirmed payment**; add a cron/webhook to release stock for `pending` orders that expire; remove or convert the unpaid `POST order` route to a reservation. (Good: the per-row `SELECT … FOR UPDATE` already prevents oversell within a request.)
**References:** OWASP A04:2021 Insecure Design; CWE-840.

---

### 🟠 H-5 — Unauthenticated 70 MB file upload
- **Severity:** High (CWE-434 Unrestricted Upload / CWE-770 Resource Allocation)
- **Affected files:** `api/new_school_routes.php` (`POST new-school/upload` ~2723–2779)

**Description:** This upload route has **no authentication guard**. Anyone can upload videos up to **70 MB** and documents to `api/uploads/new_school/`. (Naming/extension is safe — random name + server-forced extension — so this is not RCE.)

**Why it is dangerous:** Anonymous disk-exhaustion DoS and free hosting of arbitrary files on your domain (phishing/malware distribution). With no rate limiting (H-3), one script can fill the disk.

**Recommended fix:** Require `require_login()` (or a valid enrollment token) before accepting the upload; add per-user/IP throttling and a daily quota.
**References:** OWASP A04/A05; CWE-434; CWE-770.

---

### 🟠 H-6 — `APP_DEBUG=true` in the deployed `.env` leaks exception & DB errors
- **Severity:** High (CWE-209 Information Exposure Through an Error Message)
- **Status:** Confirmed `APP_DEBUG` present in `api/.env`; agent read value as `true`. **Manual verification recommended** on the production host.
- **Affected files:** `api/.env` (`APP_DEBUG`), `api/config.php` (`app_debug()` ~50–53, DB error ~74–76), `api/index.php` (global catch ~2778–2784)

**Description:** With debug on, the global error handler and DB layer return the raw exception message (including SQL/DB details) to the client.

**Why it is dangerous:** Detailed errors help attackers map the database/schema and internal paths.

**Code snippet:**
```php
} catch (Throwable $e) {
    $payload = ['error' => 'Server error'];
    if (app_debug()) { $payload['detail'] = $e->getMessage(); }  // leaks in prod if true
    json($payload, 500);
}
```
**Recommended fix:** Force `APP_DEBUG=false` in production; log details to a file server-side only.
**References:** OWASP A05:2021; CWE-209.

---

### 🟠 H-7 — Weak password policy (6-char minimum)
- **Severity:** High (CWE-521 Weak Password Requirements)
- **Affected files:** `api/index.php` (~41, ~215, ~337)

**Description:** Only a 6-character minimum, no complexity or breached-password check, applied even to admin accounts. **Code snippet:** `if (strlen($pass) < 6) json([...],422);`

**Why it is dangerous:** Short passwords + no rate limiting (H-3) = trivially brute-forced accounts.

**Recommended fix:** Minimum 12+ characters, check against a breached-password list (e.g., HaveIBeenPwned k-anonymity), enforce especially for privileged roles.
**References:** NIST SP 800-63B; OWASP ASVS 2.1; CWE-521.

---

### 🟡 M-1 — Student can self-award "winner" / score / rank on their own submission
- **Severity:** Medium–High (CWE-639 / business logic)
- **Affected files:** `api/new_school_routes.php` (`POST/PUT new-school/manage/submission` ~3930–4005)

**Description:** In the "manage" submission handlers, `status`, `score`, and `rank_position` are read straight from the request body with no privilege gate. A student editing their **own** submission can set `status="winner"`, an arbitrary `score`, and `rank_position=1`. (The normal submission path hardcodes `status="submitted"` and rejects score/rank — confirming these are admin-only fields.)

**Attack scenario:** `PUT new-school/manage/submission/{ownId}` with `{"status":"winner","score":215,"rank_position":1}` → self-declared contest winner.

**Recommended fix:** Only accept `status`/`score`/`rank_position` when the caller's scope is admin/teacher/school; restrict students to `draft`/`submitted`.
**References:** OWASP A01:2021; CWE-639.

---

### 🟡 M-2 — Judge can view & score ANY submission (assignment gate ineffective)
- **Severity:** Medium — **Manual verification recommended** (may be intended "all judges score all")
- **Affected files:** `api/lib.php` (`new_school_judge_can_review` ~3959–3965); used in `new-school/judge/submission/{id}` and `.../score`

**Description:** The guard returns `true` when the judge has **no assignment row** (`false !== 'recused'` is `true`). So any judge can read/score submissions never assigned to them, despite the "not assigned to you" error text.

**Attack scenario:** A judge enumerates submission ids to read every participant's evidence and can skew scores on unassigned entries.

**Recommended fix:** If assignment is meant to constrain access, require a present non-recused assignment (`=== 'assigned'`). Otherwise remove the misleading messaging. Confirm intended judging model.
**References:** OWASP A01:2021; CWE-639.

---

### 🟡 M-3 — Stripe confirm does not re-verify amount/currency
- **Severity:** Medium — **Manual verification recommended** (low exploitability: session is server-created)
- **Affected files:** `api/index.php` (`store/checkout/confirm` ~1106–1194)

**Description:** Confirm correctly requires `payment_status==='paid'` and `client_reference_id===order_no` (good, and the session was created with server catalog prices), but never explicitly asserts `amount_total`/`currency` equal the order total.
**Recommended fix (hardening):** Also assert `$session['amount_total'] === (int) round($order['total']*100)` and matching currency. **References:** OWASP A08:2021.

---

### 🟡 M-4 — Email verification globally bypassed
- **Severity:** Medium (CWE-287)
- **Affected files:** `api/index.php` (~33 comment "verification is disabled", register ~67, login ~144–153)

**Description:** Register and login unconditionally set `email_verified_at=NOW()`, so no user ever proves they own the email. Appears to be an intentional temporary bypass.
**Why dangerous:** Anyone can register/act with any email string; spoofed identities; neutralizes the existing OTP machinery. Pairs badly with H-1 (takeover) and M-6 (enumeration).
**Recommended fix:** Re-enable OTP/email verification before production; gate the bypass behind an env flag that is off in prod.
**References:** OWASP A07:2021; CWE-287.

---

### 🟡 M-5 — Missing security headers & no HTTPS enforcement
- **Severity:** Medium (CWE-693 Protection Mechanism Failure)
- **Affected files:** `api/config.php` (~28–47), root/`api`/`frontend/public` `.htaccess`

**Description:** No `Content-Security-Policy`, `X-Frame-Options`, `Strict-Transport-Security`, `X-Content-Type-Options`, or `Referrer-Policy` are sent; no HTTP→HTTPS redirect. The session cookie's `secure` flag is only set when HTTPS is already in use, so plain-HTTP requests send the session cookie in cleartext.
**Why dangerous:** Clickjacking, MIME sniffing, SSL-strip, and no defense-in-depth for XSS.
**Recommended fix:** Add the standard header set + HSTS at the server/config layer; force HTTPS.
```apache
Header always set X-Frame-Options "DENY"
Header always set X-Content-Type-Options "nosniff"
Header always set Referrer-Policy "strict-origin-when-cross-origin"
Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
Header always set Content-Security-Policy "default-src 'self'; img-src 'self' data:; ..."
```
**References:** OWASP Secure Headers Project; MDN CSP; CWE-693.

---

### 🟡 M-6 — User enumeration (register / forgot-password)
- **Severity:** Medium (CWE-204 Observable Response Discrepancy)
- **Affected files:** `api/index.php` (register ~48–50, forgot-password ~183–185, login approval branch ~139)

**Description:** Registration returns "An account with this email already exists" and forgot-password returns "No account is registered with this email address" — both reveal whether an email is registered. (Login itself is generic — good.)
**Recommended fix:** Return uniform, generic responses regardless of account existence.
**References:** OWASP A07:2021; CWE-204.

---

### 🟡 M-7 — `editor` role treated as full admin (including impersonation)
- **Severity:** Medium (CWE-269 Improper Privilege Management)
- **Affected files:** `api/lib.php` (`require_admin` ~152–158)

**Description:** `require_admin()` accepts `admin`, `super_admin`, **and `editor`**, so every admin route — including `POST admin/impersonate` — is reachable by an editor. An editor could impersonate higher-privileged users.
**Recommended fix:** Give `editor` a content-only capability tier; exclude editors from impersonation and user-management routes.
**References:** OWASP A01:2021; CWE-269.

---

### 🟡 M-8 — Uploads directory has no script-execution block
- **Severity:** Medium (defense-in-depth) (CWE-434)
- **Affected files:** `api/uploads/` (no `.htaccess`)

**Description:** The web-served uploads directory has no rule disabling PHP/script execution. Current upload code forces safe names/extensions (so not exploitable today), but there is zero containment if any future/other code writes an attacker-influenced name.
**Recommended fix:** Drop a hardening `.htaccess` in `api/uploads/` disabling the PHP engine and denying executable extensions:
```apache
php_flag engine off
<FilesMatch "\.(php|phtml|phar|phps|cgi|pl|py|sh)$">
  Require all denied
</FilesMatch>
```
**References:** OWASP File Upload Cheat Sheet; CWE-434.

---

### 🔵 Low findings (summary)

| ID | Finding | File(s) | Fix |
|----|---------|---------|-----|
| **L-1** | Unauthenticated, enumerable student lookup exposes minor's name/school/teacher via 8-digit `participant_id` | `api/new_school_routes.php` ~813–852 | Require the high-entropy `qr_token` instead of the short numeric id; rate-limit. **Manual verification** (may be an intended public "verify participant" page). |
| **L-2** | `government_id_url` stored without format validation (avatar_url is validated; this isn't) | `api/new_school_routes.php` ~1138, 1231 | Validate against `^(/api/uploads/|https?://)`; ensure admin UI renders it safely (no `javascript:`). |
| **L-3** | No session idle/absolute timeout | `api/config.php` ~15–26 | Add idle + absolute expiry for privileged sessions. |
| **L-4** | Leftover `shell-write-test.txt` / `testx.txt` in `api/uploads/new_school/` | filesystem | Delete; confirm origin (if via H-5, reinforces that risk). |
| **L-5** | Vite `5.4.8` predates 5.4.x dev-server advisories | `frontend/package.json` | Bump to latest 5.4.x (impact limited to dev server). |

---

## 4. Positive Controls (⚪ Informational — keep these)

The following were checked and found **correctly implemented** — preserve them:

1. **No SQL injection** — all queries use PDO prepared statements or `(int)` casts / hard-coded whitelists; `ATTR_EMULATE_PREPARES=false`.
2. **No frontend XSS sinks** — no `dangerouslySetInnerHTML`, `innerHTML`, `eval`, or `document.write` in `frontend/src`; React auto-escaping in effect.
3. **Session fixation prevented** — `session_regenerate_id(true)` on every login (`api/lib.php` `login_user`).
4. **Strong CSRF** — token via `bin2hex(random_bytes(32))`, compared with `hash_equals`; enforced on non-GET.
5. **CORS not wildcard** — origin echoed only when it exactly matches configured `CORS_ORIGIN`; credentials only then.
6. **Server-side price integrity** — `normalized_order_items()` ignores client prices and re-reads the catalog.
7. **Safe upload naming** — `media_store_uploaded_file()` uses content-based MIME + server-forced extension + random name.
8. **Oversell prevented** — `SELECT … FOR UPDATE` row locks during checkout.
9. **No dynamic code execution / backdoors** — `popen`/`proc_open` use `escapeshellarg` with server-only values; `base64_decode` is for mail attachments; no `eval`.
10. **Secrets not committed** — `api/.env` is gitignored; `.env.example` has only placeholders.
11. **Stripe confirm binds order** — verifies `client_reference_id === order_no` and idempotent `FOR UPDATE`.

---

## 5. Remediation Roadmap

### 🚑 Phase 0 — Emergency (do today, before any public exposure)
1. **C-2:** Add `.env` deny rule to `api/.htaccess` (1 line) and **rotate** the Google secret + refresh token + mail password.
2. **C-1:** Disable the demo backdoor — random demo passwords + block `@frantzcoutard.demo` login when demo mode is off (or delete demo rows in prod).
3. **H-6:** Set `APP_DEBUG=false` on the live server.

### 🔴 Phase 1 — Critical/High (this week)
4. **C-3 / C-4:** Bind provider order id to `order_no` + verify amount/currency + unique `payment_intent_id`.
5. **H-1:** Block re-registration overwrite of verified accounts.
6. **H-2 / M-1 / M-2:** Fix the three access-control gaps (business-interview branch, submission status/score, judge assignment).
7. **H-3:** Add rate limiting to auth + payment-verify + upload.
8. **H-5:** Authenticate `new-school/upload`.
9. **H-4:** Stop draining stock without payment.

### 🟡 Phase 2 — Medium (this month)
10. **H-7 / M-4:** Stronger passwords; re-enable email verification.
11. **M-5:** Security headers + HTTPS/HSTS.
12. **M-6:** Uniform enumeration-safe responses.
13. **M-7:** Separate the `editor` tier.
14. **M-8:** `uploads/` execution block.

### 🔵 Phase 3 — Hardening (ongoing)
15. Low items L-1…L-5; session timeouts; dependency bumps; add automated security tests.

---

## 6. Top 10 Highest-Priority Fixes
1. Remove the demo **admin backdoor** (C-1)
2. Block `.env` from HTTP + **rotate** leaked secrets (C-2)
3. Fix **Razorpay** payment verification (C-3)
4. Fix **PayPal** payment capture (C-4)
5. Stop **account-takeover** re-registration (H-1)
6. Add **rate limiting** to auth/payment/upload (H-3)
7. Turn **`APP_DEBUG` off** in prod (H-6)
8. Fix **IDOR** on business-interview write (H-2)
9. **Authenticate** the 70 MB upload route (H-5)
10. Fix **self-awarded winner/score** (M-1)

## 7. Quick Wins (low effort, high value)
- `.env` deny rule (C-2) — 3 lines.
- `APP_DEBUG=false` (H-6) — 1 setting.
- `uploads/.htaccess` execution block (M-8) — 5 lines.
- Security headers block (M-5) — a few `.htaccess` lines.
- Add `require_login()` to `new-school/upload` (H-5) — 1 line.
- Restrict the `elseif ($studentId > 0)` branch to admins (H-2) — 1 condition.

## 8. Long-Term Improvements
- Introduce a real rate-limiting / WAF layer (per-IP + per-account).
- Adopt vetted payment SDKs and/or provider **webhooks** (with signature verification) as the source of truth for "paid," instead of client-return calls.
- Re-enable email verification + optional MFA for admins.
- Add a capability/permission model (replace the flat `editor==admin`).
- Add automated security testing (SAST + dependency scanning) to CI.

---

## 9. Final Summary

| Metric | Count |
|---|---|
| **Total actionable issues** | **24** |
| 🔴 Critical | 4 |
| 🟠 High | 7 |
| 🟡 Medium | 8 |
| 🔵 Low | 5 |
| ⚪ Informational (positive controls) | 11 |
| **Security Score** | **41 / 100** |
| **Overall Risk** | **CRITICAL** |

### Conclusion
The application shows **good fundamentals** (parameterized SQL, clean React output, CSRF, session regeneration, server-side pricing) but carries **four Critical issues** — a hardcoded admin backdoor, a downloadable secrets file, and two payment-verification bypasses — plus authentication and access-control weaknesses. **Do not expose this platform publicly until Phase 0 and Phase 1 are complete.** Most fixes are small and well-scoped; the emergency items (C-2, C-1, H-6) can be done in under an hour.

*This report reflects the codebase at 2026-07-09. Findings marked "Manual verification recommended" should be confirmed on the production host. Re-audit after remediation.*
