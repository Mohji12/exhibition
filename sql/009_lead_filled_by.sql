-- Lead filled-by attribution: booth staff vs public visitor form
ALTER TABLE leads
  ADD COLUMN filled_by ENUM('exhibitor', 'visitor') NOT NULL DEFAULT 'exhibitor'
  AFTER captured_by;
