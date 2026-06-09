USE frantz_portfolio;

ALTER TABLE users
  ADD COLUMN email_verified_at TIMESTAMP NULL DEFAULT NULL AFTER role,
  ADD COLUMN email_verification_otp_hash VARCHAR(255) DEFAULT NULL AFTER email_verified_at,
  ADD COLUMN email_verification_otp_expires_at TIMESTAMP NULL DEFAULT NULL AFTER email_verification_otp_hash,
  ADD COLUMN email_verification_otp_sent_at TIMESTAMP NULL DEFAULT NULL AFTER email_verification_otp_expires_at,
  ADD COLUMN email_verification_otp_attempts INT NOT NULL DEFAULT 0 AFTER email_verification_otp_sent_at;

UPDATE users
SET email_verified_at = COALESCE(email_verified_at, created_at),
    email_verification_otp_hash = NULL,
    email_verification_otp_expires_at = NULL,
    email_verification_otp_sent_at = NULL,
    email_verification_otp_attempts = 0;
