-- ============================================================
-- FrantzCoutard.com - new_school functionality additive migration
-- Apply after db/new_school.sql on existing databases.
-- ============================================================

USE frantz_portfolio;

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
  ADD COLUMN IF NOT EXISTS reviewed_by_user_id INT DEFAULT NULL AFTER reviewer_notes;

ALTER TABLE new_school_submissions
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP NULL DEFAULT NULL AFTER reviewed_by_user_id;

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
  source_type        ENUM('interview','project','referral') NOT NULL,
  source_id          INT NOT NULL,
  kind               ENUM('auto','bonus') NOT NULL,
  points             INT NOT NULL DEFAULT 0,
  awarded_by_user_id INT NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_points_source (recipient_role, recipient_id, source_type, source_id, kind),
  KEY idx_points_recipient (recipient_role, recipient_id)
) ENGINE=InnoDB;

-- Terms & Conditions acceptance audit log.
-- Mirrors terms_acceptances_ensure_schema() in api/lib.php (runtime lazy-create).
--   challenge_role    = role-specific challenge terms (student/parent/teacher/school)
--   general_platform  = shared "General Platform Terms" acknowledgment
--   website           = "Terms of Use & Privacy Notice" (any action form)
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
