-- Program notes, home activities for parents, and attachments including audio.
-- Notes keep every edit as a version. Attachments reuse client_documents for the stored file.
-- Parents read these for their linked child through the API, which checks the guardian assignment.

CREATE TABLE program_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  client_id uuid NOT NULL REFERENCES clients (id),
  program_id uuid NOT NULL REFERENCES client_programs (id),
  title text NOT NULL,
  body_html text NOT NULL,
  note_date date NOT NULL,
  author_id uuid NOT NULL REFERENCES users (id),
  author_role text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  updated_by uuid REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX program_notes_program_idx ON program_notes (program_id, note_date DESC);

CREATE TABLE program_note_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  client_id uuid NOT NULL REFERENCES clients (id),
  note_id uuid NOT NULL REFERENCES program_notes (id),
  version integer NOT NULL,
  title text NOT NULL,
  body_html text NOT NULL,
  note_date date NOT NULL,
  edited_by uuid NOT NULL REFERENCES users (id),
  editor_role text NOT NULL,
  edited_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (note_id, version)
);

CREATE TABLE program_home_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  client_id uuid NOT NULL REFERENCES clients (id),
  program_id uuid NOT NULL REFERENCES client_programs (id),
  title text NOT NULL,
  instructions text NOT NULL,
  purpose text NOT NULL DEFAULT '',
  frequency text NOT NULL DEFAULT '',
  guidance text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_by uuid NOT NULL REFERENCES users (id),
  creator_role text NOT NULL,
  updated_by uuid REFERENCES users (id),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX program_home_activities_program_idx ON program_home_activities (program_id, created_at DESC);

ALTER TABLE program_documents
  ADD COLUMN kind text NOT NULL DEFAULT 'document' CHECK (kind IN ('document', 'audio')),
  ADD COLUMN home_activity_id uuid REFERENCES program_home_activities (id);

ALTER TABLE program_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_notes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON program_notes
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid AND clinic_client_visible(client_id))
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid AND clinic_client_visible(client_id));

ALTER TABLE program_note_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_note_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON program_note_versions
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid AND clinic_client_visible(client_id))
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid AND clinic_client_visible(client_id));

ALTER TABLE program_home_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_home_activities FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON program_home_activities
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid AND clinic_client_visible(client_id))
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid AND clinic_client_visible(client_id));

-- Notes and activities are edited in place with their history kept, never deleted. Versions are only added.
GRANT SELECT, INSERT, UPDATE ON program_notes, program_home_activities TO abapro_app;
GRANT SELECT, INSERT ON program_note_versions TO abapro_app;
