-- ============================================================
-- FrantzCoutard.com — Judge workflow features migration:
--   settings (anonymous judging, results publishing), judge assignments,
--   score audit trail, judge-reported concerns, judge certification.
-- Safe + idempotent. Run once on the LIVE database:
--   mysql -u <user> -p <database> < db/add-judge-workflow.sql
-- ============================================================

-- Key/value settings for the New School challenge (e.g. anonymous_judging, results_published).
CREATE TABLE IF NOT EXISTS new_school_settings (
  setting_key   VARCHAR(64) NOT NULL PRIMARY KEY,
  setting_value VARCHAR(255) DEFAULT NULL,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Which submissions a judge is assigned to review (+ recusal for conflicts of interest).
CREATE TABLE IF NOT EXISTS new_school_judge_assignments (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  judge_user_id INT NOT NULL,
  submission_id INT NOT NULL,
  status        ENUM('assigned','recused') NOT NULL DEFAULT 'assigned',
  recuse_reason VARCHAR(255) DEFAULT NULL,
  assigned_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_judge_assignment (judge_user_id, submission_id),
  KEY idx_assignment_judge (judge_user_id, status),
  KEY idx_assignment_submission (submission_id),
  CONSTRAINT fk_assignment_judge FOREIGN KEY (judge_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_assignment_submission FOREIGN KEY (submission_id) REFERENCES new_school_submissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Audit trail: every judge score create/update is logged for administrative review.
CREATE TABLE IF NOT EXISTS new_school_judge_score_audit (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  submission_id   INT NOT NULL,
  judge_user_id   INT NOT NULL,
  action          VARCHAR(20) NOT NULL DEFAULT 'update',
  old_total       INT DEFAULT NULL,
  new_total       INT DEFAULT NULL,
  detail          TEXT DEFAULT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_submission (submission_id, created_at),
  KEY idx_audit_judge (judge_user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Concerns reported by a judge (missing docs, suspected fraud, etc.) for admin follow-up.
CREATE TABLE IF NOT EXISTS new_school_reports (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  submission_id    INT DEFAULT NULL,
  reporter_user_id INT DEFAULT NULL,
  reason           VARCHAR(80) NOT NULL,
  notes            TEXT DEFAULT NULL,
  status           ENUM('open','reviewed','dismissed') NOT NULL DEFAULT 'open',
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_reports_status (status, created_at),
  KEY idx_reports_submission (submission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Judge handbook acknowledgment / certification timestamp.
DROP PROCEDURE IF EXISTS fc_add_col3;
DELIMITER $$
CREATE PROCEDURE fc_add_col3(IN p_table VARCHAR(64), IN p_col VARCHAR(64), IN p_def TEXT, IN p_after VARCHAR(64))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = p_table AND column_name = p_col) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_col, '` ', p_def,
      IF(p_after IS NULL OR p_after = '', '', CONCAT(' AFTER `', p_after, '`')));
    PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
  END IF;
END$$
DELIMITER ;
CALL fc_add_col3('new_school_judges', 'certified_at', 'DATETIME NULL', 'display_name');
DROP PROCEDURE IF EXISTS fc_add_col3;
