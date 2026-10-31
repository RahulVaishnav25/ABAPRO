-- Each record keeps the status of its task and program when it was saved, for the Session History audit view.
-- Existing records take the status from the latest status change logged before they were saved.
-- A task with no earlier change was In Treatment, as every task starts. A program with no logged change at all
-- has kept its status since it was created, and one whose changes all came later was In Treatment.

ALTER TABLE task_records
  ADD COLUMN task_status text,
  ADD COLUMN program_status text;

UPDATE task_records r
SET task_status = COALESCE(
  (SELECT e.metadata->>'status' FROM audit_events e
   WHERE e.target_type = 'target' AND e.target_id = r.target_id::text AND e.metadata ? 'status' AND e.created_at <= r.recorded_at
   ORDER BY e.created_at DESC LIMIT 1),
  'in_treatment');

UPDATE task_records r
SET program_status = COALESCE(
  (SELECT e.metadata->>'status' FROM audit_events e
   WHERE e.target_type = 'program' AND e.target_id = r.program_id::text AND e.metadata ? 'status' AND e.created_at <= r.recorded_at
   ORDER BY e.created_at DESC LIMIT 1),
  CASE
    WHEN EXISTS (SELECT 1 FROM audit_events e WHERE e.target_type = 'program' AND e.target_id = r.program_id::text AND e.metadata ? 'status')
      THEN 'in_treatment'
    ELSE (SELECT p.status FROM client_programs p WHERE p.id = r.program_id)
  END);

ALTER TABLE task_records
  ALTER COLUMN task_status SET NOT NULL,
  ALTER COLUMN program_status SET NOT NULL,
  ADD CONSTRAINT task_records_task_status_check CHECK (task_status IN ('in_treatment', 'maintenance', 'on_hold', 'mastered')),
  ADD CONSTRAINT task_records_program_status_check CHECK (program_status IN ('in_treatment', 'maintenance', 'on_hold', 'mastered'));

CREATE INDEX task_records_program_idx ON task_records (program_id, recorded_at DESC);
