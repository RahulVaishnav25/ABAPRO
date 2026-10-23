ALTER TABLE therapy_sessions
  DROP CONSTRAINT therapy_sessions_status_check;

ALTER TABLE therapy_sessions
  ADD CONSTRAINT therapy_sessions_status_check
  CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled'));

ALTER TABLE therapy_sessions
  ADD COLUMN therapist_id uuid REFERENCES users (id),
  ADD COLUMN setting text NOT NULL DEFAULT '',
  ADD COLUMN location text NOT NULL DEFAULT '',
  ADD COLUMN note text NOT NULL DEFAULT '',
  ADD COLUMN interrupted_at timestamptz,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX therapy_sessions_open_idx ON therapy_sessions (client_id) WHERE status = 'in_progress';

ALTER TABLE session_observations
  ADD COLUMN idempotency_key text,
  ADD COLUMN request_fingerprint text,
  ADD COLUMN status text NOT NULL DEFAULT 'recorded',
  ADD COLUMN entry_mode text NOT NULL DEFAULT 'summary',
  ADD COLUMN window_started_at timestamptz,
  ADD COLUMN window_ended_at timestamptz,
  ADD COLUMN duration_unit text NOT NULL DEFAULT 'seconds',
  ADD COLUMN started_at timestamptz,
  ADD COLUMN ended_at timestamptz,
  ADD COLUMN occurred_at timestamptz,
  ADD COLUMN context_note text NOT NULL DEFAULT '',
  ADD COLUMN rate_per_minute numeric(12, 4),
  ADD COLUMN amended_from_id uuid REFERENCES session_observations (id),
  ADD COLUMN amendment_reason text NOT NULL DEFAULT '';

ALTER TABLE session_observations
  ADD CONSTRAINT session_observations_status_check CHECK (status IN ('draft', 'recorded', 'amended', 'voided')),
  ADD CONSTRAINT session_observations_entry_mode_check CHECK (entry_mode IN ('summary', 'event', 'timer', 'entered')),
  ADD CONSTRAINT session_observations_duration_unit_check CHECK (duration_unit IN ('seconds', 'minutes')),
  ADD CONSTRAINT session_observations_frequency_check CHECK (frequency_count IS NULL OR frequency_count >= 0),
  ADD CONSTRAINT session_observations_duration_check CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  ADD CONSTRAINT session_observations_window_check CHECK (
    window_ended_at IS NULL OR window_started_at IS NULL OR window_ended_at > window_started_at
  ),
  ADD CONSTRAINT session_observations_span_check CHECK (
    ended_at IS NULL OR started_at IS NULL OR ended_at > started_at
  );

CREATE UNIQUE INDEX session_observations_idempotency_idx
  ON session_observations (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE observation_trials
  ADD COLUMN idempotency_key text,
  ADD COLUMN request_fingerprint text,
  ADD COLUMN voided_at timestamptz,
  ADD COLUMN void_reason text NOT NULL DEFAULT '';

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'observation_trials'::regclass AND contype = 'u'
  LIMIT 1;
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE observation_trials DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

CREATE UNIQUE INDEX observation_trials_active_number_idx
  ON observation_trials (observation_id, trial_number)
  WHERE voided_at IS NULL;

CREATE UNIQUE INDEX observation_trials_idempotency_idx
  ON observation_trials (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE clinical_change_reasons
  DROP CONSTRAINT clinical_change_reasons_type_check;

ALTER TABLE clinical_change_reasons
  ADD CONSTRAINT clinical_change_reasons_type_check
  CHECK (record_type IN ('program', 'target', 'assessment', 'session', 'observation'));
