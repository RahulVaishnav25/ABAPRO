ALTER TABLE client_targets
  ADD COLUMN IF NOT EXISTS sd text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS mastery_sessions integer,
  ADD COLUMN IF NOT EXISTS mastery_probe integer,
  ADD COLUMN IF NOT EXISTS baseline_sessions integer,
  ADD COLUMN IF NOT EXISTS baseline_probe integer;

ALTER TABLE client_targets
  ADD CONSTRAINT client_targets_mastery_sessions_check CHECK (mastery_sessions IS NULL OR mastery_sessions BETWEEN 1 AND 100),
  ADD CONSTRAINT client_targets_mastery_probe_check CHECK (mastery_probe IS NULL OR mastery_probe BETWEEN 0 AND 100),
  ADD CONSTRAINT client_targets_baseline_sessions_check CHECK (baseline_sessions IS NULL OR baseline_sessions BETWEEN 1 AND 100),
  ADD CONSTRAINT client_targets_baseline_probe_check CHECK (baseline_probe IS NULL OR baseline_probe BETWEEN 0 AND 100);

-- The task screens previously encoded these values as text. Recover them where that format is present.
UPDATE client_targets
SET mastery_sessions = substring(mastery_criteria FROM '^(\d{1,3}) sessions at')::integer,
    mastery_probe = substring(mastery_criteria FROM '^\d{1,3} sessions at (\d{1,3})% probe criteria$')::integer
WHERE mastery_criteria ~ '^\d{1,3} sessions at \d{1,3}% probe criteria$'
  AND substring(mastery_criteria FROM '^(\d{1,3}) sessions at')::integer BETWEEN 1 AND 100
  AND substring(mastery_criteria FROM '^\d{1,3} sessions at (\d{1,3})% probe criteria$')::integer BETWEEN 0 AND 100;

UPDATE client_targets
SET sd = substring(operational_definition FROM 5)
WHERE operational_definition LIKE 'SD: %';
