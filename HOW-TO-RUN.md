# FrantzCoutard.com — How to Run

Full-stack build: **React + TypeScript + Tailwind** frontend, **Core PHP** REST API, **MySQL** database, on WAMP.

## Architecture
```
frantz-portfolio/
├── frontend/   → React + TS + Tailwind (Vite).  Dev server: http://localhost:5173
├── api/        → Core PHP REST API.  Served by WAMP Apache: http://localhost/frantz-portfolio/api
├── db/         → schema.sql (tables + seed data)
└── project/    → original approved design (reference only)
```
The Vite dev server **proxies `/api`** to the PHP API, so the browser is same-origin and PHP sessions (login) work.

## One-time setup
1. **WAMP must be running** (Apache + MySQL green).
2. **Load the database** (already done, re-run any time to reset):
   ```
   "C:\wamp64\bin\mysql\mysql9.1.0\bin\mysql.exe" -u root --default-character-set=utf8mb4 < db\schema.sql
   "C:\wamp64\bin\mysql\mysql9.1.0\bin\mysql.exe" -u root --default-character-set=utf8mb4 < db\awards.sql
   "C:\wamp64\bin\mysql\mysql9.1.0\bin\mysql.exe" -u root --default-character-set=utf8mb4 < db\orders.sql
   ```
   > The `--default-character-set=utf8mb4` flag is required so accented
   > characters and em-dashes (—) in the seed text import correctly.
3. **Environment config (`.env`)** — already created with WAMP defaults:
   - `api/.env` — DB host/name/user/pass, session, CORS, APP_DEBUG.
     Copy from `api/.env.example` if missing. **Edit `DB_*` here to change the DB connection.**
   - `api/.env` also needs the SMTP variables for email verification:
     `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`,
     `MAIL_PASSWORD`, `MAIL_ENCRYPTION`, `MAIL_TIMEOUT_SECONDS`, `MAIL_ALLOW_PHP_FALLBACK`.
   - `frontend/.env` — `VITE_API_BASE` (defaults to `/api`).
   - Both `.env` files are git-ignored; the `.env.example` templates are tracked.
   - If your database already existed before this change, run `db/add-email-verification-columns.sql` once.
4. **Install frontend deps** (already done):
   ```
   cd frontend
   npm install
   ```

## Run (development)
```
cd frontend
npm run dev
```
Open **http://localhost:5173** — the full site.
Admin dashboard: **http://localhost:5173/admin**

## Admin login
- No default admin password is shipped anymore.
- Create an admin from `db/create-admin-user.sql`, or promote an existing user in MySQL.

## What works (real, DB-backed)
- **Register / Email verify / Login / Logout** — new users receive an OTP by email and must verify before login.
- **Newsletter subscribe** (footer) — saved to `subscribers`.
- **All "Request / Apply" forms** (Speaking, Media Kit, Interview, Pin, Giveaway,
  Broker, Mentorship, Sponsor, Invite, Partner…) — saved to `requests`.
- **Events & Blog** — pulled live from MySQL via the API.
- **Admin dashboard** — view requests / subscribers / contacts / members,
  update request status. Role-gated (admin/editor/super_admin only).

## Build for production
```
cd frontend
npm run build      # outputs to frontend/dist
```
Serve `frontend/dist` (e.g. copy into a WAMP folder or any static host) and point
the `/api` calls at the deployed PHP API (adjust the proxy / API base URL).

**SPA routing:** the build ships a `dist/.htaccess` that rewrites unknown paths to
`index.html`, so deep links and refresh on `/about`, `/awards`, `/blog`, `/events`
work under Apache. If you serve the build from a subfolder, uncomment and set
`RewriteBase` in that file. (The dev server handles this automatically.)

**Email notifications:** set `MAIL_ENABLED=true` and `NOTIFY_EMAIL=you@domain` in
`api/.env` to get an email on each contact/request submission. Requires a working
mail transport (WAMP sendmail or an SMTP relay/service).

## API endpoints (quick reference)
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `auth/register` | create member + send verification code |
| POST | `auth/verify-email` | verify OTP + create session |
| POST | `auth/resend-verification` | resend verification code |
| POST | `auth/login` | login or send verification code if email is unverified |
| POST | `auth/logout` | logout |
| GET  | `auth/me` | current user |
| GET  | `events` / `posts` / `awards` | public content |
| GET  | `posts/{id}` | single article (with body) |
| POST | `subscribe` | newsletter |
| POST | `request` | speaking / media / apply etc. |
| POST | `contact` | contact message |
| GET  | `admin/submissions` | all submissions (admin) |
| PUT  | `admin/request/{id}` | update request status (admin) |
| GET POST PUT DELETE | `admin/awards` · `admin/award[/{id}]` | awards CRUD (admin) |
| GET POST PUT DELETE | `admin/events` · `admin/event[/{id}]` | events CRUD (admin) |
| GET POST PUT DELETE | `admin/posts` · `admin/post[/{id}]` | blog posts CRUD (admin) |
| POST | `admin/upload` | image upload → `/api/uploads/media/…` (admin) |
