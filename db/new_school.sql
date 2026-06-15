-- ============================================================
-- FrantzCoutard.com - new_school functionality migration
-- Run this after db/schema.sql on an existing database.
-- ============================================================

USE frantz_portfolio;

ALTER TABLE users
  MODIFY role ENUM(
    'member',
    'vip',
    'editor',
    'admin',
    'super_admin',
    'student',
    'parent',
    'school',
    'teacher'
  ) NOT NULL DEFAULT 'member';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS approval_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending' AFTER email_verified_at,
  ADD COLUMN IF NOT EXISTS approval_note TEXT DEFAULT NULL AFTER approval_status,
  ADD COLUMN IF NOT EXISTS approval_reviewed_by_user_id INT DEFAULT NULL AFTER approval_note,
  ADD COLUMN IF NOT EXISTS approval_reviewed_at TIMESTAMP NULL DEFAULT NULL AFTER approval_reviewed_by_user_id,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

UPDATE users
SET approval_status = 'approved',
    approval_reviewed_at = COALESCE(approval_reviewed_at, created_at)
WHERE approval_status IS NULL OR approval_status <> 'approved';

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
