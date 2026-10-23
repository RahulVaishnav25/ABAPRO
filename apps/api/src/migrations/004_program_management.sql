CREATE TABLE assessment_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  name text NOT NULL,
  assessment_type text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  created_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assessment_templates_status_check CHECK (status IN ('active', 'retired'))
);

CREATE TABLE assessment_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  template_id uuid NOT NULL REFERENCES assessment_templates (id),
  label text NOT NULL,
  response_kind text NOT NULL,
  guidance text NOT NULL DEFAULT '',
  sort_order integer NOT NULL,
  CONSTRAINT assessment_template_items_kind_check CHECK (response_kind IN ('text', 'yes_no', 'rating', 'count'))
);

CREATE TABLE assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  client_id uuid NOT NULL REFERENCES clients (id),
  template_id uuid REFERENCES assessment_templates (id),
  name text NOT NULL,
  assessment_type text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  assessed_on date,
  review_on date,
  assigned_clinician_id uuid REFERENCES users (id),
  summary text NOT NULL DEFAULT '',
  results_note text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assessments_status_check CHECK (status IN ('draft', 'in_progress', 'completed', 'reviewed'))
);

CREATE INDEX assessments_client_idx ON assessments (client_id, assessed_on DESC);

CREATE TABLE assessment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  assessment_id uuid NOT NULL REFERENCES assessments (id),
  template_item_id uuid REFERENCES assessment_template_items (id),
  label text NOT NULL,
  response_kind text NOT NULL,
  response_text text NOT NULL DEFAULT '',
  sort_order integer NOT NULL,
  CONSTRAINT assessment_items_kind_check CHECK (response_kind IN ('text', 'yes_no', 'rating', 'count'))
);

CREATE INDEX assessment_items_assessment_idx ON assessment_items (assessment_id, sort_order);

CREATE TABLE assessment_documents (
  assessment_id uuid NOT NULL REFERENCES assessments (id),
  document_id uuid NOT NULL REFERENCES client_documents (id),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  PRIMARY KEY (assessment_id, document_id)
);

CREATE TABLE program_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  objective text NOT NULL DEFAULT '',
  teaching_procedure text NOT NULL DEFAULT '',
  measurement_type text NOT NULL DEFAULT 'frequency',
  expected_trial_count integer,
  mastery_criteria text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  created_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT program_templates_status_check CHECK (status IN ('active', 'retired')),
  CONSTRAINT program_templates_measurement_check CHECK (measurement_type IN ('trial', 'probe', 'frequency', 'duration', 'abc')),
  CONSTRAINT program_templates_trials_check CHECK (
    (measurement_type NOT IN ('trial', 'probe') AND expected_trial_count IS NULL)
    OR (measurement_type IN ('trial', 'probe') AND expected_trial_count BETWEEN 1 AND 30)
  )
);

CREATE TABLE program_template_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  template_id uuid NOT NULL REFERENCES program_templates (id),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  operational_definition text NOT NULL DEFAULT '',
  measurement_method text NOT NULL DEFAULT 'frequency',
  expected_trial_count integer,
  baseline_note text NOT NULL DEFAULT '',
  teaching_instructions text NOT NULL DEFAULT '',
  prompt_hierarchy text NOT NULL DEFAULT '',
  mastery_criteria text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  CONSTRAINT program_template_targets_measurement_check CHECK (measurement_method IN ('trial', 'probe', 'frequency', 'duration', 'abc')),
  CONSTRAINT program_template_targets_trials_check CHECK (
    (measurement_method NOT IN ('trial', 'probe') AND expected_trial_count IS NULL)
    OR (measurement_method IN ('trial', 'probe') AND expected_trial_count BETWEEN 1 AND 30)
  )
);

ALTER TABLE client_programs
  ADD COLUMN description text NOT NULL DEFAULT '',
  ADD COLUMN objective text NOT NULL DEFAULT '',
  ADD COLUMN assessment_id uuid REFERENCES assessments (id),
  ADD COLUMN teaching_procedure text NOT NULL DEFAULT '',
  ADD COLUMN started_on date,
  ADD COLUMN review_on date,
  ADD COLUMN responsible_clinician_id uuid REFERENCES users (id),
  ADD COLUMN measurement_type text NOT NULL DEFAULT 'frequency',
  ADD COLUMN expected_trial_count integer,
  ADD COLUMN mastery_criteria text NOT NULL DEFAULT '',
  ADD COLUMN notes text NOT NULL DEFAULT '',
  ADD COLUMN template_id uuid REFERENCES program_templates (id),
  ADD COLUMN configuration_version integer NOT NULL DEFAULT 1;

ALTER TABLE client_programs
  ADD CONSTRAINT client_programs_measurement_check CHECK (measurement_type IN ('trial', 'probe', 'frequency', 'duration', 'abc')),
  ADD CONSTRAINT client_programs_trials_check CHECK (
    (measurement_type NOT IN ('trial', 'probe') AND expected_trial_count IS NULL)
    OR (measurement_type IN ('trial', 'probe') AND expected_trial_count BETWEEN 1 AND 30)
  );

CREATE TABLE program_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  client_id uuid NOT NULL REFERENCES clients (id),
  program_id uuid NOT NULL REFERENCES client_programs (id),
  assessment_id uuid REFERENCES assessments (id),
  statement text NOT NULL,
  objective text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  review_on date,
  created_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT program_goals_status_check CHECK (status IN ('active', 'met', 'discontinued'))
);

CREATE INDEX program_goals_program_idx ON program_goals (program_id);

CREATE TABLE program_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  program_id uuid NOT NULL REFERENCES client_programs (id),
  user_id uuid NOT NULL REFERENCES users (id),
  role text NOT NULL,
  ended_at timestamptz,
  created_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT program_assignments_role_check CHECK (role IN ('therapist', 'supervisor'))
);

CREATE UNIQUE INDEX program_assignments_active_idx
  ON program_assignments (program_id, user_id, role)
  WHERE ended_at IS NULL;

CREATE TABLE program_documents (
  program_id uuid NOT NULL REFERENCES client_programs (id),
  document_id uuid NOT NULL REFERENCES client_documents (id),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  PRIMARY KEY (program_id, document_id)
);

ALTER TABLE client_targets
  ADD COLUMN description text NOT NULL DEFAULT '',
  ADD COLUMN operational_definition text NOT NULL DEFAULT '',
  ADD COLUMN measurement_method text NOT NULL DEFAULT 'frequency',
  ADD COLUMN expected_trial_count integer,
  ADD COLUMN baseline_note text NOT NULL DEFAULT '',
  ADD COLUMN teaching_instructions text NOT NULL DEFAULT '',
  ADD COLUMN prompt_hierarchy text NOT NULL DEFAULT '',
  ADD COLUMN mastery_criteria text NOT NULL DEFAULT '',
  ADD COLUMN status text NOT NULL DEFAULT 'active',
  ADD COLUMN started_on date,
  ADD COLUMN review_on date,
  ADD COLUMN clinical_notes text NOT NULL DEFAULT '',
  ADD COLUMN sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN configuration_version integer NOT NULL DEFAULT 1,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE client_targets
  ADD CONSTRAINT client_targets_measurement_check CHECK (measurement_method IN ('trial', 'probe', 'frequency', 'duration', 'abc')),
  ADD CONSTRAINT client_targets_status_check CHECK (status IN ('active', 'inactive', 'mastered', 'discontinued')),
  ADD CONSTRAINT client_targets_trials_check CHECK (
    (measurement_method NOT IN ('trial', 'probe') AND expected_trial_count IS NULL)
    OR (measurement_method IN ('trial', 'probe') AND expected_trial_count BETWEEN 1 AND 30)
  );

CREATE TABLE target_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  target_id uuid NOT NULL REFERENCES client_targets (id),
  user_id uuid NOT NULL REFERENCES users (id),
  ended_at timestamptz,
  created_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX target_assignments_active_idx
  ON target_assignments (target_id, user_id)
  WHERE ended_at IS NULL;

CREATE TABLE program_configuration_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  program_id uuid NOT NULL REFERENCES client_programs (id),
  version integer NOT NULL,
  measurement_type text NOT NULL,
  expected_trial_count integer,
  mastery_criteria text NOT NULL DEFAULT '',
  teaching_procedure text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id, version)
);

CREATE TABLE target_configuration_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  target_id uuid NOT NULL REFERENCES client_targets (id),
  version integer NOT NULL,
  measurement_method text NOT NULL,
  expected_trial_count integer,
  mastery_criteria text NOT NULL DEFAULT '',
  baseline_note text NOT NULL DEFAULT '',
  prompt_hierarchy text NOT NULL DEFAULT '',
  teaching_instructions text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_id, version)
);

INSERT INTO program_configuration_versions (
  organization_id, program_id, version, measurement_type, mastery_criteria, teaching_procedure, reason, created_by
)
SELECT organization_id, id, 1, 'frequency', '', '', 'Initial configuration', created_by
FROM client_programs;

INSERT INTO target_configuration_versions (
  organization_id, target_id, version, measurement_method, mastery_criteria, baseline_note, prompt_hierarchy, teaching_instructions, reason, created_by
)
SELECT organization_id, id, 1, 'frequency', '', '', '', '', 'Initial configuration', created_by
FROM client_targets;

CREATE TABLE clinical_change_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  record_type text NOT NULL,
  record_id uuid NOT NULL,
  reason text NOT NULL,
  created_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clinical_change_reasons_type_check CHECK (record_type IN ('program', 'target', 'assessment')),
  CONSTRAINT clinical_change_reasons_length_check CHECK (char_length(reason) >= 12)
);

CREATE TABLE session_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  client_id uuid NOT NULL REFERENCES clients (id),
  session_id uuid NOT NULL REFERENCES therapy_sessions (id),
  target_id uuid NOT NULL REFERENCES client_targets (id),
  configuration_version_id uuid NOT NULL REFERENCES target_configuration_versions (id),
  measurement_method text NOT NULL,
  note text NOT NULL DEFAULT '',
  frequency_count integer,
  duration_seconds integer,
  antecedent text,
  behavior_note text,
  consequence text,
  recorded_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT session_observations_measurement_check CHECK (measurement_method IN ('trial', 'probe', 'frequency', 'duration', 'abc'))
);

CREATE INDEX session_observations_target_idx ON session_observations (target_id, created_at DESC);

CREATE TABLE observation_trials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  observation_id uuid NOT NULL REFERENCES session_observations (id),
  trial_number integer NOT NULL,
  result text NOT NULL,
  prompt_level text,
  CONSTRAINT observation_trials_result_check CHECK (result IN ('correct', 'incorrect', 'prompted', 'no_response')),
  UNIQUE (observation_id, trial_number)
);

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'assessment_templates',
    'assessment_template_items',
    'assessments',
    'assessment_items',
    'assessment_documents',
    'program_templates',
    'program_template_targets',
    'program_goals',
    'program_assignments',
    'program_documents',
    'target_assignments',
    'program_configuration_versions',
    'target_configuration_versions',
    'clinical_change_reasons',
    'session_observations',
    'observation_trials'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (organization_id = NULLIF(current_setting(''app.organization_id'', true), '''')::uuid) WITH CHECK (organization_id = NULLIF(current_setting(''app.organization_id'', true), '''')::uuid)',
      table_name
    );
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  assessment_templates,
  assessment_template_items,
  assessments,
  assessment_items,
  assessment_documents,
  program_templates,
  program_template_targets,
  program_goals,
  program_assignments,
  program_documents,
  target_assignments,
  program_configuration_versions,
  target_configuration_versions,
  clinical_change_reasons,
  session_observations,
  observation_trials
TO abapro_app;
