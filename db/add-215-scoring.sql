-- ============================================================
-- FrantzCoutard.com — migration for the 215-point automatic model (Phase 2):
--   * interview signature (verified interviews)
--   * supporting materials uploads
--   * AI demonstration + community service (bonus) on submissions
-- Safe + idempotent. Run once on the LIVE database:
--   mysql -u <user> -p <database> < db/add-215-scoring.sql
-- (or paste into phpMyAdmin > SQL for the live database)
-- ============================================================

DROP PROCEDURE IF EXISTS fc_add_col2;
DELIMITER $$
CREATE PROCEDURE fc_add_col2(
  IN p_table VARCHAR(64), IN p_col VARCHAR(64), IN p_def TEXT, IN p_after VARCHAR(64)
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = p_table AND column_name = p_col
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_col, '` ', p_def,
      IF(p_after IS NULL OR p_after = '', '', CONCAT(' AFTER `', p_after, '`')));
    PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
  END IF;
END$$
DELIMITER ;

CALL fc_add_col2('new_school_business_interviews', 'signature', 'VARCHAR(255) DEFAULT NULL', 'student_notes');
CALL fc_add_col2('new_school_submissions', 'ai_note', 'TEXT DEFAULT NULL', 'written_url');
CALL fc_add_col2('new_school_submissions', 'ai_url', 'VARCHAR(255) DEFAULT NULL', 'ai_note');
CALL fc_add_col2('new_school_submissions', 'community_note', 'TEXT DEFAULT NULL', 'ai_url');
CALL fc_add_col2('new_school_submissions', 'community_url', 'VARCHAR(255) DEFAULT NULL', 'community_note');

DROP PROCEDURE IF EXISTS fc_add_col2;

CREATE TABLE IF NOT EXISTS new_school_supporting_materials (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  student_id    INT NOT NULL,
  material_type ENUM('business_card','photo','storefront_photo','website_screenshot','social_media_screenshot','flyer') NOT NULL,
  file_url      VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) DEFAULT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_material_type (student_id, material_type),
  CONSTRAINT fk_supporting_materials_student FOREIGN KEY (student_id) REFERENCES new_school_students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
