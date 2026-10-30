-- Remove the Sessions, Targets and Progress modules and their data.
-- Tasks are stored in client_targets and keep target_configuration_versions, so both stay.

DROP TABLE observation_trials;
DROP TABLE session_observations;
DROP TABLE therapy_sessions;
DROP TABLE clinical_observations;
DROP TABLE target_assignments;
DROP TABLE program_template_targets;

DELETE FROM clinical_change_reasons WHERE record_type IN ('session', 'observation');

ALTER TABLE clinical_change_reasons
  DROP CONSTRAINT clinical_change_reasons_type_check;

ALTER TABLE clinical_change_reasons
  ADD CONSTRAINT clinical_change_reasons_type_check
  CHECK (record_type IN ('program', 'target', 'assessment'));

-- Graphs belonged to Progress.
DELETE FROM shared_records WHERE record_type = 'graph';

-- Permissions that only existed for these modules.
DELETE FROM organization_role_grants
WHERE permission IN (
  'targets.edit', 'sessions.view', 'observations.record', 'observations.amend',
  'phases.approve', 'progress.view', 'graphs.view', 'graphs.export'
);

DELETE FROM platform_role_grants
WHERE permission IN (
  'targets.edit', 'sessions.view', 'observations.record', 'observations.amend',
  'phases.approve', 'progress.view', 'graphs.view', 'graphs.export'
);

UPDATE exceptional_access_grants
SET permissions = permissions - ARRAY[
  'targets.edit', 'sessions.view', 'observations.record', 'observations.amend',
  'phases.approve', 'progress.view', 'graphs.view', 'graphs.export'
]::text[]
WHERE jsonb_typeof(permissions) = 'array';
