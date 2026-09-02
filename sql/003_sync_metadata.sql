-- Optional: track last update time for future conflict resolution
-- Safe to skip if column already exists
ALTER TABLE leads
  ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
