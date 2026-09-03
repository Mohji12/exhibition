-- Conninter Visitor Book — staff accounts and QR invite PINs
-- Run after 001–004. Safe to re-run (CREATE IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(200) NOT NULL UNIQUE,
  pin_hash VARCHAR(255) NOT NULL,
  role ENUM('Rep', 'Admin') NOT NULL,
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  activated_at TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS invites (
  id CHAR(36) PRIMARY KEY,
  token VARCHAR(64) NOT NULL UNIQUE,
  pin_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_by CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
