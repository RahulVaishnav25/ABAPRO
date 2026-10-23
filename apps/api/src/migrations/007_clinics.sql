CREATE TABLE clinics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  name text NOT NULL,
  location text NOT NULL,
  address text,
  contact_email text,
  contact_phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE INDEX clinics_organization_idx ON clinics (organization_id, name);

CREATE TABLE clinic_access (
  organization_id uuid NOT NULL REFERENCES organizations (id),
  clinic_id uuid NOT NULL REFERENCES clinics (id),
  user_id uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, user_id)
);

CREATE INDEX clinic_access_user_idx ON clinic_access (user_id, organization_id);

ALTER TABLE sessions ADD COLUMN clinic_id uuid REFERENCES clinics (id) ON DELETE SET NULL;
ALTER TABLE clients ADD COLUMN clinic_id uuid REFERENCES clinics (id);
ALTER TABLE therapy_sessions ADD COLUMN clinic_id uuid REFERENCES clinics (id);

INSERT INTO clinics (organization_id, name, location, contact_email)
SELECT id, name, country, contact_email
FROM organizations;

UPDATE clients
SET clinic_id = (
  SELECT c.id FROM clinics c WHERE c.organization_id = clients.organization_id ORDER BY c.created_at LIMIT 1
)
WHERE clinic_id IS NULL;

UPDATE therapy_sessions
SET clinic_id = (
  SELECT c.clinic_id FROM clients c WHERE c.id = therapy_sessions.client_id
)
WHERE clinic_id IS NULL;

INSERT INTO clinic_access (organization_id, clinic_id, user_id)
SELECT m.organization_id, c.id, m.user_id
FROM organization_memberships m
JOIN clinics c ON c.organization_id = m.organization_id
WHERE m.status = 'active' AND m.role <> 'organization_admin';

CREATE OR REPLACE FUNCTION assign_default_clinic() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.clinic_id IS NULL THEN
    SELECT id INTO NEW.clinic_id
    FROM clinics
    WHERE organization_id = NEW.organization_id
    ORDER BY created_at
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER clients_default_clinic
  BEFORE INSERT ON clients
  FOR EACH ROW
  EXECUTE FUNCTION assign_default_clinic();

CREATE OR REPLACE FUNCTION clinic_client_visible(target_client uuid) RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.clinic_id', true), '') IS NULL
    OR EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = target_client
        AND c.clinic_id = NULLIF(current_setting('app.clinic_id', true), '')::uuid
    )
$$;

DROP POLICY IF EXISTS tenant_isolation ON clients;
CREATE POLICY tenant_isolation ON clients
  USING (
    organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.clinic_id', true), '') IS NULL
      OR clinic_id = NULLIF(current_setting('app.clinic_id', true), '')::uuid
    )
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.clinic_id', true), '') IS NULL
      OR clinic_id = NULLIF(current_setting('app.clinic_id', true), '')::uuid
    )
  );

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'client_sensitive_profiles',
    'client_assignments',
    'shared_records',
    'client_documents',
    'clinical_observations',
    'client_programs',
    'client_targets',
    'exceptional_access_grants',
    'client_guardians',
    'client_behaviors',
    'client_goals',
    'client_assessment_references',
    'therapy_sessions',
    'assessments',
    'program_goals',
    'session_observations'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (organization_id = NULLIF(current_setting(''app.organization_id'', true), '''')::uuid AND clinic_client_visible(client_id)) WITH CHECK (organization_id = NULLIF(current_setting(''app.organization_id'', true), '''')::uuid AND clinic_client_visible(client_id))',
      table_name
    );
  END LOOP;
END $$;

ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinics FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON clinics
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE clinic_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_access FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON clinic_access
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON clinics, clinic_access TO abapro_app;
