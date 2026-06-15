USE frantz_portfolio;

-- Generate a bcrypt hash first, for example:
-- php -r "echo password_hash('Use-A-Strong-Password', PASSWORD_DEFAULT), PHP_EOL;"
-- Then replace <BCRYPT_HASH_HERE> below.
INSERT INTO users (full_name, email, password_hash, role, approval_status, approval_reviewed_at)
VALUES (
  'Admin Name',
  'admin@example.com',
  '<BCRYPT_HASH_HERE>',
  'admin',
  'approved',
  NOW()
);

-- Optional: promote an existing account instead of inserting a new one.
-- UPDATE users SET role = 'admin' WHERE email = 'existing-user@example.com';
