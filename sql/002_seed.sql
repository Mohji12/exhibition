-- Conninter Visitor Book — seed data (run after 001_schema.sql)
-- Safe to re-run: clears and re-inserts demo rows.

SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE lead_interests;
TRUNCATE TABLE leads;
TRUNCATE TABLE product_interests;
TRUNCATE TABLE appointments;
TRUNCATE TABLE team_members;
SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO product_interests (name) VALUES
  ('Medical Equipment'),
  ('Surgical'),
  ('Diagnostics'),
  ('Software'),
  ('AI Solutions'),
  ('Hospital Infrastructure');

INSERT INTO leads (id, name, company, designation, mobile, email, city, priority, summary, synced, captured_at, consent_at) VALUES
  ('1', 'Dr. Ananya Rao', 'Fortis Medical Centre', 'Chief Procurement Officer', '+91 98765 43210', 'ananya.rao@fortismedical.example', 'Mumbai', 'hot', 'Interested in ICU ventilators for a 300-bed expansion. Requested pricing and a product demo next week. Budget approved for this quarter.', 1, 'Today, 14:32', '14:32'),
  ('2', 'Rajesh Kumar', 'CityCare Hospitals', 'Purchase Manager', '+91 91234 56780', 'rajesh.kumar@citycare.example', 'Pune', 'warm', 'Exploring surgical equipment upgrade for new wing, timeline is 6+ months out. Wants brochure emailed.', 1, 'Today, 13:05', '13:04'),
  ('3', 'Dr. Meera Nair', 'Sunrise Diagnostics', 'Director', '+91 99887 66554', 'meera.nair@sunrisediag.example', 'Kochi', 'hot', 'Very engaged, asked detailed questions about AI-assisted diagnostic imaging. Wants a follow-up call this week.', 0, 'Today, 12:20', '12:18'),
  ('4', 'Faisal Ahmed', 'Al Noor Hospital Group', 'IT Director', '+91 90000 11223', 'faisal.ahmed@alnoorhealth.example', 'Hyderabad', 'warm', '', 0, 'Today, 11:40', NULL),
  ('5', 'Sunita Deshpande', 'Wellness Care Clinics', 'Operations Head', '+91 98111 22334', 'sunita.d@wellnesscare.example', 'Nagpur', 'cold', 'Just browsing, took a brochure.', 1, 'Today, 10:15', NULL);

INSERT INTO lead_interests (lead_id, interest_id)
SELECT '1', id FROM product_interests WHERE name IN ('Medical Equipment', 'Diagnostics');

INSERT INTO lead_interests (lead_id, interest_id)
SELECT '2', id FROM product_interests WHERE name IN ('Surgical', 'Hospital Infrastructure');

INSERT INTO lead_interests (lead_id, interest_id)
SELECT '3', id FROM product_interests WHERE name IN ('Diagnostics', 'AI Solutions');

INSERT INTO lead_interests (lead_id, interest_id)
SELECT '4', id FROM product_interests WHERE name IN ('Software', 'AI Solutions');

INSERT INTO lead_interests (lead_id, interest_id)
SELECT '5', id FROM product_interests WHERE name = 'Hospital Infrastructure';

INSERT INTO appointments (id, lead_name, type, when_label, status) VALUES
  ('a1', 'Dr. Ananya Rao', 'Product Demo', 'Tomorrow, 11:00 AM', 'Confirmed'),
  ('a2', 'Dr. Meera Nair', 'Online call', 'Thu, 3:00 PM', 'Pending'),
  ('a3', 'Rajesh Kumar', 'Site Visit', 'Next Mon, 10:00 AM', 'Confirmed');

INSERT INTO team_members (name, role, email) VALUES
  ('Ditto', 'Rep', 'ditto@conninter.example'),
  ('Priya S.', 'Rep', 'priya@conninter.example'),
  ('Conninter Admin', 'Admin', 'admin@conninter.example');
