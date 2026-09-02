-- Capture metadata for QR / card OCR provenance
ALTER TABLE leads
  ADD COLUMN capture_source ENUM('qr', 'card', 'manual') NULL,
  ADD COLUMN capture_meta JSON NULL;
