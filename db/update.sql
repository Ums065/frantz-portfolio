-- ============================================================
-- FrantzCoutard.com master update script
-- Safe to run on an existing database:
-- - creates missing tables
-- - adds missing columns
-- - expands enums needed by the app
-- Seed data is intentionally excluded.
-- ============================================================

CREATE DATABASE IF NOT EXISTS frantz_portfolio
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE frantz_portfolio;

-- ---------- Core app tables ----------
CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  full_name     VARCHAR(120) NOT NULL,
  email         VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('member','vip','editor','admin','super_admin','student','parent','school','teacher') NOT NULL DEFAULT 'member',
  email_verified_at TIMESTAMP NULL DEFAULT NULL,
  approval_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  approval_note TEXT DEFAULT NULL,
  approval_reviewed_by_user_id INT DEFAULT NULL,
  approval_reviewed_at TIMESTAMP NULL DEFAULT NULL,
  email_verification_otp_hash VARCHAR(255) DEFAULT NULL,
  email_verification_otp_expires_at TIMESTAMP NULL DEFAULT NULL,
  email_verification_otp_sent_at TIMESTAMP NULL DEFAULT NULL,
  email_verification_otp_attempts INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS subscribers (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  email      VARCHAR(160) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS requests (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  request_type VARCHAR(120) NOT NULL,
  full_name    VARCHAR(120) NOT NULL,
  email        VARCHAR(160) NOT NULL,
  organization VARCHAR(160) DEFAULT NULL,
  message      TEXT,
  status       ENUM('new','reviewed','approved','closed') NOT NULL DEFAULT 'new',
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS events (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  title       VARCHAR(180) NOT NULL,
  location    VARCHAR(180),
  role        VARCHAR(120),
  event_date  DATE NOT NULL,
  is_past     TINYINT(1) NOT NULL DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS awards (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  title       VARCHAR(200) NOT NULL,
  year        VARCHAR(10)  DEFAULT NULL,
  level       VARCHAR(40)  DEFAULT NULL,
  presenter   VARCHAR(200) DEFAULT NULL,
  short_text  TEXT,
  description TEXT,
  image       VARCHAR(255) DEFAULT NULL,
  is_featured TINYINT(1) NOT NULL DEFAULT 0,
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS posts (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  title       VARCHAR(220) NOT NULL,
  category    VARCHAR(80),
  excerpt     TEXT,
  body        LONGTEXT,
  cover_image VARCHAR(255) DEFAULT NULL,
  is_featured TINYINT(1) NOT NULL DEFAULT 0,
  published_at DATE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS media_items (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  title       VARCHAR(180) NOT NULL,
  type        ENUM('podcast','interview','tv','press_release','article','photo','video') NOT NULL DEFAULT 'article',
  summary     TEXT,
  body        LONGTEXT,
  image       VARCHAR(255) DEFAULT NULL,
  link_url    VARCHAR(255) DEFAULT NULL,
  published_at DATE DEFAULT NULL,
  is_featured TINYINT(1) NOT NULL DEFAULT 0,
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS testimonials (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  quote        TEXT NOT NULL,
  author_name  VARCHAR(120) NOT NULL,
  author_title VARCHAR(120) DEFAULT NULL,
  company      VARCHAR(160) DEFAULT NULL,
  image        VARCHAR(255) DEFAULT NULL,
  is_featured  TINYINT(1) NOT NULL DEFAULT 0,
  sort_order   INT DEFAULT 0,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS community_threads (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  title            VARCHAR(180) NOT NULL,
  body             TEXT NOT NULL,
  audience         ENUM('public','member','vip') NOT NULL DEFAULT 'public',
  author_user_id   INT DEFAULT NULL,
  author_name      VARCHAR(120) NOT NULL,
  is_pinned        TINYINT(1) NOT NULL DEFAULT 0,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_community_threads_audience (audience, created_at),
  CONSTRAINT fk_community_threads_user FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS community_comments (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  thread_id       INT NOT NULL,
  user_id         INT DEFAULT NULL,
  author_name     VARCHAR(120) NOT NULL,
  body            TEXT NOT NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_community_comments_thread (thread_id, created_at),
  CONSTRAINT fk_community_comments_thread FOREIGN KEY (thread_id) REFERENCES community_threads(id) ON DELETE CASCADE,
  CONSTRAINT fk_community_comments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS event_rsvps (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  event_id          INT NOT NULL,
  user_id           INT DEFAULT NULL,
  full_name         VARCHAR(120) NOT NULL,
  email             VARCHAR(160) NOT NULL,
  status            ENUM('going','maybe','interested','cancelled') NOT NULL DEFAULT 'going',
  notes             TEXT,
  confirmation_code VARCHAR(24) NOT NULL UNIQUE,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_event_rsvps_event (event_id, created_at),
  CONSTRAINT fk_event_rsvps_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_rsvps_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS store_inventory (
  product_id         VARCHAR(40) PRIMARY KEY,
  name               VARCHAR(160) DEFAULT NULL,
  category           VARCHAR(80) DEFAULT NULL,
  description        TEXT DEFAULT NULL,
  image              VARCHAR(255) DEFAULT NULL,
  price              DECIMAL(10,2) DEFAULT NULL,
  stock              INT NOT NULL DEFAULT 0,
  low_stock_threshold INT NOT NULL DEFAULT 5,
  restock_note       VARCHAR(180) DEFAULT NULL,
  visibility         ENUM('live','upcoming','hidden') NOT NULL DEFAULT 'live',
  sort_order         INT NOT NULL DEFAULT 0,
  updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS contact_messages (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  full_name  VARCHAR(120) NOT NULL,
  email      VARCHAR(160) NOT NULL,
  message    TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mail_outbox (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  message_kind     VARCHAR(40) NOT NULL DEFAULT 'notification',
  recipient_email  VARCHAR(160) NOT NULL,
  subject          VARCHAR(255) NOT NULL,
  body_text        LONGTEXT NOT NULL,
  status           ENUM('queued','sending','retry','sent','failed') NOT NULL DEFAULT 'queued',
  attempts         TINYINT UNSIGNED NOT NULL DEFAULT 0,
  last_error       TEXT DEFAULT NULL,
  next_attempt_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at          TIMESTAMP NULL DEFAULT NULL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_mail_outbox_status_next (status, next_attempt_at, created_at),
  INDEX idx_mail_outbox_kind_status (message_kind, status, created_at),
  INDEX idx_mail_outbox_recipient (recipient_email, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orders (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  order_no       VARCHAR(20) NOT NULL UNIQUE,
  user_id        INT NULL,
  customer_name  VARCHAR(120) NOT NULL,
  email          VARCHAR(160) NOT NULL,
  address        TEXT,
  items          JSON,
  subtotal       DECIMAL(10,2) NOT NULL DEFAULT 0,
  discount       DECIMAL(10,2) NOT NULL DEFAULT 0,
  shipping       DECIMAL(10,2) NOT NULL DEFAULT 0,
  tax            DECIMAL(10,2) NOT NULL DEFAULT 0,
  total          DECIMAL(10,2) NOT NULL DEFAULT 0,
  payment_method VARCHAR(30) NOT NULL DEFAULT 'card',
  status         ENUM('paid','pending','fulfilled','cancelled') NOT NULL DEFAULT 'paid',
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------- New school tables ----------
CREATE TABLE IF NOT EXISTS new_school_schools (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  user_id                 INT NOT NULL UNIQUE,
  school_name             VARCHAR(180) NOT NULL,
  school_address          VARCHAR(255) NOT NULL,
  school_district         VARCHAR(180) NOT NULL,
  main_phone              VARCHAR(40) NOT NULL,
  principal_name          VARCHAR(120) NOT NULL,
  administrator_name      VARCHAR(120) NOT NULL,
  administrator_email     VARCHAR(160) NOT NULL,
  administrator_phone     VARCHAR(40) NOT NULL,
  status                  ENUM('registered','approved','rejected') NOT NULL DEFAULT 'registered',
  created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_new_school_schools_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS new_school_teachers (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  user_id                 INT NOT NULL UNIQUE,
  school_id               INT NOT NULL,
  teacher_full_name       VARCHAR(120) NOT NULL,
  school_email            VARCHAR(160) NOT NULL,
  phone_number            VARCHAR(40) NOT NULL,
  role_department         VARCHAR(120) NOT NULL,
  grade_level_supported   VARCHAR(60) NOT NULL,
  status                  ENUM('registered','approved','rejected') NOT NULL DEFAULT 'registered',
  created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_new_school_teachers_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_new_school_teachers_school
    FOREIGN KEY (school_id) REFERENCES new_school_schools(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS new_school_students (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  user_id                 INT NOT NULL UNIQUE,
  school_id               INT DEFAULT NULL,
  teacher_id              INT DEFAULT NULL,
  participant_id          VARCHAR(40) NOT NULL UNIQUE,
  qr_token                VARCHAR(80) NOT NULL UNIQUE,
  qr_url                  VARCHAR(255) NOT NULL,
  full_name               VARCHAR(120) NOT NULL,
  student_username        VARCHAR(80) NOT NULL UNIQUE,
  age                     TINYINT UNSIGNED NOT NULL,
  date_of_birth           DATE NOT NULL,
  email                   VARCHAR(160) NOT NULL,
  phone_number            VARCHAR(40) NOT NULL,
  home_address            VARCHAR(255) NOT NULL,
  school_name             VARCHAR(180) NOT NULL,
  grade_level             VARCHAR(60) NOT NULL,
  parent_name             VARCHAR(120) NOT NULL,
  parent_phone            VARCHAR(40) NOT NULL,
  parent_email            VARCHAR(160) NOT NULL,
  parent_consent_status   ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  school_approval_status  ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  teacher_approval_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  submission_status       ENUM('locked','eligible','submitted','complete') NOT NULL DEFAULT 'locked',
  overall_status          ENUM(
    'student_registered',
    'parent_consent_pending',
    'parent_consent_approved',
    'school_approval_pending',
    'school_approval_approved',
    'teacher_approval_pending',
    'interviews_pending',
    'eligible_to_submit',
    'submission_submitted',
    'submission_complete',
    'rejected'
  ) NOT NULL DEFAULT 'student_registered',
  created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_new_school_students_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_new_school_students_school
    FOREIGN KEY (school_id) REFERENCES new_school_schools(id) ON DELETE SET NULL,
  CONSTRAINT fk_new_school_students_teacher
    FOREIGN KEY (teacher_id) REFERENCES new_school_teachers(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS new_school_parents (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  user_id                 INT NOT NULL UNIQUE,
  student_id              INT NOT NULL UNIQUE,
  parent_full_name        VARCHAR(120) NOT NULL,
  relationship_to_student VARCHAR(80) NOT NULL,
  phone_number            VARCHAR(40) NOT NULL,
  email                   VARCHAR(160) NOT NULL,
  home_address            VARCHAR(255) NOT NULL,
  government_id_url       VARCHAR(255) DEFAULT NULL,
  consent_checked         TINYINT(1) NOT NULL DEFAULT 0,
  digital_signature       VARCHAR(255) NOT NULL,
  approved_at             TIMESTAMP NULL DEFAULT NULL,
  consented_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_new_school_parents_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_new_school_parents_student
    FOREIGN KEY (student_id) REFERENCES new_school_students(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS new_school_approvals (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  student_id       INT NOT NULL,
  approval_type    ENUM('school','teacher') NOT NULL,
  reviewer_user_id  INT DEFAULT NULL,
  reviewer_name    VARCHAR(120) NOT NULL,
  reviewer_email   VARCHAR(160) NOT NULL,
  reviewer_role    VARCHAR(120) DEFAULT NULL,
  status           ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  notes            TEXT DEFAULT NULL,
  digital_signature VARCHAR(255) DEFAULT NULL,
  approved_at      TIMESTAMP NULL DEFAULT NULL,
  recorded_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_student_approval_type (student_id, approval_type),
  CONSTRAINT fk_new_school_approvals_student
    FOREIGN KEY (student_id) REFERENCES new_school_students(id) ON DELETE CASCADE,
  CONSTRAINT fk_new_school_approvals_user
    FOREIGN KEY (reviewer_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS new_school_business_interviews (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  student_id            INT NOT NULL,
  visit_number          TINYINT UNSIGNED NOT NULL,
  business_name         VARCHAR(180) NOT NULL,
  owner_name            VARCHAR(120) NOT NULL,
  business_phone        VARCHAR(40) NOT NULL,
  business_address      VARCHAR(255) NOT NULL,
  business_category     VARCHAR(120) NOT NULL,
  date_of_visit         DATE NOT NULL,
  has_website           TINYINT(1) NOT NULL DEFAULT 0,
  has_google_profile    TINYINT(1) NOT NULL DEFAULT 0,
  uses_social_media     TINYINT(1) NOT NULL DEFAULT 0,
  uses_digital_signage  TINYINT(1) NOT NULL DEFAULT 0,
  offers_rewards        TINYINT(1) NOT NULL DEFAULT 0,
  has_online_ordering   TINYINT(1) NOT NULL DEFAULT 0,
  has_delivery_options  TINYINT(1) NOT NULL DEFAULT 0,
  main_challenge        TEXT NOT NULL,
  student_notes         TEXT NOT NULL,
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_student_visit (student_id, visit_number),
  CONSTRAINT fk_new_school_business_student
    FOREIGN KEY (student_id) REFERENCES new_school_students(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS new_school_submissions (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  student_id              INT NOT NULL UNIQUE,
  source_business_id      INT DEFAULT NULL,
  problem_identified      TEXT NOT NULL,
  why_it_matters         TEXT NOT NULL,
  proposed_solution      TEXT NOT NULL,
  how_it_helps           TEXT NOT NULL,
  expected_impact        TEXT NOT NULL,
  video_url              VARCHAR(255) DEFAULT NULL,
  written_url            VARCHAR(255) DEFAULT NULL,
  submission_date        TIMESTAMP NULL DEFAULT NULL,
  status                 ENUM('draft','submitted','approved','rejected','winner') NOT NULL DEFAULT 'draft',
  reviewer_notes         TEXT DEFAULT NULL,
  reviewed_by_user_id    INT DEFAULT NULL,
  reviewed_at            TIMESTAMP NULL DEFAULT NULL,
  score                  DECIMAL(6,2) DEFAULT NULL,
  rank_position          TINYINT UNSIGNED DEFAULT NULL,
  created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_new_school_submission_student
    FOREIGN KEY (student_id) REFERENCES new_school_students(id) ON DELETE CASCADE,
  CONSTRAINT fk_new_school_submission_business
    FOREIGN KEY (source_business_id) REFERENCES new_school_business_interviews(id) ON DELETE SET NULL,
  CONSTRAINT fk_new_school_submission_reviewer
    FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS new_school_winners (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  student_id       INT NOT NULL,
  submission_id    INT NOT NULL UNIQUE,
  place            ENUM('first','second','third') NOT NULL,
  scholarship_amount DECIMAL(10,2) NOT NULL,
  announced_at     TIMESTAMP NULL DEFAULT NULL,
  published_at     TIMESTAMP NULL DEFAULT NULL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_new_school_winners_student
    FOREIGN KEY (student_id) REFERENCES new_school_students(id) ON DELETE CASCADE,
  CONSTRAINT fk_new_school_winners_submission
    FOREIGN KEY (submission_id) REFERENCES new_school_submissions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS new_school_notifications (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  student_id          INT DEFAULT NULL,
  recipient_role      ENUM('student','parent','school','teacher','admin','all') NOT NULL DEFAULT 'student',
  notification_type   VARCHAR(80) NOT NULL,
  title               VARCHAR(180) NOT NULL,
  message             TEXT NOT NULL,
  payload_json        LONGTEXT DEFAULT NULL,
  is_read             TINYINT(1) NOT NULL DEFAULT 0,
  read_at             TIMESTAMP NULL DEFAULT NULL,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_new_school_notifications_student (student_id),
  KEY idx_new_school_notifications_role (recipient_role),
  KEY idx_new_school_notifications_created (created_at),
  CONSTRAINT fk_new_school_notifications_student
    FOREIGN KEY (student_id) REFERENCES new_school_students(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------- Idempotent upgrades for existing databases ----------
ALTER TABLE users
  MODIFY role ENUM('member','vip','editor','admin','super_admin','student','parent','school','teacher') NOT NULL DEFAULT 'member';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP NULL DEFAULT NULL AFTER role,
  ADD COLUMN IF NOT EXISTS approval_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending' AFTER email_verified_at,
  ADD COLUMN IF NOT EXISTS approval_note TEXT DEFAULT NULL AFTER approval_status,
  ADD COLUMN IF NOT EXISTS approval_reviewed_by_user_id INT DEFAULT NULL AFTER approval_note,
  ADD COLUMN IF NOT EXISTS approval_reviewed_at TIMESTAMP NULL DEFAULT NULL AFTER approval_reviewed_by_user_id,
  ADD COLUMN IF NOT EXISTS email_verification_otp_hash VARCHAR(255) DEFAULT NULL AFTER approval_reviewed_at,
  ADD COLUMN IF NOT EXISTS email_verification_otp_expires_at TIMESTAMP NULL DEFAULT NULL AFTER email_verification_otp_hash,
  ADD COLUMN IF NOT EXISTS email_verification_otp_sent_at TIMESTAMP NULL DEFAULT NULL AFTER email_verification_otp_expires_at,
  ADD COLUMN IF NOT EXISTS email_verification_otp_attempts INT NOT NULL DEFAULT 0 AFTER email_verification_otp_sent_at,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER email_verification_otp_attempts,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

ALTER TABLE store_inventory
  ADD COLUMN IF NOT EXISTS name VARCHAR(160) DEFAULT NULL AFTER product_id,
  ADD COLUMN IF NOT EXISTS category VARCHAR(80) DEFAULT NULL AFTER name,
  ADD COLUMN IF NOT EXISTS description TEXT DEFAULT NULL AFTER category,
  ADD COLUMN IF NOT EXISTS image VARCHAR(255) DEFAULT NULL AFTER description,
  ADD COLUMN IF NOT EXISTS price DECIMAL(10,2) DEFAULT NULL AFTER image,
  ADD COLUMN IF NOT EXISTS visibility ENUM('live','upcoming','hidden') NOT NULL DEFAULT 'live' AFTER restock_note,
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0 AFTER visibility;

INSERT IGNORE INTO store_inventory (
  product_id, name, category, description, image, price, stock, low_stock_threshold, restock_note, visibility, sort_order
) VALUES
  ('hoodie-legacy', 'Founder Hoodie - Legacy Black', 'Hoodies', 'Heavyweight fleece hoodie with the embroidered FC emblem.', '/assets/merch-hoodie.webp', 68.00, 24, 5, 'Core collection stock', 'live', 1),
  ('tee-emblem', 'Premium Tee - FC Emblem', 'T-Shirts', 'Soft cotton tee with the FC emblem and an everyday fit.', '/assets/merch-tee.webp', 34.00, 48, 8, 'Core collection stock', 'live', 2),
  ('cap-gold', 'Signature Cap - Gold FC', 'Caps', 'Structured cap with gold FC monogram and adjustable fit.', '/assets/merch-cap.webp', 28.00, 40, 6, 'Core collection stock', 'live', 3),
  ('book-nts', 'From Nothing to Something - Hardcover', 'Books', 'Hardcover guide to the From Nothing to Something story.', '/assets/brand-signature-white.webp', 24.00, 64, 10, 'Core collection stock', 'live', 4),
  ('pin-ltd', 'Limited Edition FC Lapel Pin', 'Collectibles', 'Gold enamel FC pin for collectors and launch supporters.', '/assets/merch-collectible.webp', 18.00, 70, 10, 'Core collection stock', 'live', 5),
  ('hoodie-c2l', 'From Community to Legacy Hoodie', 'Hoodies', 'Premium brushed hoodie reserved for a future drop.', '/assets/merch-hoodie.webp', 72.00, 18, 4, 'Upcoming drop', 'upcoming', 6),
  ('tee-tech', 'Technology For Good Tee', 'T-Shirts', 'A future tee drop centered on the tech-for-good mission.', '/assets/merch-tee.webp', 32.00, 44, 8, 'Upcoming drop', 'upcoming', 7),
  ('tee-vision', 'Visionary Tee', 'T-Shirts', 'Statement tee reserved for a later release window.', '/assets/merch-tee.webp', 30.00, 36, 6, 'Upcoming drop', 'upcoming', 8),
  ('cap-builder', 'Community Builder Cap', 'Caps', 'Structured cap saved for a future community release.', '/assets/merch-cap.webp', 26.00, 32, 5, 'Upcoming drop', 'upcoming', 9),
  ('book-blueprint', 'The Legacy Blueprint - eBook', 'Books', 'Digital companion guide for a future resource release.', '/assets/brand-signature-white.webp', 14.00, 96, 12, 'Upcoming drop', 'upcoming', 10),
  ('print-signed', 'Signed Founder''s Print', 'Art Prints', 'Signed founder print reserved for a premium future drop.', '/assets/brand-signature-white.webp', 48.00, 16, 4, 'Upcoming drop', 'upcoming', 11);

ALTER TABLE new_school_students
  ADD COLUMN IF NOT EXISTS parent_consent_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending' AFTER grade_level,
  ADD COLUMN IF NOT EXISTS school_approval_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending' AFTER parent_consent_status,
  ADD COLUMN IF NOT EXISTS teacher_approval_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending' AFTER school_approval_status,
  ADD COLUMN IF NOT EXISTS submission_status ENUM('locked','eligible','submitted','complete') NOT NULL DEFAULT 'locked' AFTER teacher_approval_status,
  ADD COLUMN IF NOT EXISTS overall_status ENUM(
    'student_registered',
    'parent_consent_pending',
    'parent_consent_approved',
    'school_approval_pending',
    'school_approval_approved',
    'teacher_approval_pending',
    'interviews_pending',
    'eligible_to_submit',
    'submission_submitted',
    'submission_complete',
    'rejected'
  ) NOT NULL DEFAULT 'student_registered' AFTER submission_status,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER overall_status,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

UPDATE new_school_students
SET overall_status = 'interviews_pending'
WHERE overall_status = 'teacher_approval_approved';

ALTER TABLE new_school_students
  MODIFY overall_status ENUM(
    'student_registered',
    'parent_consent_pending',
    'parent_consent_approved',
    'school_approval_pending',
    'school_approval_approved',
    'teacher_approval_pending',
    'interviews_pending',
    'eligible_to_submit',
    'submission_submitted',
    'submission_complete',
    'rejected'
  ) NOT NULL DEFAULT 'student_registered';

ALTER TABLE new_school_parents
  ADD COLUMN IF NOT EXISTS consented_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER approved_at;

ALTER TABLE new_school_approvals
  ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER approved_at;

ALTER TABLE new_school_submissions
  ADD COLUMN IF NOT EXISTS reviewed_by_user_id INT DEFAULT NULL AFTER reviewer_notes,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP NULL DEFAULT NULL AFTER reviewed_by_user_id;
