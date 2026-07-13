-- ============================================================
-- FrantzCoutard.com — Database Schema
-- MySQL / MariaDB (WAMP)
-- ============================================================

CREATE DATABASE IF NOT EXISTS frantz_portfolio
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE frantz_portfolio;

-- ---------- Users / Members ----------
CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  full_name     VARCHAR(120) NOT NULL,
  email         VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  avatar_url    VARCHAR(255) DEFAULT NULL,
  role          ENUM('member','vip','editor','admin','super_admin','student','parent','school','teacher','judge','business','sponsor','partner','media','volunteer') NOT NULL DEFAULT 'member',
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

-- ---------- Newsletter subscribers ----------
CREATE TABLE IF NOT EXISTS subscribers (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  email      VARCHAR(160) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------- Generic requests / applications ----------
-- Covers: Speaking, Media Kit, Interview, Event Coverage, Pin,
-- Giveaway, Challenge, Broker Academy, Mentorship, Sponsor, Invite, Partner
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

-- ---------- Events ----------

CREATE TABLE IF NOT EXISTS gallery_submissions (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  user_id        INT DEFAULT NULL,
  submitter_name VARCHAR(160) NOT NULL,
  submitter_email VARCHAR(160) NOT NULL,
  organization   VARCHAR(180) DEFAULT NULL,
  message        TEXT DEFAULT NULL,
  overall_status ENUM('pending_review','partially_approved','approved','rejected') NOT NULL DEFAULT 'pending_review',
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_gallery_submissions_status (overall_status, created_at),
  INDEX idx_gallery_submissions_user (user_id, created_at),
  CONSTRAINT fk_gallery_submission_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS gallery_submission_files (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  submission_id    INT NOT NULL,
  original_name    VARCHAR(255) NOT NULL,
  display_title    VARCHAR(180) NOT NULL,
  file_url         VARCHAR(255) NOT NULL,
  mime_type        VARCHAR(120) NOT NULL,
  media_kind       ENUM('image','video') NOT NULL,
  size_bytes       BIGINT NOT NULL DEFAULT 0,
  approval_status  ENUM('pending_review','approved','rejected') NOT NULL DEFAULT 'pending_review',
  reviewed_by_user_id INT DEFAULT NULL,
  reviewed_by_name VARCHAR(160) DEFAULT NULL,
  reviewed_at      TIMESTAMP NULL DEFAULT NULL,
  approved_at      TIMESTAMP NULL DEFAULT NULL,
  rejected_at      TIMESTAMP NULL DEFAULT NULL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_gallery_submission_files_submission (submission_id, created_at),
  INDEX idx_gallery_submission_files_status (approval_status, media_kind, created_at),
  CONSTRAINT fk_gallery_submission_files_submission
    FOREIGN KEY (submission_id) REFERENCES gallery_submissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_gallery_submission_files_reviewer
    FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
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

-- ---------- Awards ----------
-- NOTE: the full seed (10 recognitions) lives in db/awards.sql, which
-- drops & recreates this table. Load it after schema.sql.
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

-- ---------- Blog / News posts ----------
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

-- ---------- Media center items ----------
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

-- ---------- Testimonials ----------
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

-- ---------- Community board ----------
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

-- ---------- Event RSVPs ----------
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

-- ---------- Store inventory ----------
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

-- ---------- Contact messages ----------
CREATE TABLE IF NOT EXISTS contact_messages (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  full_name  VARCHAR(120) NOT NULL,
  email      VARCHAR(160) NOT NULL,
  message    TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------- Mail outbox ----------
-- Queue used for verification and notification mail so requests stay fast.
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

-- ---------- Sponsor program management ----------
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

-- ---------- Terms & Conditions acceptance audit ----------
-- Site-wide acceptance log for registration role terms, the general platform
-- acknowledgment, and the website Terms of Use & Privacy Notice. New-school-specific
-- tables (points ledger, ranking snapshots) live in db/new_school_additions.sql.
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

-- ---------- Ecosystem role portals (Sponsor / Partner / Media / Volunteer) ----------
-- Self-registering ecosystem accounts + shared admin-issued documents, opportunity
-- requests, and role-targeted announcements. Also created self-healing by
-- ecosystem_ensure_schema() / ecosystem_shared_ensure_schema() in api/lib.php.
CREATE TABLE IF NOT EXISTS ecosystem_accounts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  role VARCHAR(20) NOT NULL,
  org_name VARCHAR(160) NOT NULL,
  contact_name VARCHAR(120) DEFAULT NULL,
  contact_phone VARCHAR(40) DEFAULT NULL,
  website VARCHAR(255) DEFAULT NULL,
  about TEXT DEFAULT NULL,
  details TEXT DEFAULT NULL,
  referral_code VARCHAR(24) DEFAULT NULL,
  referred_by_code VARCHAR(24) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_eco_role (role),
  INDEX idx_eco_refby (referred_by_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ecosystem_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  role VARCHAR(20) NOT NULL,
  doc_type VARCHAR(40) NOT NULL DEFAULT 'document',
  label VARCHAR(160) NOT NULL,
  file_url VARCHAR(400) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ecodoc_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ecosystem_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  role VARCHAR(20) NOT NULL,
  req_type VARCHAR(30) NOT NULL,
  message TEXT DEFAULT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  admin_note TEXT DEFAULT NULL,
  reviewed_by_user_id INT DEFAULT NULL,
  reviewed_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ecoreq_user (user_id),
  INDEX idx_ecoreq_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ecosystem_announcements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  audience VARCHAR(20) NOT NULL DEFAULT 'all',
  title VARCHAR(180) NOT NULL,
  body TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ecoann_aud (audience)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Business dashboard ----------
-- Self-registering business accounts + the opportunity requests they raise.
-- Businesses cannot score students. Created self-healing by business_ensure_schema()
-- in api/lib.php, which also adds the business_user_id / business_website link columns
-- to new_school_business_interviews (see db/new_school.sql + db/update.sql).
CREATE TABLE IF NOT EXISTS business_accounts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  business_name VARCHAR(160) NOT NULL,
  category VARCHAR(80) DEFAULT NULL,
  borough VARCHAR(60) DEFAULT NULL,
  contact_name VARCHAR(120) DEFAULT NULL,
  contact_phone VARCHAR(40) DEFAULT NULL,
  website VARCHAR(255) DEFAULT NULL,
  about TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_business_name (business_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS business_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  business_user_id INT NOT NULL,
  request_type VARCHAR(24) NOT NULL,
  submission_id INT DEFAULT NULL,
  student_id INT DEFAULT NULL,
  student_name VARCHAR(120) DEFAULT NULL,
  school_name VARCHAR(180) DEFAULT NULL,
  message TEXT DEFAULT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  admin_note TEXT DEFAULT NULL,
  reviewed_by_user_id INT DEFAULT NULL,
  reviewed_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_breq_biz (business_user_id),
  INDEX idx_breq_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Our Partners content page (dynamic, admin-editable) ----------
-- Distinct from the ecosystem Partner login dashboard. Created self-healing by
-- partners_ensure_schema() in api/lib.php; seeded on first /api/partners hit.
CREATE TABLE IF NOT EXISTS partners (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  logo_url VARCHAR(400) DEFAULT NULL,
  partner_type VARCHAR(60) DEFAULT NULL,
  industry VARCHAR(60) DEFAULT NULL,
  borough VARCHAR(60) DEFAULT NULL,
  county VARCHAR(60) DEFAULT NULL,
  location VARCHAR(120) DEFAULT NULL,
  partner_since VARCHAR(12) DEFAULT NULL,
  website VARCHAR(300) DEFAULT NULL,
  blurb TEXT DEFAULT NULL,
  is_featured TINYINT(1) NOT NULL DEFAULT 0,
  is_media_partner TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('draft','published') NOT NULL DEFAULT 'published',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_partners_status (status, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS partner_settings (
  setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
  setting_value TEXT DEFAULT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SEED DATA (matches the design content)
-- ============================================================

INSERT INTO events (title, location, role, event_date, is_past) VALUES
  ('Tech For Good Summit',        'New York, NY',    'Keynote Speaker',  '2026-06-28', 0),
  ('Community Leadership Forum',  'Long Island, NY', 'Panelist',         '2026-07-19', 0),
  ('TrendCatch Network Launch',   'New York, NY',    'Founder Keynote',  '2026-08-15', 0);

-- Awards are seeded by db/awards.sql (10 recognitions). Load it after this file.

INSERT INTO posts (title, category, excerpt, body, is_featured, published_at) VALUES
  ('Why the Future of Local Commerce Is Community-Owned', 'Featured',
   'Frantz lays out the vision behind TrendCatch Network — and why the next operating system for business has to start with people, not platforms.',
   'For too long, the technology that powers commerce has been built for large corporations and national brands — leaving local businesses, the heartbeat of every community, to compete with one hand tied behind their back.\n\nTrendCatch Network was born from a simple conviction: every community deserves access to the same tools the giants use. A local commerce operating system that connects businesses, consumers, schools, nonprofits, and retailers through one integrated ecosystem.\n\nWhen commerce is community-owned, the value stays local. Dollars circulate. Neighbors support neighbors. Opportunity becomes something a whole town can share — not something extracted from it. That is the future we are building, and it starts with people, not platforms.',
   1, '2026-06-01'),
  ('AI, Small Business, and the Tools That Level the Field', 'Tech News',
   'A look at the technology trends putting enterprise power into the hands of local founders.',
   'Artificial intelligence is no longer a luxury reserved for companies with deep pockets. The same capabilities that once required entire data teams are now available to a one-person shop on Main Street.\n\nFrom smarter advertising and customer insights to automated campaign performance, AI is quietly leveling the playing field. The businesses that learn to wield it will not just survive — they will lead.\n\nAt TrendCatch, we believe the role of technology is to amplify people, not replace them. Used well, AI gives local founders the leverage to focus on what they do best: serving their community.',
   0, '2026-05-01'),
  ('From Nothing to Something: An Immigrant''s Blueprint', 'My Story',
   'The lessons that took Frantz from humble beginnings to building companies that serve thousands.',
   'I arrived in the United States in 1997 from Haiti, without speaking English, and experienced firsthand the challenges that immigrant and underserved families face every day.\n\nWhat I lacked in resources, I made up for in faith, perseverance, and a refusal to quit. Every closed door taught me something. Every setback sharpened the vision. Slowly, a passion for entrepreneurship, technology, and community development took shape.\n\nThe blueprint was never complicated: serve others, build something greater than yourself, and let purpose guide every decision. That blueprint built TrendCatch — and it is the same one I hope to pass on to the next generation.',
   0, '2026-04-01');

-- No default admin is seeded anymore.
-- Create an admin explicitly using db/create-admin-user.sql
-- or register a normal account first and then promote it.

INSERT INTO media_items (title, type, summary, body, image, link_url, published_at, is_featured, sort_order) VALUES
  ('Founder keynote reel', 'video',
   'Highlights from stage appearances centered on innovation and community impact.',
   'A premium reel for event producers, journalists, and community partners who want a quick view of the speaking presence and message.',
   '/assets/gallery-speaking-stage.webp', '/blog', '2026-06-01', 1, 1),
  ('Media kit download', 'press_release',
   'Download the official bio, talking points, and brand information for media use.',
   'A downloadable media kit that includes a concise biography, speaking topics, brand context, and contact guidance for producers and journalists.',
   '/assets/brand-signature-white.jpg', '/assets/media-kit/frantz-coutard-media-kit.txt', '2026-06-05', 1, 2),
  ('Press and recognition archive', 'press_release',
   'Articles, awards, and public records that document the journey.',
   'Source material for public-facing milestones, citations, and brand history.',
   '/assets/award-presidential-medal.webp', '/awards', '2026-05-01', 0, 3),
  ('Interview and podcast assets', 'interview',
   'Brand-ready photos and message points for hosts and producers.',
   'The media kit path is built for timely booking requests, interview prep, and quick turnaround production needs.',
   '/assets/brand-signature-white.jpg', '/#community', '2026-05-01', 0, 4),
  ('Photo gallery selection', 'photo',
   'Stage, community, and brand imagery chosen for editorial use.',
   'A curated gallery that supports campaigns, announcements, and promotional materials.',
   '/assets/brand-marks-grid.jpg', '/projects', '2026-04-01', 0, 5),
  ('TV and feature clips', 'tv',
   'Short-form clips that make it easy to embed the story in a broadcast or digital package.',
   'This section will grow as interviews and appearances are added.',
   '/assets/abstract-gold-network.webp', '/events', '2026-04-01', 0, 6);

INSERT INTO testimonials (quote, author_name, author_title, company, image, is_featured, sort_order) VALUES
  ('The strategy is practical, community-first, and built with real execution in mind.', 'Community Partner', 'Program Lead', 'Local Impact Group', '/assets/award-senate-medal.webp', 1, 1),
  ('Frantz brings a clear message, strong presence, and a focus on helping people move forward.', 'Event Producer', 'Booking Director', 'Leadership Summit', '/assets/gallery-speaking-stage.webp', 0, 2),
  ('The brand system is premium, but the mission stays human. That combination stands out.', 'Brand Advisor', 'Creative Strategist', 'Studio Partner', '/assets/brand-signature-white.jpg', 0, 3);

INSERT INTO store_inventory (
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

INSERT INTO community_threads (title, body, audience, author_name, is_pinned) VALUES
  ('Welcome to the Community Board', 'This space is for founder updates, launch notes, invite-only announcements, and conversations that keep the community close to the mission.', 'public', 'Frantz Coutard', 1),
  ('Member-only launch notes', 'Members will get first access to new platform notes, special invites, and private updates before they appear publicly.', 'member', 'Frantz Coutard', 1),
  ('VIP preview thread', 'A private place for premium supporters to preview the next stage of the ecosystem, provide feedback, and stay connected.', 'vip', 'Frantz Coutard', 0);

INSERT INTO community_comments (thread_id, author_name, body) VALUES
  (1, 'Frantz Coutard', 'If you want a project or event added here, use the contact form or join the member dashboard.'),
  (1, 'Community Partner', 'Looking forward to the next launch and the local opportunities it creates.'),
  (2, 'Frantz Coutard', 'The roadmap will continue to expand with private resources, notices, and member-first benefits.');
