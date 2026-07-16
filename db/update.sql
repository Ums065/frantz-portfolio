-- ============================================================
-- FrantzCoutard.com — master update script (COMPLETE schema)
--
-- Safe to run any number of times on a fresh OR existing database:
--   * missing tables are created (CREATE TABLE IF NOT EXISTS)
--   * existing tables are left in place
--   * any column present in this structure but missing from an
--     existing table is added (add_column_if_missing)
--   * role/status ENUMs are widened to the current value set
--
-- This file is GENERATED from the live schema. Seed/content data is
-- intentionally excluded — it only defines the data STRUCTURE.
-- ============================================================

CREATE DATABASE IF NOT EXISTS frantz_portfolio
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE frantz_portfolio;

-- FK checks off so tables can be created in any order regardless of
-- their foreign-key references (restored at the end).
SET FOREIGN_KEY_CHECKS = 0;

-- ---------- idempotent "add column only if missing" helper ----------
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
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = p_table_name
      AND column_name = p_column_name
  ) THEN
    SET @ddl = CONCAT(
      'ALTER TABLE `', p_table_name, '` ADD COLUMN `', p_column_name, '` ',
      p_column_definition,
      IF(p_after_column IS NULL OR p_after_column = '', '', CONCAT(' AFTER `', p_after_column, '`'))
    );
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

-- ---------- awards ----------
CREATE TABLE IF NOT EXISTS `awards` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(200) NOT NULL,
  `year` varchar(10) DEFAULT NULL,
  `level` varchar(40) DEFAULT NULL,
  `presenter` varchar(200) DEFAULT NULL,
  `short_text` text,
  `description` text,
  `image` varchar(255) DEFAULT NULL,
  `is_featured` tinyint(1) NOT NULL DEFAULT '0',
  `sort_order` int DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
CALL add_column_if_missing('awards', 'title', 'varchar(200) NOT NULL', 'id');
CALL add_column_if_missing('awards', 'year', 'varchar(10) DEFAULT NULL', 'title');
CALL add_column_if_missing('awards', 'level', 'varchar(40) DEFAULT NULL', 'year');
CALL add_column_if_missing('awards', 'presenter', 'varchar(200) DEFAULT NULL', 'level');
CALL add_column_if_missing('awards', 'short_text', 'text', 'presenter');
CALL add_column_if_missing('awards', 'description', 'text', 'short_text');
CALL add_column_if_missing('awards', 'image', 'varchar(255) DEFAULT NULL', 'description');
CALL add_column_if_missing('awards', 'is_featured', 'tinyint(1) NOT NULL DEFAULT ''0''', 'image');
CALL add_column_if_missing('awards', 'sort_order', 'int DEFAULT ''0''', 'is_featured');
CALL add_column_if_missing('awards', 'created_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP', 'sort_order');

-- ---------- business_accounts ----------
CREATE TABLE IF NOT EXISTS `business_accounts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `business_name` varchar(160) NOT NULL,
  `category` varchar(80) DEFAULT NULL,
  `borough` varchar(60) DEFAULT NULL,
  `contact_name` varchar(120) DEFAULT NULL,
  `contact_phone` varchar(40) DEFAULT NULL,
  `website` varchar(255) DEFAULT NULL,
  `about` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id` (`user_id`),
  KEY `idx_business_name` (`business_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CALL add_column_if_missing('business_accounts', 'user_id', 'int NOT NULL', 'id');
CALL add_column_if_missing('business_accounts', 'business_name', 'varchar(160) NOT NULL', 'user_id');
CALL add_column_if_missing('business_accounts', 'category', 'varchar(80) DEFAULT NULL', 'business_name');
CALL add_column_if_missing('business_accounts', 'borough', 'varchar(60) DEFAULT NULL', 'category');
CALL add_column_if_missing('business_accounts', 'contact_name', 'varchar(120) DEFAULT NULL', 'borough');
CALL add_column_if_missing('business_accounts', 'contact_phone', 'varchar(40) DEFAULT NULL', 'contact_name');
CALL add_column_if_missing('business_accounts', 'website', 'varchar(255) DEFAULT NULL', 'contact_phone');
CALL add_column_if_missing('business_accounts', 'about', 'text', 'website');
CALL add_column_if_missing('business_accounts', 'created_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP', 'about');
CALL add_column_if_missing('business_accounts', 'updated_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'created_at');

-- ---------- business_offer_events ----------
CREATE TABLE IF NOT EXISTS `business_offer_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `request_id` int NOT NULL,
  `event` varchar(32) NOT NULL,
  `actor_role` varchar(20) NOT NULL,
  `actor_label` varchar(160) DEFAULT NULL,
  `note` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_offer_events_req` (`request_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CALL add_column_if_missing('business_offer_events', 'request_id', 'int NOT NULL', 'id');
CALL add_column_if_missing('business_offer_events', 'event', 'varchar(32) NOT NULL', 'request_id');
CALL add_column_if_missing('business_offer_events', 'actor_role', 'varchar(20) NOT NULL', 'event');
CALL add_column_if_missing('business_offer_events', 'actor_label', 'varchar(160) DEFAULT NULL', 'actor_role');
CALL add_column_if_missing('business_offer_events', 'note', 'text', 'actor_label');
CALL add_column_if_missing('business_offer_events', 'created_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP', 'note');

-- ---------- business_requests ----------
CREATE TABLE IF NOT EXISTS `business_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `business_user_id` int NOT NULL,
  `request_type` varchar(24) NOT NULL,
  `submission_id` int DEFAULT NULL,
  `student_id` int DEFAULT NULL,
  `student_name` varchar(120) DEFAULT NULL,
  `school_name` varchar(180) DEFAULT NULL,
  `message` text,
  `status` varchar(16) NOT NULL DEFAULT 'pending',
  `admin_note` text,
  `reviewed_by_user_id` int DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `student_consent` varchar(12) NOT NULL DEFAULT 'pending',
  `parent_consent` varchar(12) NOT NULL DEFAULT 'pending',
  `job_title` varchar(160) DEFAULT NULL,
  `location` varchar(160) DEFAULT NULL,
  `duration` varchar(80) DEFAULT NULL,
  `stipend` varchar(80) DEFAULT NULL,
  `working_hours` varchar(120) DEFAULT NULL,
  `skills` varchar(400) DEFAULT NULL,
  `decline_reason` text,
  `declined_by` varchar(12) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_breq_biz` (`business_user_id`),
  KEY `idx_breq_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CALL add_column_if_missing('business_requests', 'business_user_id', 'int NOT NULL', 'id');
CALL add_column_if_missing('business_requests', 'request_type', 'varchar(24) NOT NULL', 'business_user_id');
CALL add_column_if_missing('business_requests', 'submission_id', 'int DEFAULT NULL', 'request_type');
CALL add_column_if_missing('business_requests', 'student_id', 'int DEFAULT NULL', 'submission_id');
CALL add_column_if_missing('business_requests', 'student_name', 'varchar(120) DEFAULT NULL', 'student_id');
CALL add_column_if_missing('business_requests', 'school_name', 'varchar(180) DEFAULT NULL', 'student_name');
CALL add_column_if_missing('business_requests', 'message', 'text', 'school_name');
CALL add_column_if_missing('business_requests', 'status', 'varchar(16) NOT NULL DEFAULT ''pending''', 'message');
CALL add_column_if_missing('business_requests', 'admin_note', 'text', 'status');
CALL add_column_if_missing('business_requests', 'reviewed_by_user_id', 'int DEFAULT NULL', 'admin_note');
CALL add_column_if_missing('business_requests', 'reviewed_at', 'timestamp NULL DEFAULT NULL', 'reviewed_by_user_id');
CALL add_column_if_missing('business_requests', 'created_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP', 'reviewed_at');
CALL add_column_if_missing('business_requests', 'updated_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'created_at');
CALL add_column_if_missing('business_requests', 'student_consent', 'varchar(12) NOT NULL DEFAULT ''pending''', 'updated_at');
CALL add_column_if_missing('business_requests', 'parent_consent', 'varchar(12) NOT NULL DEFAULT ''pending''', 'student_consent');
CALL add_column_if_missing('business_requests', 'job_title', 'varchar(160) DEFAULT NULL', 'parent_consent');
CALL add_column_if_missing('business_requests', 'location', 'varchar(160) DEFAULT NULL', 'job_title');
CALL add_column_if_missing('business_requests', 'duration', 'varchar(80) DEFAULT NULL', 'location');
CALL add_column_if_missing('business_requests', 'stipend', 'varchar(80) DEFAULT NULL', 'duration');
CALL add_column_if_missing('business_requests', 'working_hours', 'varchar(120) DEFAULT NULL', 'stipend');
CALL add_column_if_missing('business_requests', 'skills', 'varchar(400) DEFAULT NULL', 'working_hours');
CALL add_column_if_missing('business_requests', 'decline_reason', 'text', 'skills');
CALL add_column_if_missing('business_requests', 'declined_by', 'varchar(12) DEFAULT NULL', 'decline_reason');

-- ---------- community_comments ----------
CREATE TABLE IF NOT EXISTS `community_comments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `thread_id` int NOT NULL,
  `user_id` int DEFAULT NULL,
  `author_name` varchar(120) NOT NULL,
  `body` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_community_comments_thread` (`thread_id`,`created_at`),
  KEY `fk_community_comments_user` (`user_id`),
  CONSTRAINT `fk_community_comments_thread` FOREIGN KEY (`thread_id`) REFERENCES `community_threads` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_community_comments_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
CALL add_column_if_missing('community_comments', 'thread_id', 'int NOT NULL', 'id');
CALL add_column_if_missing('community_comments', 'user_id', 'int DEFAULT NULL', 'thread_id');
CALL add_column_if_missing('community_comments', 'author_name', 'varchar(120) NOT NULL', 'user_id');
CALL add_column_if_missing('community_comments', 'body', 'text NOT NULL', 'author_name');
CALL add_column_if_missing('community_comments', 'created_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP', 'body');

-- ---------- community_threads ----------
CREATE TABLE IF NOT EXISTS `community_threads` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(180) NOT NULL,
  `body` text NOT NULL,
  `audience` enum('public','member','vip') NOT NULL DEFAULT 'public',
  `author_user_id` int DEFAULT NULL,
  `author_name` varchar(120) NOT NULL,
  `is_pinned` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_community_threads_audience` (`audience`,`created_at`),
  KEY `fk_community_threads_user` (`author_user_id`),
  CONSTRAINT `fk_community_threads_user` FOREIGN KEY (`author_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
CALL add_column_if_missing('community_threads', 'title', 'varchar(180) NOT NULL', 'id');
CALL add_column_if_missing('community_threads', 'body', 'text NOT NULL', 'title');
CALL add_column_if_missing('community_threads', 'audience', 'enum(''public'',''member'',''vip'') NOT NULL DEFAULT ''public''', 'body');
CALL add_column_if_missing('community_threads', 'author_user_id', 'int DEFAULT NULL', 'audience');
CALL add_column_if_missing('community_threads', 'author_name', 'varchar(120) NOT NULL', 'author_user_id');
CALL add_column_if_missing('community_threads', 'is_pinned', 'tinyint(1) NOT NULL DEFAULT ''0''', 'author_name');
CALL add_column_if_missing('community_threads', 'created_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP', 'is_pinned');

-- ---------- contact_messages ----------
CREATE TABLE IF NOT EXISTS `contact_messages` (
  `id` int NOT NULL AUTO_INCREMENT,
  `full_name` varchar(120) NOT NULL,
  `email` varchar(160) NOT NULL,
  `message` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
CALL add_column_if_missing('contact_messages', 'full_name', 'varchar(120) NOT NULL', 'id');
CALL add_column_if_missing('contact_messages', 'email', 'varchar(160) NOT NULL', 'full_name');
CALL add_column_if_missing('contact_messages', 'message', 'text', 'email');
CALL add_column_if_missing('contact_messages', 'created_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP', 'message');

-- ---------- ecosystem_accounts ----------
CREATE TABLE IF NOT EXISTS `ecosystem_accounts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `role` varchar(20) NOT NULL,
  `org_name` varchar(160) NOT NULL,
  `contact_name` varchar(120) DEFAULT NULL,
  `contact_phone` varchar(40) DEFAULT NULL,
  `website` varchar(255) DEFAULT NULL,
  `about` text,
  `details` text,
  `referral_code` varchar(24) DEFAULT NULL,
  `referred_by_code` varchar(24) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id` (`user_id`),
  KEY `idx_eco_role` (`role`),
  KEY `idx_eco_refby` (`referred_by_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CALL add_column_if_missing('ecosystem_accounts', 'user_id', 'int NOT NULL', 'id');
CALL add_column_if_missing('ecosystem_accounts', 'role', 'varchar(20) NOT NULL', 'user_id');
CALL add_column_if_missing('ecosystem_accounts', 'org_name', 'varchar(160) NOT NULL', 'role');
CALL add_column_if_missing('ecosystem_accounts', 'contact_name', 'varchar(120) DEFAULT NULL', 'org_name');
CALL add_column_if_missing('ecosystem_accounts', 'contact_phone', 'varchar(40) DEFAULT NULL', 'contact_name');
CALL add_column_if_missing('ecosystem_accounts', 'website', 'varchar(255) DEFAULT NULL', 'contact_phone');
CALL add_column_if_missing('ecosystem_accounts', 'about', 'text', 'website');
CALL add_column_if_missing('ecosystem_accounts', 'details', 'text', 'about');
CALL add_column_if_missing('ecosystem_accounts', 'referral_code', 'varchar(24) DEFAULT NULL', 'details');
CALL add_column_if_missing('ecosystem_accounts', 'referred_by_code', 'varchar(24) DEFAULT NULL', 'referral_code');
CALL add_column_if_missing('ecosystem_accounts', 'created_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP', 'referred_by_code');
CALL add_column_if_missing('ecosystem_accounts', 'updated_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'created_at');

-- ---------- ecosystem_announcements ----------
CREATE TABLE IF NOT EXISTS `ecosystem_announcements` (
  `id` int NOT NULL AUTO_INCREMENT,
  `audience` varchar(20) NOT NULL DEFAULT 'all',
  `title` varchar(180) NOT NULL,
  `body` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ecoann_aud` (`audience`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CALL add_column_if_missing('ecosystem_announcements', 'audience', 'varchar(20) NOT NULL DEFAULT ''all''', 'id');
CALL add_column_if_missing('ecosystem_announcements', 'title', 'varchar(180) NOT NULL', 'audience');
CALL add_column_if_missing('ecosystem_announcements', 'body', 'text', 'title');
CALL add_column_if_missing('ecosystem_announcements', 'created_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP', 'body');

-- ---------- ecosystem_assignments ----------
CREATE TABLE IF NOT EXISTS `ecosystem_assignments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `role` varchar(20) NOT NULL,
  `title` varchar(180) NOT NULL,
  `detail` text,
  `assign_date` date DEFAULT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `volunteer_note` text,
  `responded_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_ecoassign_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CALL add_column_if_missing('ecosystem_assignments', 'user_id', 'int NOT NULL', 'id');
CALL add_column_if_missing('ecosystem_assignments', 'role', 'varchar(20) NOT NULL', 'user_id');
CALL add_column_if_missing('ecosystem_assignments', 'title', 'varchar(180) NOT NULL', 'role');
CALL add_column_if_missing('ecosystem_assignments', 'detail', 'text', 'title');
CALL add_column_if_missing('ecosystem_assignments', 'assign_date', 'date DEFAULT NULL', 'detail');
CALL add_column_if_missing('ecosystem_assignments', 'status', 'varchar(16) NOT NULL DEFAULT ''active''', 'assign_date');
CALL add_column_if_missing('ecosystem_assignments', 'created_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP', 'status');
CALL add_column_if_missing('ecosystem_assignments', 'volunteer_note', 'text', 'created_at');
CALL add_column_if_missing('ecosystem_assignments', 'responded_at', 'timestamp NULL DEFAULT NULL', 'volunteer_note');

-- ---------- ecosystem_documents ----------
CREATE TABLE IF NOT EXISTS `ecosystem_documents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `role` varchar(20) NOT NULL,
  `doc_type` varchar(40) NOT NULL DEFAULT 'document',
  `label` varchar(160) NOT NULL,
  `file_url` varchar(400) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ecodoc_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CALL add_column_if_missing('ecosystem_documents', 'user_id', 'int NOT NULL', 'id');
CALL add_column_if_missing('ecosystem_documents', 'role', 'varchar(20) NOT NULL', 'user_id');
CALL add_column_if_missing('ecosystem_documents', 'doc_type', 'varchar(40) NOT NULL DEFAULT ''document''', 'role');
CALL add_column_if_missing('ecosystem_documents', 'label', 'varchar(160) NOT NULL', 'doc_type');
CALL add_column_if_missing('ecosystem_documents', 'file_url', 'varchar(400) NOT NULL', 'label');
CALL add_column_if_missing('ecosystem_documents', 'created_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP', 'file_url');

-- ---------- ecosystem_requests ----------
CREATE TABLE IF NOT EXISTS `ecosystem_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `role` varchar(20) NOT NULL,
  `req_type` varchar(30) NOT NULL,
  `message` text,
  `status` varchar(16) NOT NULL DEFAULT 'pending',
  `admin_note` text,
  `reviewed_by_user_id` int DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ecoreq_user` (`user_id`),
  KEY `idx_ecoreq_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CALL add_column_if_missing('ecosystem_requests', 'user_id', 'int NOT NULL', 'id');
CALL add_column_if_missing('ecosystem_requests', 'role', 'varchar(20) NOT NULL', 'user_id');
CALL add_column_if_missing('ecosystem_requests', 'req_type', 'varchar(30) NOT NULL', 'role');
CALL add_column_if_missing('ecosystem_requests', 'message', 'text', 'req_type');
CALL add_column_if_missing('ecosystem_requests', 'status', 'varchar(16) NOT NULL DEFAULT ''pending''', 'message');
CALL add_column_if_missing('ecosystem_requests', 'admin_note', 'text', 'status');
CALL add_column_if_missing('ecosystem_requests', 'reviewed_by_user_id', 'int DEFAULT NULL', 'admin_note');
CALL add_column_if_missing('ecosystem_requests', 'reviewed_at', 'timestamp NULL DEFAULT NULL', 'reviewed_by_user_id');
CALL add_column_if_missing('ecosystem_requests', 'created_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP', 'reviewed_at');

-- ---------- event_rsvps ----------
CREATE TABLE IF NOT EXISTS `event_rsvps` (
  `id` int NOT NULL AUTO_INCREMENT,
  `event_id` int NOT NULL,
  `user_id` int DEFAULT NULL,
  `full_name` varchar(120) NOT NULL,
  `email` varchar(160) NOT NULL,
  `status` enum('going','maybe','interested','cancelled') NOT NULL DEFAULT 'going',
  `notes` text,
  `confirmation_code` varchar(24) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `confirmation_code` (`confirmation_code`),
  KEY `idx_event_rsvps_event` (`event_id`,`created_at`),
  KEY `fk_event_rsvps_user` (`user_id`),
  CONSTRAINT `fk_event_rsvps_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_event_rsvps_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
CALL add_column_if_missing('event_rsvps', 'event_id', 'int NOT NULL', 'id');
CALL add_column_if_missing('event_rsvps', 'user_id', 'int DEFAULT NULL', 'event_id');
CALL add_column_if_missing('event_rsvps', 'full_name', 'varchar(120) NOT NULL', 'user_id');
CALL add_column_if_missing('event_rsvps', 'email', 'varchar(160) NOT NULL', 'full_name');
CALL add_column_if_missing('event_rsvps', 'status', 'enum(''going'',''maybe'',''interested'',''cancelled'') NOT NULL DEFAULT ''going''', 'email');
CALL add_column_if_missing('event_rsvps', 'notes', 'text', 'status');
CALL add_column_if_missing('event_rsvps', 'confirmation_code', 'varchar(24) NOT NULL', 'notes');
CALL add_column_if_missing('event_rsvps', 'created_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP', 'confirmation_code');

-- ---------- events ----------
CREATE TABLE IF NOT EXISTS `events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(180) NOT NULL,
  `location` varchar(180) DEFAULT NULL,
  `role` varchar(120) DEFAULT NULL,
  `event_date` date NOT NULL,
  `is_past` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
CALL add_column_if_missing('events', 'title', 'varchar(180) NOT NULL', 'id');
CALL add_column_if_missing('events', 'location', 'varchar(180) DEFAULT NULL', 'title');
CALL add_column_if_missing('events', 'role', 'varchar(120) DEFAULT NULL', 'location');
CALL add_column_if_missing('events', 'event_date', 'date NOT NULL', 'role');
CALL add_column_if_missing('events', 'is_past', 'tinyint(1) NOT NULL DEFAULT ''0''', 'event_date');
CALL add_column_if_missing('events', 'created_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP', 'is_past');

-- ---------- gallery_submission_files ----------
CREATE TABLE IF NOT EXISTS `gallery_submission_files` (
  `id` int NOT NULL AUTO_INCREMENT,
  `submission_id` int NOT NULL,
  `original_name` varchar(255) NOT NULL,
  `display_title` varchar(180) NOT NULL,
  `file_url` varchar(255) NOT NULL,
  `mime_type` varchar(120) NOT NULL,
  `media_kind` enum('image','video') NOT NULL,
  `size_bytes` bigint NOT NULL DEFAULT '0',
  `approval_status` enum('pending_review','approved','rejected') NOT NULL DEFAULT 'pending_review',
  `reviewed_by_user_id` int DEFAULT NULL,
  `reviewed_by_name` varchar(160) DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `rejected_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_gallery_submission_files_submission` (`submission_id`,`created_at`),
  KEY `idx_gallery_submission_files_status` (`approval_status`,`media_kind`,`created_at`),
  KEY `fk_gallery_submission_files_reviewer` (`reviewed_by_user_id`),
  CONSTRAINT `fk_gallery_submission_files_reviewer` FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_gallery_submission_files_submission` FOREIGN KEY (`submission_id`) REFERENCES `gallery_submissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
CALL add_column_if_missing('gallery_submission_files', 'submission_id', 'int NOT NULL', 'id');
CALL add_column_if_missing('gallery_submission_files', 'original_name', 'varchar(255) NOT NULL', 'submission_id');
CALL add_column_if_missing('gallery_submission_files', 'display_title', 'varchar(180) NOT NULL', 'original_name');
CALL add_column_if_missing('gallery_submission_files', 'file_url', 'varchar(255) NOT NULL', 'display_title');
CALL add_column_if_missing('gallery_submission_files', 'mime_type', 'varchar(120) NOT NULL', 'file_url');
CALL add_column_if_missing('gallery_submission_files', 'media_kind', 'enum(''image'',''video'') NOT NULL', 'mime_type');
CALL add_column_if_missing('gallery_submission_files', 'size_bytes', 'bigint NOT NULL DEFAULT ''0''', 'media_kind');
CALL add_column_if_missing('gallery_submission_files', 'approval_status', 'enum(''pending_review'',''approved'',''rejected'') NOT NULL DEFAULT ''pending_review''', 'size_bytes');
CALL add_column_if_missing('gallery_submission_files', 'reviewed_by_user_id', 'int DEFAULT NULL', 'approval_status');
CALL add_column_if_missing('gallery_submission_files', 'reviewed_by_name', 'varchar(160) DEFAULT NULL', 'reviewed_by_user_id');
CALL add_column_if_missing('gallery_submission_files', 'reviewed_at', 'timestamp NULL DEFAULT NULL', 'reviewed_by_name');
CALL add_column_if_missing('gallery_submission_files', 'approved_at', 'timestamp NULL DEFAULT NULL', 'reviewed_at');
CALL add_column_if_missing('gallery_submission_files', 'rejected_at', 'timestamp NULL DEFAULT NULL', 'approved_at');
CALL add_column_if_missing('gallery_submission_files', 'created_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP', 'rejected_at');
CALL add_column_if_missing('gallery_submission_files', 'updated_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'created_at');

-- ---------- gallery_submissions ----------
CREATE TABLE IF NOT EXISTS `gallery_submissions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `submitter_name` varchar(160) NOT NULL,
  `submitter_email` varchar(160) NOT NULL,
  `organization` varchar(180) DEFAULT NULL,
  `message` text,
  `overall_status` enum('pending_review','partially_approved','approved','rejected') NOT NULL DEFAULT 'pending_review',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_gallery_submissions_status` (`overall_status`,`created_at`),
  KEY `idx_gallery_submissions_user` (`user_id`,`created_at`),
  CONSTRAINT `fk_gallery_submission_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
CALL add_column_if_missing('gallery_submissions', 'user_id', 'int DEFAULT NULL', 'id');
CALL add_column_if_missing('gallery_submissions', 'submitter_name', 'varchar(160) NOT NULL', 'user_id');
CALL add_column_if_missing('gallery_submissions', 'submitter_email', 'varchar(160) NOT NULL', 'submitter_name');
CALL add_column_if_missing('gallery_submissions', 'organization', 'varchar(180) DEFAULT NULL', 'submitter_email');
CALL add_column_if_missing('gallery_submissions', 'message', 'text', 'organization');
CALL add_column_if_missing('gallery_submissions', 'overall_status', 'enum(''pending_review'',''partially_approved'',''approved'',''rejected'') NOT NULL DEFAULT ''pending_review''', 'message');
CALL add_column_if_missing('gallery_submissions', 'created_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP', 'overall_status');
CALL add_column_if_missing('gallery_submissions', 'updated_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'created_at');

-- ---------- mail_outbox ----------
CREATE TABLE IF NOT EXISTS `mail_outbox` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `message_kind` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'notification',
  `recipient_email` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `subject` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `body_text` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('queued','sending','retry','sent','failed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'queued',
  `attempts` tinyint unsigned NOT NULL DEFAULT '0',
  `last_error` text COLLATE utf8mb4_unicode_ci,
  `next_attempt_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `sent_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `body_html` longtext COLLATE utf8mb4_unicode_ci,
  `attachments_json` longtext COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  KEY `idx_mail_outbox_status_next` (`status`,`next_attempt_at`,`created_at`),
  KEY `idx_mail_outbox_kind_status` (`message_kind`,`status`,`created_at`),
  KEY `idx_mail_outbox_recipient` (`recipient_email`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CALL add_column_if_missing('mail_outbox', 'message_kind', 'varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''notification''', 'id');
CALL add_column_if_missing('mail_outbox', 'recipient_email', 'varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL', 'message_kind');
CALL add_column_if_missing('mail_outbox', 'subject', 'varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL', 'recipient_email');
CALL add_column_if_missing('mail_outbox', 'body_text', 'longtext COLLATE utf8mb4_unicode_ci NOT NULL', 'subject');
CALL add_column_if_missing('mail_outbox', 'status', 'enum(''queued'',''sending'',''retry'',''sent'',''failed'') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''queued''', 'body_text');
CALL add_column_if_missing('mail_outbox', 'attempts', 'tinyint unsigned NOT NULL DEFAULT ''0''', 'status');
CALL add_column_if_missing('mail_outbox', 'last_error', 'text COLLATE utf8mb4_unicode_ci', 'attempts');
CALL add_column_if_missing('mail_outbox', 'next_attempt_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP', 'last_error');
CALL add_column_if_missing('mail_outbox', 'sent_at', 'timestamp NULL DEFAULT NULL', 'next_attempt_at');
CALL add_column_if_missing('mail_outbox', 'created_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP', 'sent_at');
CALL add_column_if_missing('mail_outbox', 'updated_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'created_at');
CALL add_column_if_missing('mail_outbox', 'body_html', 'longtext COLLATE utf8mb4_unicode_ci', 'updated_at');
CALL add_column_if_missing('mail_outbox', 'attachments_json', 'longtext COLLATE utf8mb4_unicode_ci', 'body_html');

-- ---------- media_items ----------
CREATE TABLE IF NOT EXISTS `media_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(180) NOT NULL,
  `type` enum('podcast','interview','tv','press_release','article','photo','video') NOT NULL DEFAULT 'article',
  `summary` text,
  `body` longtext,
  `image` varchar(255) DEFAULT NULL,
  `link_url` varchar(255) DEFAULT NULL,
  `published_at` date DEFAULT NULL,
  `is_featured` tinyint(1) NOT NULL DEFAULT '0',
  `sort_order` int DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
CALL add_column_if_missing('media_items', 'title', 'varchar(180) NOT NULL', 'id');
CALL add_column_if_missing('media_items', 'type', 'enum(''podcast'',''interview'',''tv'',''press_release'',''article'',''photo'',''video'') NOT NULL DEFAULT ''article''', 'title');
CALL add_column_if_missing('media_items', 'summary', 'text', 'type');
CALL add_column_if_missing('media_items', 'body', 'longtext', 'summary');
CALL add_column_if_missing('media_items', 'image', 'varchar(255) DEFAULT NULL', 'body');
CALL add_column_if_missing('media_items', 'link_url', 'varchar(255) DEFAULT NULL', 'image');
CALL add_column_if_missing('media_items', 'published_at', 'date DEFAULT NULL', 'link_url');
CALL add_column_if_missing('media_items', 'is_featured', 'tinyint(1) NOT NULL DEFAULT ''0''', 'published_at');
CALL add_column_if_missing('media_items', 'sort_order', 'int DEFAULT ''0''', 'is_featured');
CALL add_column_if_missing('media_items', 'created_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP', 'sort_order');

-- ---------- new_school_approvals ----------
CREATE TABLE IF NOT EXISTS `new_school_approvals` (
  `id` int NOT NULL AUTO_INCREMENT,
  `student_id` int NOT NULL,
  `approval_type` enum('school','teacher') NOT NULL,
  `reviewer_user_id` int DEFAULT NULL,
  `reviewer_name` varchar(120) NOT NULL,
  `reviewer_email` varchar(160) NOT NULL,
  `reviewer_role` varchar(120) DEFAULT NULL,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `notes` text,
  `digital_signature` varchar(255) DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `recorded_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_student_approval_type` (`student_id`,`approval_type`),
  KEY `fk_new_school_approvals_user` (`reviewer_user_id`),
  CONSTRAINT `fk_new_school_approvals_student` FOREIGN KEY (`student_id`) REFERENCES `new_school_students` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_new_school_approvals_user` FOREIGN KEY (`reviewer_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
CALL add_column_if_missing('new_school_approvals', 'student_id', 'int NOT NULL', 'id');
CALL add_column_if_missing('new_school_approvals', 'approval_type', 'enum(''school'',''teacher'') NOT NULL', 'student_id');
CALL add_column_if_missing('new_school_approvals', 'reviewer_user_id', 'int DEFAULT NULL', 'approval_type');
CALL add_column_if_missing('new_school_approvals', 'reviewer_name', 'varchar(120) NOT NULL', 'reviewer_user_id');
CALL add_column_if_missing('new_school_approvals', 'reviewer_email', 'varchar(160) NOT NULL', 'reviewer_name');
CALL add_column_if_missing('new_school_approvals', 'reviewer_role', 'varchar(120) DEFAULT NULL', 'reviewer_email');
CALL add_column_if_missing('new_school_approvals', 'status', 'enum(''pending'',''approved'',''rejected'') NOT NULL DEFAULT ''pending''', 'reviewer_role');
CALL add_column_if_missing('new_school_approvals', 'notes', 'text', 'status');
CALL add_column_if_missing('new_school_approvals', 'digital_signature', 'varchar(255) DEFAULT NULL', 'notes');
CALL add_column_if_missing('new_school_approvals', 'approved_at', 'timestamp NULL DEFAULT NULL', 'digital_signature');
CALL add_column_if_missing('new_school_approvals', 'recorded_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP', 'approved_at');
CALL add_column_if_missing('new_school_approvals', 'created_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP', 'recorded_at');
CALL add_column_if_missing('new_school_approvals', 'updated_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'created_at');

-- ---------- new_school_business_interviews ----------
CREATE TABLE IF NOT EXISTS `new_school_business_interviews` (
  `id` int NOT NULL AUTO_INCREMENT,
  `student_id` int NOT NULL,
  `visit_number` tinyint unsigned NOT NULL,
  `business_name` varchar(180) NOT NULL,
  `owner_name` varchar(120) NOT NULL,
  `business_phone` varchar(40) NOT NULL,
  `business_address` varchar(255) NOT NULL,
  `business_category` varchar(120) NOT NULL,
  `date_of_visit` date NOT NULL,
  `has_website` tinyint(1) NOT NULL DEFAULT '0',
  `has_google_profile` tinyint(1) NOT NULL DEFAULT '0',
  `uses_social_media` tinyint(1) NOT NULL DEFAULT '0',
  `uses_digital_signage` tinyint(1) NOT NULL DEFAULT '0',
  `offers_rewards` tinyint(1) NOT NULL DEFAULT '0',
  `has_online_ordering` tinyint(1) NOT NULL DEFAULT '0',
  `has_delivery_options` tinyint(1) NOT NULL DEFAULT '0',
  `main_challenge` text NOT NULL,
  `student_notes` text NOT NULL,
  `signature` varchar(255) DEFAULT NULL,
  `is_starred` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `business_user_id` int DEFAULT NULL,
  `business_website` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_student_visit` (`student_id`,`visit_number`),
  CONSTRAINT `fk_new_school_business_student` FOREIGN KEY (`student_id`) REFERENCES `new_school_students` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
CALL add_column_if_missing('new_school_business_interviews', 'student_id', 'int NOT NULL', 'id');
CALL add_column_if_missing('new_school_business_interviews', 'visit_number', 'tinyint unsigned NOT NULL', 'student_id');
CALL add_column_if_missing('new_school_business_interviews', 'business_name', 'varchar(180) NOT NULL', 'visit_number');
CALL add_column_if_missing('new_school_business_interviews', 'owner_name', 'varchar(120) NOT NULL', 'business_name');
CALL add_column_if_missing('new_school_business_interviews', 'business_phone', 'varchar(40) NOT NULL', 'owner_name');
CALL add_column_if_missing('new_school_business_interviews', 'business_address', 'varchar(255) NOT NULL', 'business_phone');
CALL add_column_if_missing('new_school_business_interviews', 'business_category', 'varchar(120) NOT NULL', 'business_address');
CALL add_column_if_missing('new_school_business_interviews', 'date_of_visit', 'date NOT NULL', 'business_category');
CALL add_column_if_missing('new_school_business_interviews', 'has_website', 'tinyint(1) NOT NULL DEFAULT ''0''', 'date_of_visit');
CALL add_column_if_missing('new_school_business_interviews', 'has_google_profile', 'tinyint(1) NOT NULL DEFAULT ''0''', 'has_website');
CALL add_column_if_missing('new_school_business_interviews', 'uses_social_media', 'tinyint(1) NOT NULL DEFAULT ''0''', 'has_google_profile');
CALL add_column_if_missing('new_school_business_interviews', 'uses_digital_signage', 'tinyint(1) NOT NULL DEFAULT ''0''', 'uses_social_media');
CALL add_column_if_missing('new_school_business_interviews', 'offers_rewards', 'tinyint(1) NOT NULL DEFAULT ''0''', 'uses_digital_signage');
CALL add_column_if_missing('new_school_business_interviews', 'has_online_ordering', 'tinyint(1) NOT NULL DEFAULT ''0''', 'offers_rewards');
CALL add_column_if_missing('new_school_business_interviews', 'has_delivery_options', 'tinyint(1) NOT NULL DEFAULT ''0''', 'has_online_ordering');
CALL add_column_if_missing('new_school_business_interviews', 'main_challenge', 'text NOT NULL', 'has_delivery_options');
CALL add_column_if_missing('new_school_business_interviews', 'student_notes', 'text NOT NULL', 'main_challenge');
CALL add_column_if_missing('new_school_business_interviews', 'signature', 'varchar(255) DEFAULT NULL', 'student_notes');
CALL add_column_if_missing('new_school_business_interviews', 'is_starred', 'tinyint(1) NOT NULL DEFAULT ''0''', 'signature');
CALL add_column_if_missing('new_school_business_interviews', 'created_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP', 'is_starred');
CALL add_column_if_missing('new_school_business_interviews', 'updated_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'created_at');
CALL add_column_if_missing('new_school_business_interviews', 'business_user_id', 'int DEFAULT NULL', 'updated_at');
CALL add_column_if_missing('new_school_business_interviews', 'business_website', 'varchar(255) DEFAULT NULL', 'business_user_id');

-- ---------- new_school_chat_clears ----------
CREATE TABLE IF NOT EXISTS `new_school_chat_clears` (
  `thread_user_id` int NOT NULL,
  `side` enum('user','admin') NOT NULL,
  `cleared_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`thread_user_id`,`side`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
CALL add_column_if_missing('new_school_chat_clears', 'thread_user_id', 'int NOT NULL', '');
CALL add_column_if_missing('new_school_chat_clears', 'side', 'enum(''user'',''admin'') NOT NULL', 'thread_user_id');
CALL add_column_if_missing('new_school_chat_clears', 'cleared_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP', 'side');

-- ---------- new_school_chat_messages ----------
CREATE TABLE IF NOT EXISTS `new_school_chat_messages` (
  `id` int NOT NULL AUTO_INCREMENT,
  `thread_user_id` int NOT NULL,
  `sender` enum('user','admin') NOT NULL,
  `sender_user_id` int DEFAULT NULL,
  `body` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ns_chat_thread` (`thread_user_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
CALL add_column_if_missing('new_school_chat_messages', 'thread_user_id', 'int NOT NULL', 'id');
CALL add_column_if_missing('new_school_chat_messages', 'sender', 'enum(''user'',''admin'') NOT NULL', 'thread_user_id');
CALL add_column_if_missing('new_school_chat_messages', 'sender_user_id', 'int DEFAULT NULL', 'sender');
CALL add_column_if_missing('new_school_chat_messages', 'body', 'text NOT NULL', 'sender_user_id');
CALL add_column_if_missing('new_school_chat_messages', 'created_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP', 'body');

-- ---------- new_school_judge_assignments ----------
CREATE TABLE IF NOT EXISTS `new_school_judge_assignments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `judge_user_id` int NOT NULL,
  `submission_id` int NOT NULL,
  `status` enum('assigned','recused') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'assigned',
  `recuse_reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assigned_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_judge_assignment` (`judge_user_id`,`submission_id`),
  KEY `idx_assignment_judge` (`judge_user_id`,`status`),
  KEY `idx_assignment_submission` (`submission_id`),
  CONSTRAINT `fk_assignment_judge` FOREIGN KEY (`judge_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_assignment_submission` FOREIGN KEY (`submission_id`) REFERENCES `new_school_submissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CALL add_column_if_missing('new_school_judge_assignments', 'judge_user_id', 'int NOT NULL', 'id');
CALL add_column_if_missing('new_school_judge_assignments', 'submission_id', 'int NOT NULL', 'judge_user_id');
CALL add_column_if_missing('new_school_judge_assignments', 'status', 'enum(''assigned'',''recused'') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''assigned''', 'submission_id');
CALL add_column_if_missing('new_school_judge_assignments', 'recuse_reason', 'varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL', 'status');
CALL add_column_if_missing('new_school_judge_assignments', 'assigned_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP', 'recuse_reason');
CALL add_column_if_missing('new_school_judge_assignments', 'updated_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'assigned_at');

-- ---------- new_school_judge_score_audit ----------
CREATE TABLE IF NOT EXISTS `new_school_judge_score_audit` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `submission_id` int NOT NULL,
  `judge_user_id` int NOT NULL,
  `action` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'update',
  `old_total` int DEFAULT NULL,
  `new_total` int DEFAULT NULL,
  `detail` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_submission` (`submission_id`,`created_at`),
  KEY `idx_audit_judge` (`judge_user_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CALL add_column_if_missing('new_school_judge_score_audit', 'submission_id', 'int NOT NULL', 'id');
CALL add_column_if_missing('new_school_judge_score_audit', 'judge_user_id', 'int NOT NULL', 'submission_id');
CALL add_column_if_missing('new_school_judge_score_audit', 'action', 'varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''update''', 'judge_user_id');
CALL add_column_if_missing('new_school_judge_score_audit', 'old_total', 'int DEFAULT NULL', 'action');
CALL add_column_if_missing('new_school_judge_score_audit', 'new_total', 'int DEFAULT NULL', 'old_total');
CALL add_column_if_missing('new_school_judge_score_audit', 'detail', 'text COLLATE utf8mb4_unicode_ci', 'new_total');
CALL add_column_if_missing('new_school_judge_score_audit', 'created_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP', 'detail');

-- ---------- new_school_judge_scores ----------
CREATE TABLE IF NOT EXISTS `new_school_judge_scores` (
  `id` int NOT NULL AUTO_INCREMENT,
  `submission_id` int NOT NULL,
  `judge_user_id` int NOT NULL,
  `problem` tinyint unsigned NOT NULL DEFAULT '0',
  `solution` tinyint unsigned NOT NULL DEFAULT '0',
  `creativity` tinyint unsigned NOT NULL DEFAULT '0',
  `supporting_evidence` tinyint unsigned NOT NULL DEFAULT '0',
  `community_impact` tinyint unsigned NOT NULL DEFAULT '0',
  `presentation` tinyint unsigned NOT NULL DEFAULT '0',
  `total` int NOT NULL DEFAULT '0',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `status` enum('draft','submitted') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_judge_submission` (`submission_id`,`judge_user_id`),
  KEY `idx_judge_scores_submission` (`submission_id`,`status`),
  KEY `idx_judge_scores_judge` (`judge_user_id`,`status`),
  CONSTRAINT `fk_judge_scores_judge` FOREIGN KEY (`judge_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_judge_scores_submission` FOREIGN KEY (`submission_id`) REFERENCES `new_school_submissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CALL add_column_if_missing('new_school_judge_scores', 'submission_id', 'int NOT NULL', 'id');
CALL add_column_if_missing('new_school_judge_scores', 'judge_user_id', 'int NOT NULL', 'submission_id');
CALL add_column_if_missing('new_school_judge_scores', 'problem', 'tinyint unsigned NOT NULL DEFAULT ''0''', 'judge_user_id');
CALL add_column_if_missing('new_school_judge_scores', 'solution', 'tinyint unsigned NOT NULL DEFAULT ''0''', 'problem');
CALL add_column_if_missing('new_school_judge_scores', 'creativity', 'tinyint unsigned NOT NULL DEFAULT ''0''', 'solution');
CALL add_column_if_missing('new_school_judge_scores', 'supporting_evidence', 'tinyint unsigned NOT NULL DEFAULT ''0''', 'creativity');
CALL add_column_if_missing('new_school_judge_scores', 'community_impact', 'tinyint unsigned NOT NULL DEFAULT ''0''', 'supporting_evidence');
CALL add_column_if_missing('new_school_judge_scores', 'presentation', 'tinyint unsigned NOT NULL DEFAULT ''0''', 'community_impact');
CALL add_column_if_missing('new_school_judge_scores', 'total', 'int NOT NULL DEFAULT ''0''', 'presentation');
CALL add_column_if_missing('new_school_judge_scores', 'notes', 'text COLLATE utf8mb4_unicode_ci', 'total');
CALL add_column_if_missing('new_school_judge_scores', 'status', 'enum(''draft'',''submitted'') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''draft''', 'notes');
CALL add_column_if_missing('new_school_judge_scores', 'created_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP', 'status');
CALL add_column_if_missing('new_school_judge_scores', 'updated_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'created_at');

-- ---------- new_school_judges ----------
CREATE TABLE IF NOT EXISTS `new_school_judges` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `display_name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `certified_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id` (`user_id`),
  CONSTRAINT `fk_new_school_judges_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CALL add_column_if_missing('new_school_judges', 'user_id', 'int NOT NULL', 'id');
CALL add_column_if_missing('new_school_judges', 'display_name', 'varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL', 'user_id');
CALL add_column_if_missing('new_school_judges', 'certified_at', 'datetime DEFAULT NULL', 'display_name');
CALL add_column_if_missing('new_school_judges', 'created_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP', 'certified_at');

-- ---------- new_school_notifications ----------
CREATE TABLE IF NOT EXISTS `new_school_notifications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `student_id` int DEFAULT NULL,
  `recipient_role` enum('student','parent','school','teacher','admin','all') NOT NULL DEFAULT 'student',
  `notification_type` varchar(80) NOT NULL,
  `title` varchar(180) NOT NULL,
  `message` text NOT NULL,
  `payload_json` longtext,
  `is_read` tinyint(1) NOT NULL DEFAULT '0',
  `read_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_new_school_notifications_student` (`student_id`),
  KEY `idx_new_school_notifications_role` (`recipient_role`),
  KEY `idx_new_school_notifications_created` (`created_at`),
  CONSTRAINT `fk_new_school_notifications_student` FOREIGN KEY (`student_id`) REFERENCES `new_school_students` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
CALL add_column_if_missing('new_school_notifications', 'student_id', 'int DEFAULT NULL', 'id');
CALL add_column_if_missing('new_school_notifications', 'recipient_role', 'enum(''student'',''parent'',''school'',''teacher'',''admin'',''all'') NOT NULL DEFAULT ''student''', 'student_id');
CALL add_column_if_missing('new_school_notifications', 'notification_type', 'varchar(80) NOT NULL', 'recipient_role');
CALL add_column_if_missing('new_school_notifications', 'title', 'varchar(180) NOT NULL', 'notification_type');
CALL add_column_if_missing('new_school_notifications', 'message', 'text NOT NULL', 'title');
CALL add_column_if_missing('new_school_notifications', 'payload_json', 'longtext', 'message');
CALL add_column_if_missing('new_school_notifications', 'is_read', 'tinyint(1) NOT NULL DEFAULT ''0''', 'payload_json');
CALL add_column_if_missing('new_school_notifications', 'read_at', 'timestamp NULL DEFAULT NULL', 'is_read');
CALL add_column_if_missing('new_school_notifications', 'created_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP', 'read_at');
CALL add_column_if_missing('new_school_notifications', 'updated_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'created_at');

-- ---------- new_school_parents ----------
CREATE TABLE IF NOT EXISTS `new_school_parents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `student_id` int NOT NULL,
  `parent_full_name` varchar(120) NOT NULL,
  `relationship_to_student` varchar(80) NOT NULL,
  `phone_number` varchar(40) NOT NULL,
  `email` varchar(160) NOT NULL,
  `home_address` varchar(512) NOT NULL,
  `zip_code` varchar(10) DEFAULT NULL,
  `government_id_url` varchar(255) DEFAULT NULL,
  `consent_checked` tinyint(1) NOT NULL DEFAULT '0',
  `link_status` enum('pending_student','pending_teacher','approved','rejected') NOT NULL DEFAULT 'pending_student',
  `student_confirmed_at` timestamp NULL DEFAULT NULL,
  `digital_signature` varchar(255) NOT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `consented_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id` (`user_id`),
  UNIQUE KEY `student_id` (`student_id`),
  CONSTRAINT `fk_new_school_parents_student` FOREIGN KEY (`student_id`) REFERENCES `new_school_students` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_new_school_parents_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
CALL add_column_if_missing('new_school_parents', 'user_id', 'int NOT NULL', 'id');
CALL add_column_if_missing('new_school_parents', 'student_id', 'int NOT NULL', 'user_id');
CALL add_column_if_missing('new_school_parents', 'parent_full_name', 'varchar(120) NOT NULL', 'student_id');
CALL add_column_if_missing('new_school_parents', 'relationship_to_student', 'varchar(80) NOT NULL', 'parent_full_name');
CALL add_column_if_missing('new_school_parents', 'phone_number', 'varchar(40) NOT NULL', 'relationship_to_student');
CALL add_column_if_missing('new_school_parents', 'email', 'varchar(160) NOT NULL', 'phone_number');
CALL add_column_if_missing('new_school_parents', 'home_address', 'varchar(512) NOT NULL', 'email');
CALL add_column_if_missing('new_school_parents', 'zip_code', 'varchar(10) DEFAULT NULL', 'home_address');
CALL add_column_if_missing('new_school_parents', 'government_id_url', 'varchar(255) DEFAULT NULL', 'zip_code');
CALL add_column_if_missing('new_school_parents', 'consent_checked', 'tinyint(1) NOT NULL DEFAULT ''0''', 'government_id_url');
CALL add_column_if_missing('new_school_parents', 'link_status', 'enum(''pending_student'',''pending_teacher'',''approved'',''rejected'') NOT NULL DEFAULT ''pending_student''', 'consent_checked');
CALL add_column_if_missing('new_school_parents', 'student_confirmed_at', 'timestamp NULL DEFAULT NULL', 'link_status');
CALL add_column_if_missing('new_school_parents', 'digital_signature', 'varchar(255) NOT NULL', 'student_confirmed_at');
CALL add_column_if_missing('new_school_parents', 'approved_at', 'timestamp NULL DEFAULT NULL', 'digital_signature');
CALL add_column_if_missing('new_school_parents', 'consented_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP', 'approved_at');
CALL add_column_if_missing('new_school_parents', 'created_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP', 'consented_at');
CALL add_column_if_missing('new_school_parents', 'updated_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'created_at');

-- ---------- new_school_points ----------
CREATE TABLE IF NOT EXISTS `new_school_points` (
  `id` int NOT NULL AUTO_INCREMENT,
  `recipient_role` enum('student','teacher') NOT NULL,
  `recipient_id` int NOT NULL,
  `source_type` enum('interview','project','referral') NOT NULL,
  `source_id` int NOT NULL,
  `kind` enum('auto','bonus') NOT NULL,
  `points` int NOT NULL DEFAULT '0',
  `awarded_by_user_id` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_points_source` (`recipient_role`,`recipient_id`,`source_type`,`source_id`,`kind`),
  KEY `idx_points_recipient` (`recipient_role`,`recipient_id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
CALL add_column_if_missing('new_school_points', 'recipient_role', 'enum(''student'',''teacher'') NOT NULL', 'id');
CALL add_column_if_missing('new_school_points', 'recipient_id', 'int NOT NULL', 'recipient_role');
CALL add_column_if_missing('new_school_points', 'source_type', 'enum(''interview'',''project'',''referral'') NOT NULL', 'recipient_id');
CALL add_column_if_missing('new_school_points', 'source_id', 'int NOT NULL', 'source_type');
CALL add_column_if_missing('new_school_points', 'kind', 'enum(''auto'',''bonus'') NOT NULL', 'source_id');
CALL add_column_if_missing('new_school_points', 'points', 'int NOT NULL DEFAULT ''0''', 'kind');
CALL add_column_if_missing('new_school_points', 'awarded_by_user_id', 'int DEFAULT NULL', 'points');
CALL add_column_if_missing('new_school_points', 'created_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP', 'awarded_by_user_id');
CALL add_column_if_missing('new_school_points', 'updated_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'created_at');

-- ---------- new_school_reports ----------
CREATE TABLE IF NOT EXISTS `new_school_reports` (
  `id` int NOT NULL AUTO_INCREMENT,
  `submission_id` int DEFAULT NULL,
  `reporter_user_id` int DEFAULT NULL,
  `reason` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `status` enum('open','reviewed','dismissed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_reports_status` (`status`,`created_at`),
  KEY `idx_reports_submission` (`submission_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CALL add_column_if_missing('new_school_reports', 'submission_id', 'int DEFAULT NULL', 'id');
CALL add_column_if_missing('new_school_reports', 'reporter_user_id', 'int DEFAULT NULL', 'submission_id');
CALL add_column_if_missing('new_school_reports', 'reason', 'varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL', 'reporter_user_id');
CALL add_column_if_missing('new_school_reports', 'notes', 'text COLLATE utf8mb4_unicode_ci', 'reason');
CALL add_column_if_missing('new_school_reports', 'status', 'enum(''open'',''reviewed'',''dismissed'') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''open''', 'notes');
CALL add_column_if_missing('new_school_reports', 'created_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP', 'status');
CALL add_column_if_missing('new_school_reports', 'updated_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'created_at');

-- ---------- new_school_scholarship_answers ----------
CREATE TABLE IF NOT EXISTS `new_school_scholarship_answers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `student_id` int NOT NULL,
  `answers` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_ns_scholarship_student` (`student_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CALL add_column_if_missing('new_school_scholarship_answers', 'student_id', 'int NOT NULL', 'id');
CALL add_column_if_missing('new_school_scholarship_answers', 'answers', 'longtext COLLATE utf8mb4_unicode_ci NOT NULL', 'student_id');
CALL add_column_if_missing('new_school_scholarship_answers', 'completed_at', 'timestamp NULL DEFAULT NULL', 'answers');
CALL add_column_if_missing('new_school_scholarship_answers', 'created_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP', 'completed_at');
CALL add_column_if_missing('new_school_scholarship_answers', 'updated_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'created_at');

-- ---------- new_school_school_rank_snapshots ----------
CREATE TABLE IF NOT EXISTS `new_school_school_rank_snapshots` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `rank_position` int NOT NULL,
  `student_count` int NOT NULL,
  `snapshot_date` date NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_school_snapshot_date` (`school_id`,`snapshot_date`),
  KEY `idx_snapshot_date` (`snapshot_date`),
  CONSTRAINT `fk_school_rank_snapshot_school` FOREIGN KEY (`school_id`) REFERENCES `new_school_schools` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
CALL add_column_if_missing('new_school_school_rank_snapshots', 'school_id', 'int NOT NULL', 'id');
CALL add_column_if_missing('new_school_school_rank_snapshots', 'rank_position', 'int NOT NULL', 'school_id');
CALL add_column_if_missing('new_school_school_rank_snapshots', 'student_count', 'int NOT NULL', 'rank_position');
CALL add_column_if_missing('new_school_school_rank_snapshots', 'snapshot_date', 'date NOT NULL', 'student_count');
CALL add_column_if_missing('new_school_school_rank_snapshots', 'created_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP', 'snapshot_date');

-- ---------- new_school_schools ----------
CREATE TABLE IF NOT EXISTS `new_school_schools` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `school_name` varchar(180) NOT NULL,
  `school_address` varchar(512) NOT NULL,
  `zip_code` varchar(10) DEFAULT NULL,
  `school_district` varchar(180) NOT NULL,
  `main_phone` varchar(40) NOT NULL,
  `principal_name` varchar(120) NOT NULL,
  `administrator_name` varchar(120) NOT NULL,
  `administrator_email` varchar(160) NOT NULL,
  `administrator_phone` varchar(40) NOT NULL,
  `school_website` varchar(255) DEFAULT NULL,
  `status` enum('registered','approved','rejected') NOT NULL DEFAULT 'registered',
  `origin` enum('principal','trendcatch_edu') NOT NULL DEFAULT 'principal',
  `claim_status` enum('claimed','unclaimed') NOT NULL DEFAULT 'claimed',
  `claimed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id` (`user_id`),
  CONSTRAINT `fk_new_school_schools_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
CALL add_column_if_missing('new_school_schools', 'user_id', 'int DEFAULT NULL', 'id');
CALL add_column_if_missing('new_school_schools', 'school_name', 'varchar(180) NOT NULL', 'user_id');
CALL add_column_if_missing('new_school_schools', 'school_address', 'varchar(512) NOT NULL', 'school_name');
CALL add_column_if_missing('new_school_schools', 'zip_code', 'varchar(10) DEFAULT NULL', 'school_address');
CALL add_column_if_missing('new_school_schools', 'school_district', 'varchar(180) NOT NULL', 'zip_code');
CALL add_column_if_missing('new_school_schools', 'main_phone', 'varchar(40) NOT NULL', 'school_district');
CALL add_column_if_missing('new_school_schools', 'principal_name', 'varchar(120) NOT NULL', 'main_phone');
CALL add_column_if_missing('new_school_schools', 'administrator_name', 'varchar(120) NOT NULL', 'principal_name');
CALL add_column_if_missing('new_school_schools', 'administrator_email', 'varchar(160) NOT NULL', 'administrator_name');
CALL add_column_if_missing('new_school_schools', 'administrator_phone', 'varchar(40) NOT NULL', 'administrator_email');
CALL add_column_if_missing('new_school_schools', 'school_website', 'varchar(255) DEFAULT NULL', 'administrator_phone');
CALL add_column_if_missing('new_school_schools', 'status', 'enum(''registered'',''approved'',''rejected'') NOT NULL DEFAULT ''registered''', 'school_website');
CALL add_column_if_missing('new_school_schools', 'origin', 'enum(''principal'',''trendcatch_edu'') NOT NULL DEFAULT ''principal''', 'status');
CALL add_column_if_missing('new_school_schools', 'claim_status', 'enum(''claimed'',''unclaimed'') NOT NULL DEFAULT ''claimed''', 'origin');
CALL add_column_if_missing('new_school_schools', 'claimed_at', 'timestamp NULL DEFAULT NULL', 'claim_status');
CALL add_column_if_missing('new_school_schools', 'created_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP', 'claimed_at');
CALL add_column_if_missing('new_school_schools', 'updated_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'created_at');

-- ---------- new_school_settings ----------
CREATE TABLE IF NOT EXISTS `new_school_settings` (
  `setting_key` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `setting_value` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CALL add_column_if_missing('new_school_settings', 'setting_key', 'varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL', '');
CALL add_column_if_missing('new_school_settings', 'setting_value', 'varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL', 'setting_key');
CALL add_column_if_missing('new_school_settings', 'updated_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'setting_value');

-- ---------- new_school_students ----------
CREATE TABLE IF NOT EXISTS `new_school_students` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `school_id` int DEFAULT NULL,
  `teacher_id` int DEFAULT NULL,
  `participant_id` varchar(40) NOT NULL,
  `qr_token` varchar(80) NOT NULL,
  `qr_url` varchar(255) NOT NULL,
  `referral_code` varchar(40) DEFAULT NULL,
  `referred_by_student_id` int DEFAULT NULL,
  `full_name` varchar(120) NOT NULL,
  `student_username` varchar(80) NOT NULL,
  `age` tinyint unsigned NOT NULL,
  `date_of_birth` date NOT NULL,
  `email` varchar(160) NOT NULL,
  `phone_number` varchar(40) NOT NULL,
  `home_address` varchar(512) NOT NULL,
  `zip_code` varchar(10) DEFAULT NULL,
  `school_name` varchar(180) NOT NULL,
  `grade_level` varchar(60) NOT NULL,
  `parent_name` varchar(120) NOT NULL,
  `parent_phone` varchar(40) NOT NULL,
  `parent_email` varchar(160) NOT NULL,
  `parent_consent_status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `school_approval_status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `teacher_approval_status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `submission_status` enum('locked','eligible','submitted','complete') NOT NULL DEFAULT 'locked',
  `overall_status` enum('student_registered','parent_consent_pending','parent_consent_approved','school_approval_pending','school_approval_approved','teacher_approval_pending','interviews_pending','eligible_to_submit','submission_submitted','submission_complete','rejected') NOT NULL DEFAULT 'student_registered',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id` (`user_id`),
  UNIQUE KEY `participant_id` (`participant_id`),
  UNIQUE KEY `qr_token` (`qr_token`),
  UNIQUE KEY `student_username` (`student_username`),
  KEY `fk_new_school_students_school` (`school_id`),
  KEY `fk_new_school_students_teacher` (`teacher_id`),
  CONSTRAINT `fk_new_school_students_school` FOREIGN KEY (`school_id`) REFERENCES `new_school_schools` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_new_school_students_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `new_school_teachers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_new_school_students_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
CALL add_column_if_missing('new_school_students', 'user_id', 'int NOT NULL', 'id');
CALL add_column_if_missing('new_school_students', 'school_id', 'int DEFAULT NULL', 'user_id');
CALL add_column_if_missing('new_school_students', 'teacher_id', 'int DEFAULT NULL', 'school_id');
CALL add_column_if_missing('new_school_students', 'participant_id', 'varchar(40) NOT NULL', 'teacher_id');
CALL add_column_if_missing('new_school_students', 'qr_token', 'varchar(80) NOT NULL', 'participant_id');
CALL add_column_if_missing('new_school_students', 'qr_url', 'varchar(255) NOT NULL', 'qr_token');
CALL add_column_if_missing('new_school_students', 'referral_code', 'varchar(40) DEFAULT NULL', 'qr_url');
CALL add_column_if_missing('new_school_students', 'referred_by_student_id', 'int DEFAULT NULL', 'referral_code');
CALL add_column_if_missing('new_school_students', 'full_name', 'varchar(120) NOT NULL', 'referred_by_student_id');
CALL add_column_if_missing('new_school_students', 'student_username', 'varchar(80) NOT NULL', 'full_name');
CALL add_column_if_missing('new_school_students', 'age', 'tinyint unsigned NOT NULL', 'student_username');
CALL add_column_if_missing('new_school_students', 'date_of_birth', 'date NOT NULL', 'age');
CALL add_column_if_missing('new_school_students', 'email', 'varchar(160) NOT NULL', 'date_of_birth');
CALL add_column_if_missing('new_school_students', 'phone_number', 'varchar(40) NOT NULL', 'email');
CALL add_column_if_missing('new_school_students', 'home_address', 'varchar(512) NOT NULL', 'phone_number');
CALL add_column_if_missing('new_school_students', 'zip_code', 'varchar(10) DEFAULT NULL', 'home_address');
CALL add_column_if_missing('new_school_students', 'school_name', 'varchar(180) NOT NULL', 'zip_code');
CALL add_column_if_missing('new_school_students', 'grade_level', 'varchar(60) NOT NULL', 'school_name');
CALL add_column_if_missing('new_school_students', 'parent_name', 'varchar(120) NOT NULL', 'grade_level');
CALL add_column_if_missing('new_school_students', 'parent_phone', 'varchar(40) NOT NULL', 'parent_name');
CALL add_column_if_missing('new_school_students', 'parent_email', 'varchar(160) NOT NULL', 'parent_phone');
CALL add_column_if_missing('new_school_students', 'parent_consent_status', 'enum(''pending'',''approved'',''rejected'') NOT NULL DEFAULT ''pending''', 'parent_email');
CALL add_column_if_missing('new_school_students', 'school_approval_status', 'enum(''pending'',''approved'',''rejected'') NOT NULL DEFAULT ''pending''', 'parent_consent_status');
CALL add_column_if_missing('new_school_students', 'teacher_approval_status', 'enum(''pending'',''approved'',''rejected'') NOT NULL DEFAULT ''pending''', 'school_approval_status');
CALL add_column_if_missing('new_school_students', 'submission_status', 'enum(''locked'',''eligible'',''submitted'',''complete'') NOT NULL DEFAULT ''locked''', 'teacher_approval_status');
CALL add_column_if_missing('new_school_students', 'overall_status', 'enum(''student_registered'',''parent_consent_pending'',''parent_consent_approved'',''school_approval_pending'',''school_approval_approved'',''teacher_approval_pending'',''interviews_pending'',''eligible_to_submit'',''submission_submitted'',''submission_complete'',''rejected'') NOT NULL DEFAULT ''student_registered''', 'submission_status');
CALL add_column_if_missing('new_school_students', 'created_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP', 'overall_status');
CALL add_column_if_missing('new_school_students', 'updated_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'created_at');

-- ---------- new_school_submissions ----------
CREATE TABLE IF NOT EXISTS `new_school_submissions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `student_id` int NOT NULL,
  `source_business_id` int DEFAULT NULL,
  `problem_identified` text NOT NULL,
  `why_it_matters` text NOT NULL,
  `proposed_solution` text NOT NULL,
  `how_it_helps` text NOT NULL,
  `expected_impact` text NOT NULL,
  `video_url` varchar(255) DEFAULT NULL,
  `written_url` varchar(255) DEFAULT NULL,
  `ai_note` text,
  `ai_url` varchar(255) DEFAULT NULL,
  `community_note` text,
  `community_url` varchar(255) DEFAULT NULL,
  `submission_date` timestamp NULL DEFAULT NULL,
  `status` enum('draft','submitted','approved','rejected','winner') NOT NULL DEFAULT 'draft',
  `reviewer_notes` text,
  `reviewed_by_user_id` int DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `score` decimal(6,2) DEFAULT NULL,
  `rank_position` tinyint unsigned DEFAULT NULL,
  `is_starred` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `student_id` (`student_id`),
  KEY `fk_new_school_submission_business` (`source_business_id`),
  KEY `fk_new_school_submission_reviewer` (`reviewed_by_user_id`),
  CONSTRAINT `fk_new_school_submission_business` FOREIGN KEY (`source_business_id`) REFERENCES `new_school_business_interviews` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_new_school_submission_reviewer` FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_new_school_submission_student` FOREIGN KEY (`student_id`) REFERENCES `new_school_students` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
CALL add_column_if_missing('new_school_submissions', 'student_id', 'int NOT NULL', 'id');
CALL add_column_if_missing('new_school_submissions', 'source_business_id', 'int DEFAULT NULL', 'student_id');
CALL add_column_if_missing('new_school_submissions', 'problem_identified', 'text NOT NULL', 'source_business_id');
CALL add_column_if_missing('new_school_submissions', 'why_it_matters', 'text NOT NULL', 'problem_identified');
CALL add_column_if_missing('new_school_submissions', 'proposed_solution', 'text NOT NULL', 'why_it_matters');
CALL add_column_if_missing('new_school_submissions', 'how_it_helps', 'text NOT NULL', 'proposed_solution');
CALL add_column_if_missing('new_school_submissions', 'expected_impact', 'text NOT NULL', 'how_it_helps');
CALL add_column_if_missing('new_school_submissions', 'video_url', 'varchar(255) DEFAULT NULL', 'expected_impact');
CALL add_column_if_missing('new_school_submissions', 'written_url', 'varchar(255) DEFAULT NULL', 'video_url');
CALL add_column_if_missing('new_school_submissions', 'ai_note', 'text', 'written_url');
CALL add_column_if_missing('new_school_submissions', 'ai_url', 'varchar(255) DEFAULT NULL', 'ai_note');
CALL add_column_if_missing('new_school_submissions', 'community_note', 'text', 'ai_url');
CALL add_column_if_missing('new_school_submissions', 'community_url', 'varchar(255) DEFAULT NULL', 'community_note');
CALL add_column_if_missing('new_school_submissions', 'submission_date', 'timestamp NULL DEFAULT NULL', 'community_url');
CALL add_column_if_missing('new_school_submissions', 'status', 'enum(''draft'',''submitted'',''approved'',''rejected'',''winner'') NOT NULL DEFAULT ''draft''', 'submission_date');
CALL add_column_if_missing('new_school_submissions', 'reviewer_notes', 'text', 'status');
CALL add_column_if_missing('new_school_submissions', 'reviewed_by_user_id', 'int DEFAULT NULL', 'reviewer_notes');
CALL add_column_if_missing('new_school_submissions', 'reviewed_at', 'timestamp NULL DEFAULT NULL', 'reviewed_by_user_id');
CALL add_column_if_missing('new_school_submissions', 'score', 'decimal(6,2) DEFAULT NULL', 'reviewed_at');
CALL add_column_if_missing('new_school_submissions', 'rank_position', 'tinyint unsigned DEFAULT NULL', 'score');
CALL add_column_if_missing('new_school_submissions', 'is_starred', 'tinyint(1) NOT NULL DEFAULT ''0''', 'rank_position');
CALL add_column_if_missing('new_school_submissions', 'created_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP', 'is_starred');
CALL add_column_if_missing('new_school_submissions', 'updated_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'created_at');

-- ---------- new_school_supporting_materials ----------
CREATE TABLE IF NOT EXISTS `new_school_supporting_materials` (
  `id` int NOT NULL AUTO_INCREMENT,
  `student_id` int NOT NULL,
  `material_type` enum('business_card','photo','storefront_photo','website_screenshot','social_media_screenshot','flyer') COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_url` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `original_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_material_type` (`student_id`,`material_type`),
  CONSTRAINT `fk_supporting_materials_student` FOREIGN KEY (`student_id`) REFERENCES `new_school_students` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CALL add_column_if_missing('new_school_supporting_materials', 'student_id', 'int NOT NULL', 'id');
CALL add_column_if_missing('new_school_supporting_materials', 'material_type', 'enum(''business_card'',''photo'',''storefront_photo'',''website_screenshot'',''social_media_screenshot'',''flyer'') COLLATE utf8mb4_unicode_ci NOT NULL', 'student_id');
CALL add_column_if_missing('new_school_supporting_materials', 'file_url', 'varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL', 'material_type');
CALL add_column_if_missing('new_school_supporting_materials', 'original_name', 'varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL', 'file_url');
CALL add_column_if_missing('new_school_supporting_materials', 'created_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP', 'original_name');
CALL add_column_if_missing('new_school_supporting_materials', 'updated_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'created_at');

-- ---------- new_school_teachers ----------
CREATE TABLE IF NOT EXISTS `new_school_teachers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `school_id` int NOT NULL,
  `teacher_full_name` varchar(120) NOT NULL,
  `school_email` varchar(160) NOT NULL,
  `phone_number` varchar(40) NOT NULL,
  `role_department` varchar(120) NOT NULL,
  `grade_level_supported` varchar(60) NOT NULL,
  `status` enum('registered','approved','rejected') NOT NULL DEFAULT 'registered',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id` (`user_id`),
  KEY `fk_new_school_teachers_school` (`school_id`),
  CONSTRAINT `fk_new_school_teachers_school` FOREIGN KEY (`school_id`) REFERENCES `new_school_schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_new_school_teachers_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
CALL add_column_if_missing('new_school_teachers', 'user_id', 'int NOT NULL', 'id');
CALL add_column_if_missing('new_school_teachers', 'school_id', 'int NOT NULL', 'user_id');
CALL add_column_if_missing('new_school_teachers', 'teacher_full_name', 'varchar(120) NOT NULL', 'school_id');
CALL add_column_if_missing('new_school_teachers', 'school_email', 'varchar(160) NOT NULL', 'teacher_full_name');
CALL add_column_if_missing('new_school_teachers', 'phone_number', 'varchar(40) NOT NULL', 'school_email');
CALL add_column_if_missing('new_school_teachers', 'role_department', 'varchar(120) NOT NULL', 'phone_number');
CALL add_column_if_missing('new_school_teachers', 'grade_level_supported', 'varchar(60) NOT NULL', 'role_department');
CALL add_column_if_missing('new_school_teachers', 'status', 'enum(''registered'',''approved'',''rejected'') NOT NULL DEFAULT ''registered''', 'grade_level_supported');
CALL add_column_if_missing('new_school_teachers', 'created_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP', 'status');
CALL add_column_if_missing('new_school_teachers', 'updated_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'created_at');

-- ---------- new_school_winners ----------
CREATE TABLE IF NOT EXISTS `new_school_winners` (
  `id` int NOT NULL AUTO_INCREMENT,
  `student_id` int NOT NULL,
  `submission_id` int NOT NULL,
  `place` enum('first','second','third') NOT NULL,
  `scholarship_amount` decimal(10,2) NOT NULL,
  `announced_at` timestamp NULL DEFAULT NULL,
  `published_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `submission_id` (`submission_id`),
  KEY `fk_new_school_winners_student` (`student_id`),
  CONSTRAINT `fk_new_school_winners_student` FOREIGN KEY (`student_id`) REFERENCES `new_school_students` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_new_school_winners_submission` FOREIGN KEY (`submission_id`) REFERENCES `new_school_submissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
CALL add_column_if_missing('new_school_winners', 'student_id', 'int NOT NULL', 'id');
CALL add_column_if_missing('new_school_winners', 'submission_id', 'int NOT NULL', 'student_id');
CALL add_column_if_missing('new_school_winners', 'place', 'enum(''first'',''second'',''third'') NOT NULL', 'submission_id');
CALL add_column_if_missing('new_school_winners', 'scholarship_amount', 'decimal(10,2) NOT NULL', 'place');
CALL add_column_if_missing('new_school_winners', 'announced_at', 'timestamp NULL DEFAULT NULL', 'scholarship_amount');
CALL add_column_if_missing('new_school_winners', 'published_at', 'timestamp NULL DEFAULT NULL', 'announced_at');
CALL add_column_if_missing('new_school_winners', 'created_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP', 'published_at');

-- ---------- orders ----------
CREATE TABLE IF NOT EXISTS `orders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `order_no` varchar(20) NOT NULL,
  `user_id` int DEFAULT NULL,
  `customer_name` varchar(120) NOT NULL,
  `email` varchar(160) NOT NULL,
  `address` text,
  `items` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `subtotal` decimal(10,2) NOT NULL DEFAULT '0.00',
  `discount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `shipping` decimal(10,2) NOT NULL DEFAULT '0.00',
  `tax` decimal(10,2) NOT NULL DEFAULT '0.00',
  `total` decimal(10,2) NOT NULL DEFAULT '0.00',
  `payment_method` varchar(30) NOT NULL DEFAULT 'card',
  `payment_provider` varchar(40) DEFAULT NULL,
  `payment_status` enum('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending',
  `payment_session_id` varchar(120) DEFAULT NULL,
  `payment_intent_id` varchar(120) DEFAULT NULL,
  `payment_confirmed_at` timestamp NULL DEFAULT NULL,
  `payment_url` text,
  `payment_error` text,
  `status` enum('paid','pending','fulfilled','cancelled') NOT NULL DEFAULT 'paid',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `order_no` (`order_no`),
  CONSTRAINT `orders_chk_1` CHECK (json_valid(`items`))
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
CALL add_column_if_missing('orders', 'order_no', 'varchar(20) NOT NULL', 'id');
CALL add_column_if_missing('orders', 'user_id', 'int DEFAULT NULL', 'order_no');
CALL add_column_if_missing('orders', 'customer_name', 'varchar(120) NOT NULL', 'user_id');
CALL add_column_if_missing('orders', 'email', 'varchar(160) NOT NULL', 'customer_name');
CALL add_column_if_missing('orders', 'address', 'text', 'email');
CALL add_column_if_missing('orders', 'items', 'longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin', 'address');
CALL add_column_if_missing('orders', 'subtotal', 'decimal(10,2) NOT NULL DEFAULT ''0.00''', 'items');
CALL add_column_if_missing('orders', 'discount', 'decimal(10,2) NOT NULL DEFAULT ''0.00''', 'subtotal');
CALL add_column_if_missing('orders', 'shipping', 'decimal(10,2) NOT NULL DEFAULT ''0.00''', 'discount');
CALL add_column_if_missing('orders', 'tax', 'decimal(10,2) NOT NULL DEFAULT ''0.00''', 'shipping');
CALL add_column_if_missing('orders', 'total', 'decimal(10,2) NOT NULL DEFAULT ''0.00''', 'tax');
CALL add_column_if_missing('orders', 'payment_method', 'varchar(30) NOT NULL DEFAULT ''card''', 'total');
CALL add_column_if_missing('orders', 'payment_provider', 'varchar(40) DEFAULT NULL', 'payment_method');
CALL add_column_if_missing('orders', 'payment_status', 'enum(''pending'',''paid'',''failed'',''refunded'') NOT NULL DEFAULT ''pending''', 'payment_provider');
CALL add_column_if_missing('orders', 'payment_session_id', 'varchar(120) DEFAULT NULL', 'payment_status');
CALL add_column_if_missing('orders', 'payment_intent_id', 'varchar(120) DEFAULT NULL', 'payment_session_id');
CALL add_column_if_missing('orders', 'payment_confirmed_at', 'timestamp NULL DEFAULT NULL', 'payment_intent_id');
CALL add_column_if_missing('orders', 'payment_url', 'text', 'payment_confirmed_at');
CALL add_column_if_missing('orders', 'payment_error', 'text', 'payment_url');
CALL add_column_if_missing('orders', 'status', 'enum(''paid'',''pending'',''fulfilled'',''cancelled'') NOT NULL DEFAULT ''paid''', 'payment_error');
CALL add_column_if_missing('orders', 'created_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP', 'status');
CALL add_column_if_missing('orders', 'updated_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'created_at');

-- ---------- partner_settings ----------
CREATE TABLE IF NOT EXISTS `partner_settings` (
  `setting_key` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `setting_value` text COLLATE utf8mb4_unicode_ci,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CALL add_column_if_missing('partner_settings', 'setting_key', 'varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL', '');
CALL add_column_if_missing('partner_settings', 'setting_value', 'text COLLATE utf8mb4_unicode_ci', 'setting_key');
CALL add_column_if_missing('partner_settings', 'updated_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'setting_value');

-- ---------- partners ----------
CREATE TABLE IF NOT EXISTS `partners` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `logo_url` varchar(400) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `partner_type` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `industry` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `borough` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `county` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `location` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `partner_since` varchar(12) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `website` varchar(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `blurb` text COLLATE utf8mb4_unicode_ci,
  `is_featured` tinyint(1) NOT NULL DEFAULT '0',
  `is_media_partner` tinyint(1) NOT NULL DEFAULT '0',
  `status` enum('draft','published') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'published',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_partners_status` (`status`,`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CALL add_column_if_missing('partners', 'name', 'varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL', 'id');
CALL add_column_if_missing('partners', 'logo_url', 'varchar(400) COLLATE utf8mb4_unicode_ci DEFAULT NULL', 'name');
CALL add_column_if_missing('partners', 'partner_type', 'varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL', 'logo_url');
CALL add_column_if_missing('partners', 'industry', 'varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL', 'partner_type');
CALL add_column_if_missing('partners', 'borough', 'varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL', 'industry');
CALL add_column_if_missing('partners', 'county', 'varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL', 'borough');
CALL add_column_if_missing('partners', 'location', 'varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL', 'county');
CALL add_column_if_missing('partners', 'partner_since', 'varchar(12) COLLATE utf8mb4_unicode_ci DEFAULT NULL', 'location');
CALL add_column_if_missing('partners', 'website', 'varchar(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL', 'partner_since');
CALL add_column_if_missing('partners', 'blurb', 'text COLLATE utf8mb4_unicode_ci', 'website');
CALL add_column_if_missing('partners', 'is_featured', 'tinyint(1) NOT NULL DEFAULT ''0''', 'blurb');
CALL add_column_if_missing('partners', 'is_media_partner', 'tinyint(1) NOT NULL DEFAULT ''0''', 'is_featured');
CALL add_column_if_missing('partners', 'status', 'enum(''draft'',''published'') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''published''', 'is_media_partner');
CALL add_column_if_missing('partners', 'sort_order', 'int NOT NULL DEFAULT ''0''', 'status');
CALL add_column_if_missing('partners', 'created_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP', 'sort_order');
CALL add_column_if_missing('partners', 'updated_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'created_at');

-- ---------- password_resets ----------
CREATE TABLE IF NOT EXISTS `password_resets` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `token_hash` char(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_password_resets_token` (`token_hash`),
  KEY `idx_password_resets_user` (`user_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CALL add_column_if_missing('password_resets', 'user_id', 'int NOT NULL', 'id');
CALL add_column_if_missing('password_resets', 'token_hash', 'char(64) COLLATE utf8mb4_unicode_ci NOT NULL', 'user_id');
CALL add_column_if_missing('password_resets', 'expires_at', 'datetime NOT NULL', 'token_hash');
CALL add_column_if_missing('password_resets', 'used_at', 'datetime DEFAULT NULL', 'expires_at');
CALL add_column_if_missing('password_resets', 'created_at', 'datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'used_at');

-- ---------- posts ----------
CREATE TABLE IF NOT EXISTS `posts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(220) NOT NULL,
  `category` varchar(80) DEFAULT NULL,
  `excerpt` text,
  `body` longtext,
  `cover_image` varchar(255) DEFAULT NULL,
  `is_featured` tinyint(1) NOT NULL DEFAULT '0',
  `published_at` date DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
CALL add_column_if_missing('posts', 'title', 'varchar(220) NOT NULL', 'id');
CALL add_column_if_missing('posts', 'category', 'varchar(80) DEFAULT NULL', 'title');
CALL add_column_if_missing('posts', 'excerpt', 'text', 'category');
CALL add_column_if_missing('posts', 'body', 'longtext', 'excerpt');
CALL add_column_if_missing('posts', 'cover_image', 'varchar(255) DEFAULT NULL', 'body');
CALL add_column_if_missing('posts', 'is_featured', 'tinyint(1) NOT NULL DEFAULT ''0''', 'cover_image');
CALL add_column_if_missing('posts', 'published_at', 'date DEFAULT NULL', 'is_featured');
CALL add_column_if_missing('posts', 'created_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP', 'published_at');

-- ---------- rate_limits ----------
CREATE TABLE IF NOT EXISTS `rate_limits` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `bucket` varchar(140) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rate_bucket` (`bucket`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CALL add_column_if_missing('rate_limits', 'bucket', 'varchar(140) NOT NULL', 'id');
CALL add_column_if_missing('rate_limits', 'created_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP', 'bucket');

-- ---------- requests ----------
CREATE TABLE IF NOT EXISTS `requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `request_type` varchar(120) NOT NULL,
  `full_name` varchar(120) NOT NULL,
  `email` varchar(160) NOT NULL,
  `organization` varchar(160) DEFAULT NULL,
  `message` text,
  `status` enum('new','reviewed','approved','closed') NOT NULL DEFAULT 'new',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
CALL add_column_if_missing('requests', 'request_type', 'varchar(120) NOT NULL', 'id');
CALL add_column_if_missing('requests', 'full_name', 'varchar(120) NOT NULL', 'request_type');
CALL add_column_if_missing('requests', 'email', 'varchar(160) NOT NULL', 'full_name');
CALL add_column_if_missing('requests', 'organization', 'varchar(160) DEFAULT NULL', 'email');
CALL add_column_if_missing('requests', 'message', 'text', 'organization');
CALL add_column_if_missing('requests', 'status', 'enum(''new'',''reviewed'',''approved'',''closed'') NOT NULL DEFAULT ''new''', 'message');
CALL add_column_if_missing('requests', 'created_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP', 'status');

-- ---------- site_visits ----------
CREATE TABLE IF NOT EXISTS `site_visits` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `visitor_token` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `path` varchar(512) COLLATE utf8mb4_unicode_ci NOT NULL,
  `referrer` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `user_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_visits_created` (`created_at`),
  KEY `idx_visits_visitor` (`visitor_token`),
  KEY `idx_visits_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CALL add_column_if_missing('site_visits', 'visitor_token', 'varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL', 'id');
CALL add_column_if_missing('site_visits', 'path', 'varchar(512) COLLATE utf8mb4_unicode_ci NOT NULL', 'visitor_token');
CALL add_column_if_missing('site_visits', 'referrer', 'varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL', 'path');
CALL add_column_if_missing('site_visits', 'user_agent', 'varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL', 'referrer');
CALL add_column_if_missing('site_visits', 'created_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP', 'user_agent');
CALL add_column_if_missing('site_visits', 'user_id', 'int DEFAULT NULL', 'created_at');

-- ---------- sponsor_applications ----------
CREATE TABLE IF NOT EXISTS `sponsor_applications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `program_id` int NOT NULL,
  `organization_name` varchar(180) NOT NULL,
  `contact_person` varchar(160) NOT NULL,
  `title_position` varchar(160) DEFAULT NULL,
  `email_address` varchar(160) NOT NULL,
  `phone_number` varchar(60) NOT NULL,
  `website` varchar(255) DEFAULT NULL,
  `street_address` varchar(255) NOT NULL,
  `city` varchar(120) NOT NULL,
  `state` varchar(120) NOT NULL,
  `zip_code` varchar(30) NOT NULL,
  `organization_type` varchar(120) NOT NULL,
  `logo_url` varchar(255) DEFAULT NULL,
  `company_bio` text NOT NULL,
  `support_reason` text NOT NULL,
  `sponsorship_level_slug` varchar(80) NOT NULL,
  `sponsorship_level_name` varchar(120) NOT NULL,
  `sponsorship_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `custom_amount` tinyint(1) NOT NULL DEFAULT '0',
  `interests_json` longtext,
  `public_description` text,
  `admin_notes` text,
  `payment_status` enum('pending_check','check_received','payment_confirmed') NOT NULL DEFAULT 'pending_check',
  `approval_status` enum('pending_review','approved','rejected','published') NOT NULL DEFAULT 'pending_review',
  `reviewed_by_user_id` int DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `rejected_at` timestamp NULL DEFAULT NULL,
  `check_received_at` timestamp NULL DEFAULT NULL,
  `payment_confirmed_at` timestamp NULL DEFAULT NULL,
  `published_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sponsor_applications_program` (`program_id`,`created_at`),
  KEY `idx_sponsor_applications_status` (`approval_status`,`payment_status`,`created_at`),
  KEY `idx_sponsor_applications_level` (`sponsorship_level_slug`,`sponsorship_amount`),
  KEY `fk_sponsor_applications_reviewer` (`reviewed_by_user_id`),
  CONSTRAINT `fk_sponsor_applications_program` FOREIGN KEY (`program_id`) REFERENCES `sponsor_programs` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sponsor_applications_reviewer` FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
CALL add_column_if_missing('sponsor_applications', 'program_id', 'int NOT NULL', 'id');
CALL add_column_if_missing('sponsor_applications', 'organization_name', 'varchar(180) NOT NULL', 'program_id');
CALL add_column_if_missing('sponsor_applications', 'contact_person', 'varchar(160) NOT NULL', 'organization_name');
CALL add_column_if_missing('sponsor_applications', 'title_position', 'varchar(160) DEFAULT NULL', 'contact_person');
CALL add_column_if_missing('sponsor_applications', 'email_address', 'varchar(160) NOT NULL', 'title_position');
CALL add_column_if_missing('sponsor_applications', 'phone_number', 'varchar(60) NOT NULL', 'email_address');
CALL add_column_if_missing('sponsor_applications', 'website', 'varchar(255) DEFAULT NULL', 'phone_number');
CALL add_column_if_missing('sponsor_applications', 'street_address', 'varchar(255) NOT NULL', 'website');
CALL add_column_if_missing('sponsor_applications', 'city', 'varchar(120) NOT NULL', 'street_address');
CALL add_column_if_missing('sponsor_applications', 'state', 'varchar(120) NOT NULL', 'city');
CALL add_column_if_missing('sponsor_applications', 'zip_code', 'varchar(30) NOT NULL', 'state');
CALL add_column_if_missing('sponsor_applications', 'organization_type', 'varchar(120) NOT NULL', 'zip_code');
CALL add_column_if_missing('sponsor_applications', 'logo_url', 'varchar(255) DEFAULT NULL', 'organization_type');
CALL add_column_if_missing('sponsor_applications', 'company_bio', 'text NOT NULL', 'logo_url');
CALL add_column_if_missing('sponsor_applications', 'support_reason', 'text NOT NULL', 'company_bio');
CALL add_column_if_missing('sponsor_applications', 'sponsorship_level_slug', 'varchar(80) NOT NULL', 'support_reason');
CALL add_column_if_missing('sponsor_applications', 'sponsorship_level_name', 'varchar(120) NOT NULL', 'sponsorship_level_slug');
CALL add_column_if_missing('sponsor_applications', 'sponsorship_amount', 'decimal(12,2) NOT NULL DEFAULT ''0.00''', 'sponsorship_level_name');
CALL add_column_if_missing('sponsor_applications', 'custom_amount', 'tinyint(1) NOT NULL DEFAULT ''0''', 'sponsorship_amount');
CALL add_column_if_missing('sponsor_applications', 'interests_json', 'longtext', 'custom_amount');
CALL add_column_if_missing('sponsor_applications', 'public_description', 'text', 'interests_json');
CALL add_column_if_missing('sponsor_applications', 'admin_notes', 'text', 'public_description');
CALL add_column_if_missing('sponsor_applications', 'payment_status', 'enum(''pending_check'',''check_received'',''payment_confirmed'') NOT NULL DEFAULT ''pending_check''', 'admin_notes');
CALL add_column_if_missing('sponsor_applications', 'approval_status', 'enum(''pending_review'',''approved'',''rejected'',''published'') NOT NULL DEFAULT ''pending_review''', 'payment_status');
CALL add_column_if_missing('sponsor_applications', 'reviewed_by_user_id', 'int DEFAULT NULL', 'approval_status');
CALL add_column_if_missing('sponsor_applications', 'reviewed_at', 'timestamp NULL DEFAULT NULL', 'reviewed_by_user_id');
CALL add_column_if_missing('sponsor_applications', 'approved_at', 'timestamp NULL DEFAULT NULL', 'reviewed_at');
CALL add_column_if_missing('sponsor_applications', 'rejected_at', 'timestamp NULL DEFAULT NULL', 'approved_at');
CALL add_column_if_missing('sponsor_applications', 'check_received_at', 'timestamp NULL DEFAULT NULL', 'rejected_at');
CALL add_column_if_missing('sponsor_applications', 'payment_confirmed_at', 'timestamp NULL DEFAULT NULL', 'check_received_at');
CALL add_column_if_missing('sponsor_applications', 'published_at', 'timestamp NULL DEFAULT NULL', 'payment_confirmed_at');
CALL add_column_if_missing('sponsor_applications', 'created_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP', 'published_at');
CALL add_column_if_missing('sponsor_applications', 'updated_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'created_at');

-- ---------- sponsor_programs ----------
CREATE TABLE IF NOT EXISTS `sponsor_programs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `slug` varchar(160) NOT NULL,
  `name` varchar(220) NOT NULL,
  `edition_name` varchar(220) DEFAULT NULL,
  `headline` varchar(220) NOT NULL,
  `subheadline` text NOT NULL,
  `registration_opens` date DEFAULT NULL,
  `winners_announced` date DEFAULT NULL,
  `school_impact_grant_amount` decimal(12,2) NOT NULL DEFAULT '25000.00',
  `student_scholarship_amount` decimal(12,2) NOT NULL DEFAULT '10000.00',
  `educator_award_label` varchar(220) NOT NULL,
  `age_range` varchar(40) NOT NULL DEFAULT '11-19',
  `grade_range` varchar(40) NOT NULL DEFAULT '6-12',
  `is_active` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`),
  KEY `idx_sponsor_programs_active` (`is_active`,`registration_opens`,`winners_announced`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
CALL add_column_if_missing('sponsor_programs', 'slug', 'varchar(160) NOT NULL', 'id');
CALL add_column_if_missing('sponsor_programs', 'name', 'varchar(220) NOT NULL', 'slug');
CALL add_column_if_missing('sponsor_programs', 'edition_name', 'varchar(220) DEFAULT NULL', 'name');
CALL add_column_if_missing('sponsor_programs', 'headline', 'varchar(220) NOT NULL', 'edition_name');
CALL add_column_if_missing('sponsor_programs', 'subheadline', 'text NOT NULL', 'headline');
CALL add_column_if_missing('sponsor_programs', 'registration_opens', 'date DEFAULT NULL', 'subheadline');
CALL add_column_if_missing('sponsor_programs', 'winners_announced', 'date DEFAULT NULL', 'registration_opens');
CALL add_column_if_missing('sponsor_programs', 'school_impact_grant_amount', 'decimal(12,2) NOT NULL DEFAULT ''25000.00''', 'winners_announced');
CALL add_column_if_missing('sponsor_programs', 'student_scholarship_amount', 'decimal(12,2) NOT NULL DEFAULT ''10000.00''', 'school_impact_grant_amount');
CALL add_column_if_missing('sponsor_programs', 'educator_award_label', 'varchar(220) NOT NULL', 'student_scholarship_amount');
CALL add_column_if_missing('sponsor_programs', 'age_range', 'varchar(40) NOT NULL DEFAULT ''11-19''', 'educator_award_label');
CALL add_column_if_missing('sponsor_programs', 'grade_range', 'varchar(40) NOT NULL DEFAULT ''6-12''', 'age_range');
CALL add_column_if_missing('sponsor_programs', 'is_active', 'tinyint(1) NOT NULL DEFAULT ''0''', 'grade_range');
CALL add_column_if_missing('sponsor_programs', 'created_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP', 'is_active');
CALL add_column_if_missing('sponsor_programs', 'updated_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'created_at');

-- ---------- sponsorship_levels ----------
CREATE TABLE IF NOT EXISTS `sponsorship_levels` (
  `id` int NOT NULL AUTO_INCREMENT,
  `program_id` int NOT NULL,
  `slug` varchar(80) NOT NULL,
  `name` varchar(120) NOT NULL,
  `minimum_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_sponsorship_level` (`program_id`,`slug`),
  CONSTRAINT `fk_sponsorship_levels_program` FOREIGN KEY (`program_id`) REFERENCES `sponsor_programs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
CALL add_column_if_missing('sponsorship_levels', 'program_id', 'int NOT NULL', 'id');
CALL add_column_if_missing('sponsorship_levels', 'slug', 'varchar(80) NOT NULL', 'program_id');
CALL add_column_if_missing('sponsorship_levels', 'name', 'varchar(120) NOT NULL', 'slug');
CALL add_column_if_missing('sponsorship_levels', 'minimum_amount', 'decimal(12,2) NOT NULL DEFAULT ''0.00''', 'name');
CALL add_column_if_missing('sponsorship_levels', 'sort_order', 'int NOT NULL DEFAULT ''0''', 'minimum_amount');
CALL add_column_if_missing('sponsorship_levels', 'created_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP', 'sort_order');

-- ---------- store_inventory ----------
CREATE TABLE IF NOT EXISTS `store_inventory` (
  `product_id` varchar(40) NOT NULL,
  `name` varchar(160) DEFAULT NULL,
  `category` varchar(80) DEFAULT NULL,
  `tagline` varchar(180) DEFAULT NULL,
  `description` text,
  `details` text,
  `feature_list` text,
  `spec_list` text,
  `shipping_note` varchar(180) DEFAULT NULL,
  `image` varchar(255) DEFAULT NULL,
  `price` decimal(10,2) DEFAULT NULL,
  `stock` int NOT NULL DEFAULT '0',
  `low_stock_threshold` int NOT NULL DEFAULT '5',
  `restock_note` varchar(180) DEFAULT NULL,
  `visibility` enum('live','upcoming','hidden') NOT NULL DEFAULT 'live',
  `sort_order` int NOT NULL DEFAULT '0',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
CALL add_column_if_missing('store_inventory', 'product_id', 'varchar(40) NOT NULL', '');
CALL add_column_if_missing('store_inventory', 'name', 'varchar(160) DEFAULT NULL', 'product_id');
CALL add_column_if_missing('store_inventory', 'category', 'varchar(80) DEFAULT NULL', 'name');
CALL add_column_if_missing('store_inventory', 'tagline', 'varchar(180) DEFAULT NULL', 'category');
CALL add_column_if_missing('store_inventory', 'description', 'text', 'tagline');
CALL add_column_if_missing('store_inventory', 'details', 'text', 'description');
CALL add_column_if_missing('store_inventory', 'feature_list', 'text', 'details');
CALL add_column_if_missing('store_inventory', 'spec_list', 'text', 'feature_list');
CALL add_column_if_missing('store_inventory', 'shipping_note', 'varchar(180) DEFAULT NULL', 'spec_list');
CALL add_column_if_missing('store_inventory', 'image', 'varchar(255) DEFAULT NULL', 'shipping_note');
CALL add_column_if_missing('store_inventory', 'price', 'decimal(10,2) DEFAULT NULL', 'image');
CALL add_column_if_missing('store_inventory', 'stock', 'int NOT NULL DEFAULT ''0''', 'price');
CALL add_column_if_missing('store_inventory', 'low_stock_threshold', 'int NOT NULL DEFAULT ''5''', 'stock');
CALL add_column_if_missing('store_inventory', 'restock_note', 'varchar(180) DEFAULT NULL', 'low_stock_threshold');
CALL add_column_if_missing('store_inventory', 'visibility', 'enum(''live'',''upcoming'',''hidden'') NOT NULL DEFAULT ''live''', 'restock_note');
CALL add_column_if_missing('store_inventory', 'sort_order', 'int NOT NULL DEFAULT ''0''', 'visibility');
CALL add_column_if_missing('store_inventory', 'updated_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'sort_order');

-- ---------- store_inventory_state ----------
CREATE TABLE IF NOT EXISTS `store_inventory_state` (
  `state_key` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `state_value` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`state_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CALL add_column_if_missing('store_inventory_state', 'state_key', 'varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL', '');
CALL add_column_if_missing('store_inventory_state', 'state_value', 'varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL', 'state_key');
CALL add_column_if_missing('store_inventory_state', 'updated_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'state_value');

-- ---------- subscribers ----------
CREATE TABLE IF NOT EXISTS `subscribers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(160) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
CALL add_column_if_missing('subscribers', 'email', 'varchar(160) NOT NULL', 'id');
CALL add_column_if_missing('subscribers', 'created_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP', 'email');

-- ---------- terms_acceptances ----------
CREATE TABLE IF NOT EXISTS `terms_acceptances` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `user_name` varchar(180) NOT NULL,
  `email` varchar(160) NOT NULL,
  `role` varchar(40) DEFAULT NULL,
  `accept_type` enum('challenge_role','general_platform','website') NOT NULL,
  `terms_version` varchar(120) NOT NULL,
  `signature_name` varchar(180) DEFAULT NULL,
  `document_label` varchar(200) DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` varchar(500) DEFAULT NULL,
  `accepted_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_terms_user` (`user_id`,`accepted_at`),
  KEY `idx_terms_email` (`email`,`accepted_at`),
  KEY `idx_terms_type_version` (`accept_type`,`terms_version`,`accepted_at`),
  CONSTRAINT `fk_terms_acceptances_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
CALL add_column_if_missing('terms_acceptances', 'user_id', 'int DEFAULT NULL', 'id');
CALL add_column_if_missing('terms_acceptances', 'user_name', 'varchar(180) NOT NULL', 'user_id');
CALL add_column_if_missing('terms_acceptances', 'email', 'varchar(160) NOT NULL', 'user_name');
CALL add_column_if_missing('terms_acceptances', 'role', 'varchar(40) DEFAULT NULL', 'email');
CALL add_column_if_missing('terms_acceptances', 'accept_type', 'enum(''challenge_role'',''general_platform'',''website'') NOT NULL', 'role');
CALL add_column_if_missing('terms_acceptances', 'terms_version', 'varchar(120) NOT NULL', 'accept_type');
CALL add_column_if_missing('terms_acceptances', 'signature_name', 'varchar(180) DEFAULT NULL', 'terms_version');
CALL add_column_if_missing('terms_acceptances', 'document_label', 'varchar(200) DEFAULT NULL', 'signature_name');
CALL add_column_if_missing('terms_acceptances', 'ip_address', 'varchar(45) DEFAULT NULL', 'document_label');
CALL add_column_if_missing('terms_acceptances', 'user_agent', 'varchar(500) DEFAULT NULL', 'ip_address');
CALL add_column_if_missing('terms_acceptances', 'accepted_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP', 'user_agent');
CALL add_column_if_missing('terms_acceptances', 'created_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP', 'accepted_at');

-- ---------- testimonials ----------
CREATE TABLE IF NOT EXISTS `testimonials` (
  `id` int NOT NULL AUTO_INCREMENT,
  `quote` text NOT NULL,
  `author_name` varchar(120) NOT NULL,
  `author_title` varchar(120) DEFAULT NULL,
  `company` varchar(160) DEFAULT NULL,
  `image` varchar(255) DEFAULT NULL,
  `is_featured` tinyint(1) NOT NULL DEFAULT '0',
  `sort_order` int DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
CALL add_column_if_missing('testimonials', 'quote', 'text NOT NULL', 'id');
CALL add_column_if_missing('testimonials', 'author_name', 'varchar(120) NOT NULL', 'quote');
CALL add_column_if_missing('testimonials', 'author_title', 'varchar(120) DEFAULT NULL', 'author_name');
CALL add_column_if_missing('testimonials', 'company', 'varchar(160) DEFAULT NULL', 'author_title');
CALL add_column_if_missing('testimonials', 'image', 'varchar(255) DEFAULT NULL', 'company');
CALL add_column_if_missing('testimonials', 'is_featured', 'tinyint(1) NOT NULL DEFAULT ''0''', 'image');
CALL add_column_if_missing('testimonials', 'sort_order', 'int DEFAULT ''0''', 'is_featured');
CALL add_column_if_missing('testimonials', 'created_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP', 'sort_order');

-- ---------- users ----------
CREATE TABLE IF NOT EXISTS `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `full_name` varchar(120) NOT NULL,
  `email` varchar(160) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `avatar_url` varchar(255) DEFAULT NULL,
  `role` enum('member','vip','editor','admin','super_admin','student','parent','school','teacher','judge','business','sponsor','partner','media','volunteer') NOT NULL DEFAULT 'member',
  `referred_by_code` varchar(24) DEFAULT NULL,
  `email_verified_at` timestamp NULL DEFAULT NULL,
  `approval_status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `approval_note` text,
  `approval_reviewed_by_user_id` int DEFAULT NULL,
  `approval_reviewed_at` timestamp NULL DEFAULT NULL,
  `email_verification_otp_hash` varchar(255) DEFAULT NULL,
  `email_verification_otp_expires_at` timestamp NULL DEFAULT NULL,
  `email_verification_otp_sent_at` timestamp NULL DEFAULT NULL,
  `email_verification_otp_attempts` int NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_users_refby` (`referred_by_code`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
CALL add_column_if_missing('users', 'full_name', 'varchar(120) NOT NULL', 'id');
CALL add_column_if_missing('users', 'email', 'varchar(160) NOT NULL', 'full_name');
CALL add_column_if_missing('users', 'password_hash', 'varchar(255) NOT NULL', 'email');
CALL add_column_if_missing('users', 'avatar_url', 'varchar(255) DEFAULT NULL', 'password_hash');
CALL add_column_if_missing('users', 'role', 'enum(''member'',''vip'',''editor'',''admin'',''super_admin'',''student'',''parent'',''school'',''teacher'',''judge'',''business'',''sponsor'',''partner'',''media'',''volunteer'') NOT NULL DEFAULT ''member''', 'avatar_url');
CALL add_column_if_missing('users', 'referred_by_code', 'varchar(24) DEFAULT NULL', 'role');
CALL add_column_if_missing('users', 'email_verified_at', 'timestamp NULL DEFAULT NULL', 'referred_by_code');
CALL add_column_if_missing('users', 'approval_status', 'enum(''pending'',''approved'',''rejected'') NOT NULL DEFAULT ''pending''', 'email_verified_at');
CALL add_column_if_missing('users', 'approval_note', 'text', 'approval_status');
CALL add_column_if_missing('users', 'approval_reviewed_by_user_id', 'int DEFAULT NULL', 'approval_note');
CALL add_column_if_missing('users', 'approval_reviewed_at', 'timestamp NULL DEFAULT NULL', 'approval_reviewed_by_user_id');
CALL add_column_if_missing('users', 'email_verification_otp_hash', 'varchar(255) DEFAULT NULL', 'approval_reviewed_at');
CALL add_column_if_missing('users', 'email_verification_otp_expires_at', 'timestamp NULL DEFAULT NULL', 'email_verification_otp_hash');
CALL add_column_if_missing('users', 'email_verification_otp_sent_at', 'timestamp NULL DEFAULT NULL', 'email_verification_otp_expires_at');
CALL add_column_if_missing('users', 'email_verification_otp_attempts', 'int NOT NULL DEFAULT ''0''', 'email_verification_otp_sent_at');
CALL add_column_if_missing('users', 'created_at', 'timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP', 'email_verification_otp_attempts');
CALL add_column_if_missing('users', 'updated_at', 'timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'created_at');

-- ---------- ENUM / nullability upgrades for existing databases ----------
-- CREATE TABLE only defines these for a FRESH install; an OLDER table keeps
-- its narrower ENUM until explicitly widened here. All statements are
-- idempotent (re-applying the same definition is a no-op).

ALTER TABLE users
  MODIFY role ENUM('member','vip','editor','admin','super_admin','student','parent','school','teacher','judge','business','sponsor','partner','media','volunteer') NOT NULL DEFAULT 'member';

ALTER TABLE new_school_schools  MODIFY user_id INT NULL;
ALTER TABLE new_school_schools
  MODIFY status ENUM('registered','approved','rejected') NOT NULL DEFAULT 'registered';
ALTER TABLE new_school_teachers
  MODIFY status ENUM('registered','approved','rejected') NOT NULL DEFAULT 'registered';
ALTER TABLE new_school_students
  MODIFY overall_status ENUM('student_registered','parent_consent_pending','parent_consent_approved','school_approval_pending','school_approval_approved','teacher_approval_pending','interviews_pending','eligible_to_submit','submission_submitted','submission_complete','rejected') NOT NULL DEFAULT 'student_registered';
ALTER TABLE new_school_points MODIFY source_type ENUM('interview','project','referral') NOT NULL;

DROP PROCEDURE IF EXISTS add_column_if_missing;
SET FOREIGN_KEY_CHECKS = 1;
