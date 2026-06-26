-- ============================================================
-- FrantzCoutard.com — Awards table (rebuild + seed)
-- Idempotent: drops and recreates `awards` with the full schema,
-- then seeds the 10 official recognitions (mirrors frontend/src/lib/awards.ts).
-- Run:  mysql -u root frantz_portfolio < db/awards.sql
-- ============================================================

USE frantz_portfolio;

DROP TABLE IF EXISTS awards;

CREATE TABLE awards (
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

INSERT INTO awards (title, year, level, presenter, short_text, description, image, is_featured, sort_order) VALUES
('Queens Chamber of Commerce — Featured Entrepreneur', '2023', 'Business', 'Queens Chamber Member News',
 'Featured for revolutionizing local advertising through TrendCatch Digital Advertising.',
 'Featured in Queens Chamber Member News for revolutionizing local advertising through TrendCatch Digital Advertising — highlighting an innovative approach to affordable advertising for local businesses and a vision for a stronger local business ecosystem. An important milestone in the evolution of what would become TrendCatch Network.',
 '/assets/awards/queens-chamber.webp', 0, 1),

('Presidential Lifetime Achievement Award', '2024', 'National', 'AmeriCorps & the Office of the President of the United States',
 'One of the nation''s highest volunteer service honors, for lifelong community service.',
 'Awarded through AmeriCorps and the Office of the President of the United States — one of the nation''s highest volunteer service recognitions, honoring a lifelong commitment to community service, leadership, volunteerism, and efforts to strengthen communities through innovation and civic engagement.',
 '/assets/awards/presidential-lifetime.webp', 1, 2),

('New York State Assembly Recognition', '2024', 'State', 'Assemblywoman Michaelle C. Solages',
 'Recognized for entrepreneurship, innovation, and improving lives across Long Island and New York.',
 'Recognized for entrepreneurship, innovation, leadership, and dedication to improving the lives of residents throughout Long Island and New York. The citation highlights a commitment to helping small businesses gain visibility, creating opportunities through technology, and strengthening local economies.',
 '/assets/awards/ny-assembly.webp', 1, 3),

('Nassau County Executive Citation', '2024', 'County', 'County Executive Bruce Blakeman',
 'For dedicated leadership, public service, and commitment to community advancement.',
 'Awarded by Nassau County Executive Bruce Blakeman in recognition of dedicated leadership, public service, and commitment to community advancement — honoring contributions to local communities and efforts to improve the lives of others through service and leadership.',
 '/assets/awards/nassau-executive.webp', 0, 4),

('Nassau County Executive Cultural Recognition', '2024', 'County', 'County Executive Bruce Blakeman',
 'Honoring contributions to cultural diversity and the Haitian and Creole communities.',
 'Honored by Nassau County Executive Bruce Blakeman for contributions to cultural diversity, community engagement, and support of the Haitian and Creole communities — acknowledging a role in promoting community unity, cultural awareness, and public engagement.',
 '/assets/awards/nassau-cultural.webp', 0, 5),

('Nassau County Legislature Citation', '2025', 'County', 'Legislator Carrie Solages',
 'For outstanding leadership and contributions to the Haitian community.',
 'Recognized for outstanding leadership and contributions to the Haitian community. Presented during the Jazz Créole Festival in recognition of community service, advocacy, and efforts that positively impacted residents throughout Nassau County.',
 '/assets/awards/nassau-legislature.webp', 0, 6),

('Kedner Stiven Foundation Leadership Award', '2025', 'Nonprofit', 'Kedner Stiven Foundation',
 'For outstanding leadership and commitment to the Haitian-American community.',
 'Awarded for outstanding leadership and unwavering commitment to the Haitian-American community — honoring efforts to inspire others, create opportunities, support community development, and advocate for positive social impact.',
 '/assets/awards/kedner-stiven.webp', 0, 7),

('Dr. Martin Luther King Jr. Visionary Award', '2026', 'National', NULL,
 'For visionary leadership, innovation, and community advancement.',
 'Awarded in recognition of visionary leadership, innovation, community advancement, and commitment to the principles championed by Dr. Martin Luther King Jr. — celebrating work empowering communities through technology, entrepreneurship, economic opportunity, and social impact, and recognizing leadership that contributes to unity, progress, equality, and community transformation.',
 '/assets/awards/mlk-visionary.webp', 1, 8),

('United States Senate Recognition', '2026', 'Federal', 'U.S. Senator Charles E. Schumer',
 'Federal recognition for entrepreneurial achievement and community leadership.',
 'Recognized by the United States Senate, presented by U.S. Senator Charles E. Schumer, for entrepreneurial achievement, community leadership, and receiving the Dr. Martin Luther King Jr. Visionary Award. This federal recognition acknowledges impact on local communities through innovation, entrepreneurship, and public service.',
 '/assets/awards/us-senate.webp', 1, 9),

('New York State Legislative Resolution No. 998', '2026', 'State', 'New York State Assembly',
 'A permanent public record honoring entrepreneurship, technology, and community impact.',
 'Officially honored by the New York State Assembly through Legislative Resolution No. 998 — a permanent public record recognizing TrendCatch Digital Advertising, TrendCatch Network, TrendCatch Player Technology, Unlock A Cause, Workforce Development Initiatives, and Community Empowerment Programs, and a dedication to empowering underserved communities.',
 '/assets/awards/ny-resolution-998.webp', 1, 10);
