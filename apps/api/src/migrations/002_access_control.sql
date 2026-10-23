ALTER TABLE organization_memberships
  ADD COLUMN status text NOT NULL DEFAULT 'active',
  ADD COLUMN revoked_at timestamptz,
  ADD COLUMN last_active_at timestamptz;

ALTER TABLE organization_memberships
  ADD CONSTRAINT organization_memberships_status_check CHECK (status IN ('active', 'revoked'));

CREATE TABLE organization_role_customizations (
  organization_id uuid NOT NULL REFERENCES organizations (id),
  role text NOT NULL,
  PRIMARY KEY (organization_id, role)
);

CREATE TABLE organization_role_grants (
  organization_id uuid NOT NULL REFERENCES organizations (id),
  role text NOT NULL,
  permission text NOT NULL,
  PRIMARY KEY (organization_id, role, permission)
);

CREATE TABLE clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clients_status_check CHECK (status IN ('active', 'inactive'))
);

CREATE INDEX clients_organization_idx ON clients (organization_id);

CREATE TABLE client_sensitive_profiles (
  client_id uuid PRIMARY KEY REFERENCES clients (id),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  summary text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE client_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  client_id uuid NOT NULL REFERENCES clients (id),
  user_id uuid NOT NULL REFERENCES users (id),
  relationship text NOT NULL,
  created_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, user_id, relationship),
  CONSTRAINT client_assignments_relationship_check CHECK (relationship IN ('therapist', 'guardian'))
);

CREATE INDEX client_assignments_user_idx ON client_assignments (organization_id, user_id);

CREATE TABLE shared_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  client_id uuid NOT NULL REFERENCES clients (id),
  record_type text NOT NULL,
  record_id uuid NOT NULL,
  shared_with_user_id uuid NOT NULL REFERENCES users (id),
  shared_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (record_type, record_id, shared_with_user_id)
);

CREATE TABLE client_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  client_id uuid NOT NULL REFERENCES clients (id),
  file_name text NOT NULL,
  content_type text NOT NULL,
  content bytea NOT NULL,
  created_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE clinical_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  client_id uuid NOT NULL REFERENCES clients (id),
  note text NOT NULL,
  recorded_by uuid NOT NULL REFERENCES users (id),
  amended_by uuid REFERENCES users (id),
  amended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE client_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  client_id uuid NOT NULL REFERENCES clients (id),
  name text NOT NULL,
  created_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE client_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  client_id uuid NOT NULL REFERENCES clients (id),
  program_id uuid NOT NULL REFERENCES client_programs (id),
  name text NOT NULL,
  phase text NOT NULL DEFAULT 'baseline',
  created_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_targets_phase_check CHECK (phase IN ('baseline', 'intervention', 'maintenance', 'mastered'))
);

CREATE TABLE exceptional_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  client_id uuid NOT NULL REFERENCES clients (id),
  grantee_user_id uuid NOT NULL REFERENCES users (id),
  permissions jsonb NOT NULL,
  justification text NOT NULL,
  granted_by uuid NOT NULL REFERENCES users (id),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exceptional_access_justification_check CHECK (char_length(justification) >= 20)
);

CREATE INDEX exceptional_access_grantee_idx ON exceptional_access_grants (grantee_user_id, organization_id);

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'clients',
    'client_sensitive_profiles',
    'client_assignments',
    'shared_records',
    'client_documents',
    'clinical_observations',
    'client_programs',
    'client_targets',
    'exceptional_access_grants'
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

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'abapro_app') THEN
    CREATE ROLE abapro_app NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO abapro_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO abapro_app;
