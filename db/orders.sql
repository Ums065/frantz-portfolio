-- Orders table for the merchandise store checkout
USE frantz_portfolio;

CREATE TABLE IF NOT EXISTS orders (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  order_no       VARCHAR(20) NOT NULL UNIQUE,
  user_id        INT NULL,
  customer_name  VARCHAR(120) NOT NULL,
  email          VARCHAR(160) NOT NULL,
  address        TEXT,
  items          JSON,
  subtotal       DECIMAL(10,2) NOT NULL DEFAULT 0,
  discount       DECIMAL(10,2) NOT NULL DEFAULT 0,
  shipping       DECIMAL(10,2) NOT NULL DEFAULT 0,
  tax            DECIMAL(10,2) NOT NULL DEFAULT 0,
  total          DECIMAL(10,2) NOT NULL DEFAULT 0,
  payment_method VARCHAR(30) NOT NULL DEFAULT 'card',
  payment_provider VARCHAR(40) DEFAULT NULL,
  payment_status ENUM('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending',
  payment_session_id VARCHAR(120) DEFAULT NULL,
  payment_intent_id VARCHAR(120) DEFAULT NULL,
  payment_confirmed_at TIMESTAMP NULL DEFAULT NULL,
  payment_url TEXT DEFAULT NULL,
  payment_error TEXT DEFAULT NULL,
  status         ENUM('paid','pending','fulfilled','cancelled') NOT NULL DEFAULT 'paid',
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
