-- Conninter Visitor Book — schema for local MySQL database `coninter`
-- Run in MySQL Workbench: USE coninter; then execute this script.

CREATE TABLE IF NOT EXISTS product_interests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS leads (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  company VARCHAR(200) NOT NULL,
  designation VARCHAR(200) NOT NULL,
  mobile VARCHAR(50) NOT NULL,
  email VARCHAR(200) NOT NULL,
  city VARCHAR(100) NOT NULL,
  priority ENUM('hot', 'warm', 'cold') NOT NULL,
  summary TEXT,
  synced TINYINT(1) NOT NULL DEFAULT 0,
  captured_at VARCHAR(50) NOT NULL,
  consent_at VARCHAR(20) NULL
);

CREATE TABLE IF NOT EXISTS lead_interests (
  lead_id VARCHAR(36) NOT NULL,
  interest_id INT NOT NULL,
  PRIMARY KEY (lead_id, interest_id),
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  FOREIGN KEY (interest_id) REFERENCES product_interests(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS appointments (
  id VARCHAR(36) PRIMARY KEY,
  lead_name VARCHAR(200) NOT NULL,
  type ENUM('Online call', 'Physical', 'Product Demo', 'Site Visit') NOT NULL,
  when_label VARCHAR(100) NOT NULL,
  status ENUM('Confirmed', 'Pending', 'Rescheduled') NOT NULL
);

CREATE TABLE IF NOT EXISTS team_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  role ENUM('Rep', 'Admin') NOT NULL,
  email VARCHAR(200) NOT NULL
);




