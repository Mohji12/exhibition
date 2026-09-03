-- Lead attribution to booth staff (users)
-- Safe to re-run only if column does not already exist.

ALTER TABLE leads
  ADD COLUMN captured_by CHAR(36) NULL;

ALTER TABLE leads
  ADD CONSTRAINT fk_leads_captured_by
    FOREIGN KEY (captured_by) REFERENCES users(id) ON DELETE SET NULL;
