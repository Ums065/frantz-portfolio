-- ============================================================
-- FrantzCoutard.com — migration for:
--   1) Forgot password  (password_resets table)
--   2) New mail system   (HTML body + attachments on mail_outbox)
--
-- Safe + idempotent: re-running does nothing harmful.
-- Run on the LIVE database once:
--   mysql -u <user> -p <database> < db/add-forgot-password-and-html-mail.sql
-- (or paste into phpMyAdmin > SQL for the live database)
-- ============================================================

-- ---------- 1) Forgot password: single-use reset tokens ----------
CREATE TABLE IF NOT EXISTS password_resets (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  token_hash  CHAR(64) NOT NULL,
  expires_at  DATETIME NOT NULL,
  used_at     DATETIME NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_password_resets_token (token_hash),
  INDEX idx_password_resets_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 2) Mail queue: ensure it exists (fresh installs) ----------
CREATE TABLE IF NOT EXISTS mail_outbox (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  message_kind     VARCHAR(40) NOT NULL DEFAULT 'notification',
  recipient_email  VARCHAR(160) NOT NULL,
  subject          VARCHAR(255) NOT NULL,
  body_text        LONGTEXT NOT NULL,
  body_html        LONGTEXT DEFAULT NULL,
  attachments_json LONGTEXT DEFAULT NULL,
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

-- ---------- 2b) Add HTML + attachment columns to an existing mail_outbox ----------
DROP PROCEDURE IF EXISTS fc_add_col;
DELIMITER $$
CREATE PROCEDURE fc_add_col(
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

CALL fc_add_col('mail_outbox', 'body_html', 'LONGTEXT DEFAULT NULL', 'body_text');
CALL fc_add_col('mail_outbox', 'attachments_json', 'LONGTEXT DEFAULT NULL', 'body_html');

DROP PROCEDURE IF EXISTS fc_add_col;
