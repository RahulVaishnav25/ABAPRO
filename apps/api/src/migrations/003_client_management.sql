ALTER TABLE client_sensitive_profiles
  ADD COLUMN medical_history text NOT NULL DEFAULT '',
  ADD COLUMN allergies text NOT NULL DEFAULT '',
  ADD COLUMN precautions text NOT NULL DEFAULT '',
  ADD COLUMN communication_preferences text NOT NULL DEFAULT '';

ALTER TABLE clients
  ADD COLUMN client_code text,
  ADD COLUMN preferred_name text,
  ADD COLUMN language text,
  ADD COLUMN timezone text,
  ADD COLUMN date_of_birth date,
  ADD COLUMN avatar_object_id uuid;

UPDATE clients
SET client_code = 'C-' || upper(substr(replace(id::text, '-', ''), 1, 12))
WHERE client_code IS NULL;

ALTER TABLE clients ALTER COLUMN client_code SET NOT NULL;

CREATE UNIQUE INDEX clients_org_code_idx ON clients (organization_id, lower(client_code));

ALTER TABLE client_assignments
  ADD COLUMN ended_at timestamptz;

ALTER TABLE client_assignments DROP CONSTRAINT client_assignments_relationship_check;

ALTER TABLE client_assignments
  ADD CONSTRAINT client_assignments_relationship_check
  CHECK (relationship IN ('therapist', 'supervisor', 'guardian'));

ALTER TABLE client_assignments DROP CONSTRAINT client_assignments_client_id_user_id_relationship_key;

CREATE UNIQUE INDEX client_assignments_active_idx
  ON client_assignments (client_id, user_id, relationship)
  WHERE ended_at IS NULL;

ALTER TABLE client_programs
  ADD COLUMN status text NOT NULL DEFAULT 'active',
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE client_programs
  ADD CONSTRAINT client_programs_status_check
  CHECK (status IN ('active', 'paused', 'completed', 'discontinued'));

ALTER TABLE client_documents
  ADD COLUMN storage_key text,
  ADD COLUMN byte_size integer,
  ADD COLUMN sha256 text,
  ADD COLUMN scan_status text NOT NULL DEFAULT 'not_configured',
  ADD COLUMN category text NOT NULL DEFAULT 'record';

UPDATE client_documents
SET storage_key = 'private/' || organization_id::text || '/clients/' || client_id::text || '/documents/' || id::text,
    byte_size = octet_length(content),
    sha256 = 'legacy'
WHERE storage_key IS NULL;

ALTER TABLE client_documents ALTER COLUMN storage_key SET NOT NULL;
ALTER TABLE client_documents ALTER COLUMN byte_size SET NOT NULL;
ALTER TABLE client_documents ALTER COLUMN sha256 SET NOT NULL;

ALTER TABLE client_documents
  ADD CONSTRAINT client_documents_scan_status_check
  CHECK (scan_status IN ('not_configured', 'rejected'));

ALTER TABLE client_documents
  ADD CONSTRAINT client_documents_category_check
  CHECK (category IN ('record', 'assessment', 'care', 'supporting', 'avatar'));

ALTER TABLE clients
  ADD CONSTRAINT clients_avatar_fk FOREIGN KEY (avatar_object_id) REFERENCES client_documents (id);

CREATE TABLE client_guardians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  client_id uuid NOT NULL REFERENCES clients (id),
  name text NOT NULL,
  relationship text NOT NULL,
  email text,
  phone text,
  channels jsonb NOT NULL DEFAULT '[]'::jsonb,
  emergency_contact boolean NOT NULL DEFAULT false,
  portal_access boolean NOT NULL DEFAULT false,
  linked_user_id uuid REFERENCES users (id),
  ended_at timestamptz,
  created_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_guardians_relationship_check CHECK (
    relationship IN ('parent', 'guardian', 'grandparent', 'caregiver', 'other')
  )
);

CREATE INDEX client_guardians_client_idx ON client_guardians (client_id);

CREATE TABLE client_behaviors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  client_id uuid NOT NULL REFERENCES clients (id),
  name text NOT NULL,
  operational_definition text NOT NULL,
  measurement_type text NOT NULL,
  measurement_notes text,
  status text NOT NULL DEFAULT 'active',
  created_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_behaviors_measurement_check CHECK (
    measurement_type IN ('frequency', 'duration', 'interval', 'latency', 'rate')
  ),
  CONSTRAINT client_behaviors_status_check CHECK (status IN ('active', 'discontinued'))
);

CREATE INDEX client_behaviors_client_idx ON client_behaviors (client_id);

CREATE TABLE client_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  client_id uuid NOT NULL REFERENCES clients (id),
  statement text NOT NULL,
  objective text,
  assessment_reference text,
  review_on date,
  status text NOT NULL DEFAULT 'active',
  created_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_goals_status_check CHECK (status IN ('active', 'met', 'discontinued'))
);

CREATE INDEX client_goals_client_idx ON client_goals (client_id);

CREATE TABLE client_assessment_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  client_id uuid NOT NULL REFERENCES clients (id),
  title text NOT NULL,
  instrument text,
  completed_on date,
  notes text,
  created_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX client_assessment_references_client_idx ON client_assessment_references (client_id);

CREATE TABLE therapy_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  client_id uuid NOT NULL REFERENCES clients (id),
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  status text NOT NULL,
  created_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT therapy_sessions_status_check CHECK (status IN ('scheduled', 'completed', 'cancelled'))
);

CREATE INDEX therapy_sessions_client_idx ON therapy_sessions (client_id, started_at DESC);

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'client_guardians',
    'client_behaviors',
    'client_goals',
    'client_assessment_references',
    'therapy_sessions'
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
  client_guardians,
  client_behaviors,
  client_goals,
  client_assessment_references,
  therapy_sessions
TO abapro_app;
