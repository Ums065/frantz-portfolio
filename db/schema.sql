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
  role          ENUM('member','vip','editor','admin','super_admin') NOT NULL DEFAULT 'member',
  email_verified_at TIMESTAMP NULL DEFAULT NULL,
  email_verification_otp_hash VARCHAR(255) DEFAULT NULL,
  email_verification_otp_expires_at TIMESTAMP NULL DEFAULT NULL,
  email_verification_otp_sent_at TIMESTAMP NULL DEFAULT NULL,
  email_verification_otp_attempts INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
  stock              INT NOT NULL DEFAULT 0,
  low_stock_threshold INT NOT NULL DEFAULT 5,
  restock_note       VARCHAR(180) DEFAULT NULL,
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
   '/assets/gallery-speaking-stage.png', '/blog', '2026-06-01', 1, 1),
  ('Media kit download', 'press_release',
   'Download the official bio, talking points, and brand information for media use.',
   'A downloadable media kit that includes a concise biography, speaking topics, brand context, and contact guidance for producers and journalists.',
   '/assets/brand-signature-white.jpg', '/assets/media-kit/frantz-coutard-media-kit.txt', '2026-06-05', 1, 2),
  ('Press and recognition archive', 'press_release',
   'Articles, awards, and public records that document the journey.',
   'Source material for public-facing milestones, citations, and brand history.',
   '/assets/award-presidential-medal.png', '/awards', '2026-05-01', 0, 3),
  ('Interview and podcast assets', 'interview',
   'Brand-ready photos and message points for hosts and producers.',
   'The media kit path is built for timely booking requests, interview prep, and quick turnaround production needs.',
   '/assets/brand-signature-white.jpg', '/community', '2026-05-01', 0, 4),
  ('Photo gallery selection', 'photo',
   'Stage, community, and brand imagery chosen for editorial use.',
   'A curated gallery that supports campaigns, announcements, and promotional materials.',
   '/assets/brand-marks-grid.jpg', '/projects', '2026-04-01', 0, 5),
  ('TV and feature clips', 'tv',
   'Short-form clips that make it easy to embed the story in a broadcast or digital package.',
   'This section will grow as interviews and appearances are added.',
   '/assets/abstract-gold-network.png', '/events', '2026-04-01', 0, 6);

INSERT INTO testimonials (quote, author_name, author_title, company, image, is_featured, sort_order) VALUES
  ('The strategy is practical, community-first, and built with real execution in mind.', 'Community Partner', 'Program Lead', 'Local Impact Group', '/assets/award-senate-medal.png', 1, 1),
  ('Frantz brings a clear message, strong presence, and a focus on helping people move forward.', 'Event Producer', 'Booking Director', 'Leadership Summit', '/assets/gallery-speaking-stage.png', 0, 2),
  ('The brand system is premium, but the mission stays human. That combination stands out.', 'Brand Advisor', 'Creative Strategist', 'Studio Partner', '/assets/brand-signature-white.jpg', 0, 3);

INSERT INTO store_inventory (product_id, stock, low_stock_threshold, restock_note) VALUES
  ('hoodie-legacy', 24, 5, 'Core collection stock'),
  ('hoodie-c2l', 18, 4, 'Core collection stock'),
  ('tee-emblem', 48, 8, 'Core collection stock'),
  ('tee-tech', 44, 8, 'Core collection stock'),
  ('tee-vision', 36, 6, 'Core collection stock'),
  ('cap-gold', 40, 6, 'Core collection stock'),
  ('cap-builder', 32, 5, 'Core collection stock'),
  ('book-nts', 64, 10, 'Core collection stock'),
  ('book-blueprint', 96, 12, 'Core collection stock'),
  ('pin-ltd', 70, 10, 'Core collection stock'),
  ('print-signed', 16, 4, 'Core collection stock');

INSERT INTO community_threads (title, body, audience, author_name, is_pinned) VALUES
  ('Welcome to the Community Board', 'This space is for founder updates, launch notes, invite-only announcements, and conversations that keep the community close to the mission.', 'public', 'Frantz Coutard', 1),
  ('Member-only launch notes', 'Members will get first access to new platform notes, special invites, and private updates before they appear publicly.', 'member', 'Frantz Coutard', 1),
  ('VIP preview thread', 'A private place for premium supporters to preview the next stage of the ecosystem, provide feedback, and stay connected.', 'vip', 'Frantz Coutard', 0);

INSERT INTO community_comments (thread_id, author_name, body) VALUES
  (1, 'Frantz Coutard', 'If you want a project or event added here, use the contact form or join the member dashboard.'),
  (1, 'Community Partner', 'Looking forward to the next launch and the local opportunities it creates.'),
  (2, 'Frantz Coutard', 'The roadmap will continue to expand with private resources, notices, and member-first benefits.');
