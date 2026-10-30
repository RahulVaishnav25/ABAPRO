-- Programs and tasks can also be Mastered.

ALTER TABLE client_programs DROP CONSTRAINT client_programs_status_check;
ALTER TABLE client_programs
  ADD CONSTRAINT client_programs_status_check CHECK (status IN ('in_treatment', 'maintenance', 'on_hold', 'mastered'));

ALTER TABLE client_targets DROP CONSTRAINT client_targets_status_check;
ALTER TABLE client_targets
  ADD CONSTRAINT client_targets_status_check CHECK (status IN ('in_treatment', 'maintenance', 'on_hold', 'mastered'));
