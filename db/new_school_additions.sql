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
