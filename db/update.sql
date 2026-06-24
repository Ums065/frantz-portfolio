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

CREATE TABLE IF NOT EXISTS store_inventory_state (
  state_key    VARCHAR(64) PRIMARY KEY,
  state_value  VARCHAR(255) DEFAULT NULL,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
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

CREATE TABLE IF NOT EXISTS sponsor_programs (
  id                           INT AUTO_INCREMENT PRIMARY KEY,
  slug                         VARCHAR(160) NOT NULL UNIQUE,
  name                         VARCHAR(220) NOT NULL,
  edition_name                 VARCHAR(220) DEFAULT NULL,
  headline                     VARCHAR(220) NOT NULL,
  subheadline                  TEXT NOT NULL,
  registration_opens           DATE DEFAULT NULL,
  winners_announced            DATE DEFAULT NULL,
  school_impact_grant_amount   DECIMAL(12,2) NOT NULL DEFAULT 25000.00,
  student_scholarship_amount   DECIMAL(12,2) NOT NULL DEFAULT 10000.00,
  educator_award_label         VARCHAR(220) NOT NULL,
  age_range                    VARCHAR(40) NOT NULL DEFAULT '11-19',
  grade_range                  VARCHAR(40) NOT NULL DEFAULT '6-12',
  is_active                    TINYINT(1) NOT NULL DEFAULT 0,
  created_at                   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at                   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sponsor_programs_active (is_active, registration_opens, winners_announced)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sponsorship_levels (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  program_id       INT NOT NULL,
  slug             VARCHAR(80) NOT NULL,
  name             VARCHAR(120) NOT NULL,
  minimum_amount   DECIMAL(12,2) NOT NULL DEFAULT 0,
  sort_order       INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_sponsorship_level (program_id, slug),
  CONSTRAINT fk_sponsorship_levels_program
    FOREIGN KEY (program_id) REFERENCES sponsor_programs(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sponsor_applications (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  program_id           INT NOT NULL,
  organization_name    VARCHAR(180) NOT NULL,
  contact_person       VARCHAR(160) NOT NULL,
  title_position       VARCHAR(160) DEFAULT NULL,
  email_address        VARCHAR(160) NOT NULL,
  phone_number         VARCHAR(60) NOT NULL,
  website              VARCHAR(255) DEFAULT NULL,
  street_address       VARCHAR(255) NOT NULL,
  city                 VARCHAR(120) NOT NULL,
  state                VARCHAR(120) NOT NULL,
  zip_code             VARCHAR(30) NOT NULL,
  organization_type    VARCHAR(120) NOT NULL,
  logo_url             VARCHAR(255) DEFAULT NULL,
  company_bio          TEXT NOT NULL,
  support_reason       TEXT NOT NULL,
  sponsorship_level_slug  VARCHAR(80) NOT NULL,
  sponsorship_level_name  VARCHAR(120) NOT NULL,
  sponsorship_amount   DECIMAL(12,2) NOT NULL DEFAULT 0,
  custom_amount        TINYINT(1) NOT NULL DEFAULT 0,
  interests_json       LONGTEXT DEFAULT NULL,
  public_description   TEXT DEFAULT NULL,
  admin_notes          TEXT DEFAULT NULL,
  payment_status       ENUM('pending_check','check_received','payment_confirmed') NOT NULL DEFAULT 'pending_check',
  approval_status      ENUM('pending_review','approved','rejected','published') NOT NULL DEFAULT 'pending_review',
  reviewed_by_user_id  INT DEFAULT NULL,
  reviewed_at          TIMESTAMP NULL DEFAULT NULL,
  approved_at          TIMESTAMP NULL DEFAULT NULL,
  rejected_at          TIMESTAMP NULL DEFAULT NULL,
  check_received_at    TIMESTAMP NULL DEFAULT NULL,
  payment_confirmed_at TIMESTAMP NULL DEFAULT NULL,
  published_at         TIMESTAMP NULL DEFAULT NULL,
  created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sponsor_applications_program (program_id, created_at),
  INDEX idx_sponsor_applications_status (approval_status, payment_status, created_at),
  INDEX idx_sponsor_applications_level (sponsorship_level_slug, sponsorship_amount),
  CONSTRAINT fk_sponsor_applications_program
    FOREIGN KEY (program_id) REFERENCES sponsor_programs(id) ON DELETE CASCADE,
  CONSTRAINT fk_sponsor_applications_reviewer
    FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

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
  payment_provider VARCHAR(40) DEFAULT NULL,
  payment_status ENUM('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending',
  payment_session_id VARCHAR(120) DEFAULT NULL,
  payment_intent_id VARCHAR(120) DEFAULT NULL,
  payment_confirmed_at TIMESTAMP NULL DEFAULT NULL,
  payment_url TEXT DEFAULT NULL,
  payment_error TEXT DEFAULT NULL,
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

-- ---------- New school: ranking snapshots, points ledger, terms audit ----------

-- School ranking daily snapshots (powers the by-students-joined leaderboard + day-over-day movement arrows)
CREATE TABLE IF NOT EXISTS new_school_school_rank_snapshots (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  school_id     INT NOT NULL,
  rank_position INT NOT NULL,
  student_count INT NOT NULL,
  snapshot_date DATE NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_school_snapshot_date (school_id, snapshot_date),
  KEY idx_snapshot_date (snapshot_date),
  CONSTRAINT fk_school_rank_snapshot_school FOREIGN KEY (school_id) REFERENCES new_school_schools(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Points ledger: drives student + teacher rankings.
--   auto  = +5 student / +2 teacher per interview & project submission
--   bonus = admin-assigned on approval (student up to 15, teacher up to 8, default 3)
-- One row per (recipient, source, kind) so re-approving REPLACES the bonus instead of stacking.
CREATE TABLE IF NOT EXISTS new_school_points (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  recipient_role     ENUM('student','teacher') NOT NULL,
  recipient_id       INT NOT NULL,
  source_type        ENUM('interview','project') NOT NULL,
  source_id          INT NOT NULL,
  kind               ENUM('auto','bonus') NOT NULL,
  points             INT NOT NULL DEFAULT 0,
  awarded_by_user_id INT NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_points_source (recipient_role, recipient_id, source_type, source_id, kind),
  KEY idx_points_recipient (recipient_role, recipient_id)
) ENGINE=InnoDB;

-- Admin <-> user chat (one thread per non-admin user; one-sided "clear chat").
CREATE TABLE IF NOT EXISTS new_school_chat_messages (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  thread_user_id  INT NOT NULL,
  sender          ENUM('user','admin') NOT NULL,
  sender_user_id  INT NULL,
  body            TEXT NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ns_chat_thread (thread_user_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS new_school_chat_clears (
  thread_user_id  INT NOT NULL,
  side            ENUM('user','admin') NOT NULL,
  cleared_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (thread_user_id, side)
) ENGINE=InnoDB;

-- Terms & Conditions acceptance audit log (registration role terms + general platform + website).
CREATE TABLE IF NOT EXISTS terms_acceptances (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id         INT DEFAULT NULL,
  user_name       VARCHAR(180) NOT NULL,
  email           VARCHAR(160) NOT NULL,
  role            VARCHAR(40) DEFAULT NULL,
  accept_type     ENUM('challenge_role','general_platform','website') NOT NULL,
  terms_version   VARCHAR(120) NOT NULL,
  signature_name  VARCHAR(180) DEFAULT NULL,
  document_label  VARCHAR(200) DEFAULT NULL,
  ip_address      VARCHAR(45) DEFAULT NULL,
  user_agent      VARCHAR(500) DEFAULT NULL,
  accepted_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_terms_user (user_id, accepted_at),
  KEY idx_terms_email (email, accepted_at),
  KEY idx_terms_type_version (accept_type, terms_version, accepted_at),
  CONSTRAINT fk_terms_acceptances_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------- Idempotent upgrades for existing databases ----------
DROP PROCEDURE IF EXISTS add_column_if_missing;
DELIMITER $$

CREATE PROCEDURE add_column_if_missing(
  IN p_table_name VARCHAR(64),
  IN p_column_name VARCHAR(64),
  IN p_column_definition TEXT,
  IN p_after_column VARCHAR(64)
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = p_table_name
      AND column_name = p_column_name
  ) THEN
    SET @add_column_sql = CONCAT(
      'ALTER TABLE `', p_table_name, '` ADD COLUMN `', p_column_name, '` ',
      p_column_definition,
      IF(
        p_after_column IS NULL OR p_after_column = '',
        '',
        CONCAT(' AFTER `', p_after_column, '`')
      )
    );
    PREPARE stmt FROM @add_column_sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$

DELIMITER ;

ALTER TABLE users
  MODIFY role ENUM('member','vip','editor','admin','super_admin','student','parent','school','teacher') NOT NULL DEFAULT 'member';

CALL add_column_if_missing('users', 'email_verified_at', 'TIMESTAMP NULL DEFAULT NULL', 'role');
CALL add_column_if_missing('users', 'approval_status', 'ENUM(''pending'',''approved'',''rejected'') NOT NULL DEFAULT ''pending''', 'email_verified_at');
CALL add_column_if_missing('users', 'approval_note', 'TEXT DEFAULT NULL', 'approval_status');
CALL add_column_if_missing('users', 'approval_reviewed_by_user_id', 'INT DEFAULT NULL', 'approval_note');
CALL add_column_if_missing('users', 'approval_reviewed_at', 'TIMESTAMP NULL DEFAULT NULL', 'approval_reviewed_by_user_id');
CALL add_column_if_missing('users', 'email_verification_otp_hash', 'VARCHAR(255) DEFAULT NULL', 'approval_reviewed_at');
CALL add_column_if_missing('users', 'email_verification_otp_expires_at', 'TIMESTAMP NULL DEFAULT NULL', 'email_verification_otp_hash');
CALL add_column_if_missing('users', 'email_verification_otp_sent_at', 'TIMESTAMP NULL DEFAULT NULL', 'email_verification_otp_expires_at');
CALL add_column_if_missing('users', 'email_verification_otp_attempts', 'INT NOT NULL DEFAULT 0', 'email_verification_otp_sent_at');
CALL add_column_if_missing('users', 'created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP', 'email_verification_otp_attempts');
CALL add_column_if_missing('users', 'updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'created_at');

UPDATE users
SET approval_status = 'approved',
    approval_reviewed_at = COALESCE(approval_reviewed_at, created_at)
WHERE approval_status IS NULL OR approval_status <> 'approved';

CALL add_column_if_missing('store_inventory', 'name', 'VARCHAR(160) DEFAULT NULL', 'product_id');
CALL add_column_if_missing('store_inventory', 'category', 'VARCHAR(80) DEFAULT NULL', 'name');
CALL add_column_if_missing('store_inventory', 'tagline', 'VARCHAR(180) DEFAULT NULL', 'category');
CALL add_column_if_missing('store_inventory', 'description', 'TEXT DEFAULT NULL', 'tagline');
CALL add_column_if_missing('store_inventory', 'details', 'TEXT DEFAULT NULL', 'description');
CALL add_column_if_missing('store_inventory', 'feature_list', 'TEXT DEFAULT NULL', 'details');
CALL add_column_if_missing('store_inventory', 'spec_list', 'TEXT DEFAULT NULL', 'feature_list');
CALL add_column_if_missing('store_inventory', 'shipping_note', 'VARCHAR(180) DEFAULT NULL', 'spec_list');
CALL add_column_if_missing('store_inventory', 'image', 'VARCHAR(255) DEFAULT NULL', 'shipping_note');
CALL add_column_if_missing('store_inventory', 'price', 'DECIMAL(10,2) DEFAULT NULL', 'image');
CALL add_column_if_missing('store_inventory', 'visibility', 'ENUM(''live'',''upcoming'',''hidden'') NOT NULL DEFAULT ''live''', 'restock_note');
CALL add_column_if_missing('store_inventory', 'sort_order', 'INT NOT NULL DEFAULT 0', 'visibility');

INSERT IGNORE INTO store_inventory (
  product_id, name, category, tagline, description, details, feature_list, spec_list, shipping_note, image, price, stock, low_stock_threshold, restock_note, visibility, sort_order
) VALUES
  ('hoodie-legacy', 'Founder Hoodie - Legacy Black', 'Hoodies', NULL, 'Heavyweight fleece hoodie with the embroidered FC emblem.', NULL, NULL, NULL, NULL, '/assets/merch-hoodie.webp', 68.00, 24, 5, 'Core collection stock', 'live', 1),
  ('tee-emblem', 'Premium Tee - FC Emblem', 'T-Shirts', NULL, 'Soft cotton tee with the FC emblem and an everyday fit.', NULL, NULL, NULL, NULL, '/assets/merch-tee.webp', 34.00, 48, 8, 'Core collection stock', 'live', 2),
  ('cap-gold', 'Signature Cap - Gold FC', 'Caps', NULL, 'Structured cap with gold FC monogram and adjustable fit.', NULL, NULL, NULL, NULL, '/assets/merch-cap.webp', 28.00, 40, 6, 'Core collection stock', 'live', 3),
  ('book-nts', 'From Nothing to Something - Hardcover', 'Books', NULL, 'Hardcover guide to the From Nothing to Something story.', NULL, NULL, NULL, NULL, '/assets/brand-signature-white.webp', 24.00, 64, 10, 'Core collection stock', 'live', 4),
  ('pin-ltd', 'Limited Edition FC Lapel Pin', 'Collectibles', NULL, 'Gold enamel FC pin for collectors and launch supporters.', NULL, NULL, NULL, NULL, '/assets/merch-collectible.webp', 18.00, 70, 10, 'Core collection stock', 'live', 5),
  ('hoodie-c2l', 'From Community to Legacy Hoodie', 'Hoodies', NULL, 'Premium brushed hoodie reserved for a future drop.', NULL, NULL, NULL, NULL, '/assets/merch-hoodie.webp', 72.00, 18, 4, 'Upcoming drop', 'upcoming', 6),
  ('tee-tech', 'Technology For Good Tee', 'T-Shirts', NULL, 'A future tee drop centered on the tech-for-good mission.', NULL, NULL, NULL, NULL, '/assets/merch-tee.webp', 32.00, 44, 8, 'Upcoming drop', 'upcoming', 7),
  ('tee-vision', 'Visionary Tee', 'T-Shirts', NULL, 'Statement tee reserved for a later release window.', NULL, NULL, NULL, NULL, '/assets/merch-tee.webp', 30.00, 36, 6, 'Upcoming drop', 'upcoming', 8),
  ('cap-builder', 'Community Builder Cap', 'Caps', NULL, 'Structured cap saved for a future community release.', NULL, NULL, NULL, NULL, '/assets/merch-cap.webp', 26.00, 32, 5, 'Upcoming drop', 'upcoming', 9),
  ('book-blueprint', 'The Legacy Blueprint - eBook', 'Books', NULL, 'Digital companion guide for a future resource release.', NULL, NULL, NULL, NULL, '/assets/brand-signature-white.webp', 14.00, 96, 12, 'Upcoming drop', 'upcoming', 10),
  ('print-signed', 'Signed Founder''s Print', 'Art Prints', NULL, 'Signed founder print reserved for a premium future drop.', NULL, NULL, NULL, NULL, '/assets/brand-signature-white.webp', 48.00, 16, 4, 'Upcoming drop', 'upcoming', 11);

CALL add_column_if_missing('new_school_schools', 'status', 'ENUM(''registered'',''approved'',''rejected'') DEFAULT NULL', 'administrator_phone');

UPDATE new_school_schools
SET status = 'approved'
WHERE status IS NULL OR status = '';

ALTER TABLE new_school_schools
  MODIFY status ENUM('registered','approved','rejected') NOT NULL DEFAULT 'registered';

CALL add_column_if_missing('new_school_teachers', 'status', 'ENUM(''registered'',''approved'',''rejected'') DEFAULT NULL', 'grade_level_supported');

UPDATE new_school_teachers
SET status = 'approved'
WHERE status IS NULL OR status = '';

ALTER TABLE new_school_teachers
  MODIFY status ENUM('registered','approved','rejected') NOT NULL DEFAULT 'registered';

CALL add_column_if_missing('new_school_students', 'parent_consent_status', 'ENUM(''pending'',''approved'',''rejected'') NOT NULL DEFAULT ''pending''', 'grade_level');
CALL add_column_if_missing('new_school_students', 'school_approval_status', 'ENUM(''pending'',''approved'',''rejected'') NOT NULL DEFAULT ''pending''', 'parent_consent_status');
CALL add_column_if_missing('new_school_students', 'teacher_approval_status', 'ENUM(''pending'',''approved'',''rejected'') NOT NULL DEFAULT ''pending''', 'school_approval_status');
CALL add_column_if_missing('new_school_students', 'submission_status', 'ENUM(''locked'',''eligible'',''submitted'',''complete'') NOT NULL DEFAULT ''locked''', 'teacher_approval_status');
CALL add_column_if_missing('new_school_students', 'overall_status', 'ENUM(''student_registered'',''parent_consent_pending'',''parent_consent_approved'',''school_approval_pending'',''school_approval_approved'',''teacher_approval_pending'',''interviews_pending'',''eligible_to_submit'',''submission_submitted'',''submission_complete'',''rejected'') NOT NULL DEFAULT ''student_registered''', 'submission_status');
CALL add_column_if_missing('new_school_students', 'created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP', 'overall_status');
CALL add_column_if_missing('new_school_students', 'updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'created_at');
CALL add_column_if_missing('new_school_students', 'teacher_id', 'INT DEFAULT NULL', 'school_id');
CALL add_column_if_missing('new_school_students', 'participant_id', 'VARCHAR(40) DEFAULT NULL', 'teacher_id');
CALL add_column_if_missing('new_school_students', 'qr_token', 'VARCHAR(80) DEFAULT NULL', 'participant_id');
CALL add_column_if_missing('new_school_students', 'qr_url', 'VARCHAR(255) DEFAULT NULL', 'qr_token');

UPDATE new_school_students
SET participant_id = LPAD(id, 8, '0')
WHERE participant_id IS NULL OR participant_id = '';

UPDATE new_school_students
SET qr_token = CONCAT('legacy-', participant_id)
WHERE qr_token IS NULL OR qr_token = '';

UPDATE new_school_students
SET qr_url = CONCAT('/new-school/parent/', qr_token)
WHERE qr_url IS NULL OR qr_url = '';

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

CALL add_column_if_missing('new_school_parents', 'government_id_url', 'VARCHAR(255) DEFAULT NULL', 'home_address');
CALL add_column_if_missing('new_school_parents', 'consent_checked', 'TINYINT(1) NOT NULL DEFAULT 0', 'government_id_url');
CALL add_column_if_missing('new_school_parents', 'digital_signature', 'VARCHAR(255) DEFAULT NULL', 'consent_checked');
CALL add_column_if_missing('new_school_parents', 'approved_at', 'TIMESTAMP NULL DEFAULT NULL', 'digital_signature');
CALL add_column_if_missing('new_school_parents', 'consented_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP', 'approved_at');
-- Parent approval chain: parent registers -> student confirms -> teacher approves.
CALL add_column_if_missing('new_school_parents', 'link_status', "ENUM('pending_student','pending_teacher','approved','rejected') NOT NULL DEFAULT 'pending_student'", 'consent_checked');
CALL add_column_if_missing('new_school_parents', 'student_confirmed_at', 'TIMESTAMP NULL DEFAULT NULL', 'link_status');
UPDATE new_school_parents SET link_status = 'approved' WHERE approved_at IS NOT NULL AND link_status = 'pending_student';

CALL add_column_if_missing('new_school_approvals', 'reviewer_role', 'VARCHAR(120) DEFAULT NULL', 'reviewer_email');
CALL add_column_if_missing('new_school_approvals', 'notes', 'TEXT DEFAULT NULL', 'status');
CALL add_column_if_missing('new_school_approvals', 'digital_signature', 'VARCHAR(255) DEFAULT NULL', 'notes');
CALL add_column_if_missing('new_school_approvals', 'approved_at', 'TIMESTAMP NULL DEFAULT NULL', 'digital_signature');
CALL add_column_if_missing('new_school_approvals', 'recorded_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP', 'approved_at');

CALL add_column_if_missing('new_school_submissions', 'source_business_id', 'INT DEFAULT NULL', 'student_id');
CALL add_column_if_missing('new_school_submissions', 'submission_date', 'TIMESTAMP NULL DEFAULT NULL', 'written_url');
CALL add_column_if_missing('new_school_submissions', 'reviewer_notes', 'TEXT DEFAULT NULL', 'status');
CALL add_column_if_missing('new_school_submissions', 'reviewed_by_user_id', 'INT DEFAULT NULL', 'reviewer_notes');
CALL add_column_if_missing('new_school_submissions', 'reviewed_at', 'TIMESTAMP NULL DEFAULT NULL', 'reviewed_by_user_id');
CALL add_column_if_missing('new_school_submissions', 'score', 'DECIMAL(6,2) DEFAULT NULL', 'reviewed_at');
CALL add_column_if_missing('new_school_submissions', 'rank_position', 'TINYINT UNSIGNED DEFAULT NULL', 'score');

-- Scholarship intake questionnaire (one JSON row of {key,question,answer} per student).
CREATE TABLE IF NOT EXISTS new_school_scholarship_answers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  answers LONGTEXT NOT NULL,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_ns_scholarship_student (student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP PROCEDURE IF EXISTS add_column_if_missing;
