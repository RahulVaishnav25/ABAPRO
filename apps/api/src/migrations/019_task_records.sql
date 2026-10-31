-- Each Yes or No response a therapist records for a task.
-- A day holds at most sessions_per_day sessions of trials_per_session trials, shared by every therapist on the client.
-- The unique key stops two concurrent saves from taking the same trial.

CREATE TABLE task_records (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  client_id uuid NOT NULL REFERENCES clients(id),
  program_id uuid NOT NULL REFERENCES client_programs(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES client_targets(id) ON DELETE CASCADE,
  therapist_id uuid NOT NULL REFERENCES users(id),
  response text NOT NULL CHECK (response IN ('yes', 'no')),
  record_date date NOT NULL,
  session_number integer NOT NULL CHECK (session_number >= 1),
  trial_number integer NOT NULL CHECK (trial_number >= 1),
  trials_per_session integer NOT NULL CHECK (trials_per_session >= 1),
  sessions_per_day integer NOT NULL CHECK (sessions_per_day >= 1),
  phase text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_id, record_date, session_number, trial_number)
);

CREATE INDEX task_records_client_date_idx ON task_records (client_id, record_date);

ALTER TABLE task_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_records FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON task_records
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid AND clinic_client_visible(client_id))
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid AND clinic_client_visible(client_id));

GRANT SELECT, INSERT ON task_records TO abapro_app;
