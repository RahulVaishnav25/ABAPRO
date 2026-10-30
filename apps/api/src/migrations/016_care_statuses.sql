-- Programs and tasks share three statuses: In Treatment, Maintenance and On Hold.
-- Every existing program and task starts again In Treatment.

ALTER TABLE client_programs DROP CONSTRAINT client_programs_status_check;
UPDATE client_programs SET status = 'in_treatment';
ALTER TABLE client_programs
  ALTER COLUMN status SET DEFAULT 'in_treatment',
  ADD CONSTRAINT client_programs_status_check CHECK (status IN ('in_treatment', 'maintenance', 'on_hold'));

ALTER TABLE client_targets DROP CONSTRAINT client_targets_status_check;
UPDATE client_targets SET status = 'in_treatment';
ALTER TABLE client_targets
  ALTER COLUMN status SET DEFAULT 'in_treatment',
  ADD CONSTRAINT client_targets_status_check CHECK (status IN ('in_treatment', 'maintenance', 'on_hold'));
