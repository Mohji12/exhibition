-- Remove mock leads/appointments. Keep product-interest taxonomy only.
-- Does not truncate live captures.

DELETE FROM lead_interests
WHERE lead_id IN ('1', '2', '3', '4', '5');

DELETE FROM leads
WHERE id IN ('1', '2', '3', '4', '5')
   OR email LIKE '%.example';

DELETE FROM appointments
WHERE id IN ('a1', 'a2', 'a3')
   OR lead_name IN ('Dr. Ananya Rao', 'Dr. Meera Nair', 'Rajesh Kumar');
