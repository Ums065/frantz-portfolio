-- ============================================================
-- FrantzCoutard.com — migration for the Judge role + multi-judge scoring.
-- Safe + idempotent. Run once on the LIVE database:
--   mysql -u <user> -p <database> < db/add-judge-scoring.sql
-- (or paste into phpMyAdmin > SQL for the live database)
-- ============================================================

-- 1) Add the 'judge' role to the users ENUM (idempotent - re-applies same type).
ALTER TABLE users
  MODIFY role ENUM('member','vip','editor','admin','super_admin','student','parent','school','teacher','judge') NOT NULL DEFAULT 'member';

-- 2) Judge profiles (admin-created accounts with role = 'judge').
CREATE TABLE IF NOT EXISTS new_school_judges (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL UNIQUE,
  display_name  VARCHAR(120) NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_new_school_judges_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3) One rubric score row per judge per submission.
CREATE TABLE IF NOT EXISTS new_school_judge_scores (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  submission_id      INT NOT NULL,
  judge_user_id      INT NOT NULL,
  problem            TINYINT UNSIGNED NOT NULL DEFAULT 0,  -- 0-20
  solution           TINYINT UNSIGNED NOT NULL DEFAULT 0,  -- 0-50
  creativity         TINYINT UNSIGNED NOT NULL DEFAULT 0,  -- 0-20
  supporting_evidence TINYINT UNSIGNED NOT NULL DEFAULT 0, -- 0-10
  community_impact   TINYINT UNSIGNED NOT NULL DEFAULT 0,  -- 0-20
  presentation       TINYINT UNSIGNED NOT NULL DEFAULT 0,  -- 0-15
  total              INT NOT NULL DEFAULT 0,               -- sum of the six (max 135)
  notes              TEXT DEFAULT NULL,
  status             ENUM('draft','submitted') NOT NULL DEFAULT 'draft',
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_judge_submission (submission_id, judge_user_id),
  KEY idx_judge_scores_submission (submission_id, status),
  KEY idx_judge_scores_judge (judge_user_id, status),
  CONSTRAINT fk_judge_scores_submission FOREIGN KEY (submission_id) REFERENCES new_school_submissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_judge_scores_judge FOREIGN KEY (judge_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
