-- Visiting-card image backup (OCR / Gemini re-run)
CREATE TABLE IF NOT EXISTS lead_card_images (
  id CHAR(36) PRIMARY KEY,
  lead_id VARCHAR(36) NULL,
  mime_type VARCHAR(64) NOT NULL DEFAULT 'image/jpeg',
  image_blob MEDIUMBLOB NOT NULL,
  sha256 CHAR(64) NOT NULL,
  captured_by CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_lead_card_images_lead (lead_id),
  INDEX idx_lead_card_images_sha (sha256),
  CONSTRAINT fk_lead_card_images_lead
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL,
  CONSTRAINT fk_lead_card_images_user
    FOREIGN KEY (captured_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
