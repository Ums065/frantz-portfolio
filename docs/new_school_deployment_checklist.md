# New School Deployment Checklist

Use this checklist before a staging or production release.

## Required Commands

```bash
cd frontend
npm run build
npm run check:new-school
```

For demo data and browser QA, also run:

```bash
npm run seed:new-school
npm run test:new-school
```

## 1. Environment

- Confirm `APP_ENV=production` on production.
- Confirm `APP_DEBUG=false` on production.
- Confirm `CORS_ORIGIN` is set to the live site origin.
- Confirm SMTP settings are populated:
  - `MAIL_HOST`
  - `MAIL_USERNAME`
  - `MAIL_PASSWORD`
  - `MAIL_FROM_ADDRESS`

## 2. Database

- Apply the new school schema.
- Apply the additive migration for existing databases.
- Confirm all required tables exist:
  - `new_school_schools`
  - `new_school_teachers`
  - `new_school_students`
  - `new_school_parents`
  - `new_school_approvals`
  - `new_school_business_interviews`
  - `new_school_submissions`
  - `new_school_winners`
  - `new_school_notifications`

## 3. Build Output

- Confirm `frontend/dist/index.html` exists after build.
- Confirm the frontend assets load from the production site.
- Confirm the `/new-school` route renders without broken assets.

## 4. Upload Storage

- Confirm `api/uploads/new_school` exists.
- Confirm the directory is writable by the web server.
- Confirm uploaded files can be saved and served from the same path.

## 5. Feature Verification

- Student registration works.
- Parent QR consent works.
- School approval works.
- Teacher approval works.
- 10 business interviews are required before submission.
- Final submission is blocked until all approvals are complete.
- Admin can review submissions and publish winners.

## 6. Sanity Checks

- Run the regression test after build:
  - `php ../scripts/new_school_regression_test.php`
- Confirm the demo seed script returns a clean summary:
  - `php ../scripts/new_school_seed_demo.php`
- Confirm the deployment check reports `ready`.

## 7. Release Notes

- Winner announcement date remains `August 25, 2026`.
- Scholarship awards remain:
  - First: `$2,500`
  - Second: `$1,500`
  - Third: `$1,000`
- Keep the `new_school` feature linked from the current site navigation.
