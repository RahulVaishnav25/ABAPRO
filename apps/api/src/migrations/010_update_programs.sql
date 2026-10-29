DROP TABLE IF EXISTS program_assignments CASCADE;

ALTER TABLE client_programs
  DROP COLUMN IF EXISTS responsible_clinician_id CASCADE;

ALTER TABLE client_programs
  DROP CONSTRAINT IF EXISTS client_programs_trials_check;

ALTER TABLE client_programs
  ADD COLUMN IF NOT EXISTS domain text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS date_implemented date,
  ADD COLUMN IF NOT EXISTS date_mastered date,
  ADD COLUMN IF NOT EXISTS assessment_type text,
  ADD COLUMN IF NOT EXISTS sd text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS mastery_steps text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS teaching_steps text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS error_correction_procedure text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS teaching_method text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS net_teaching_idea text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS measurement_procedure text NOT NULL DEFAULT 'Probe';

UPDATE client_programs
SET date_implemented = started_on
WHERE date_implemented IS NULL AND started_on IS NOT NULL;

UPDATE client_programs
SET measurement_procedure = CASE
  WHEN measurement_type = 'trial' THEN 'Step by Step'
  ELSE 'Probe'
END
WHERE measurement_procedure IS NULL OR measurement_procedure = '';
