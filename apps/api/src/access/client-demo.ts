import { recordAudit } from '../common/audit';
import type { Queryable } from '../db/database';

export async function seedDemoClients(tx: Queryable, organizationId: string, userId: string): Promise<number> {
  const existing = await tx.query(
    `SELECT 1 AS present FROM clients WHERE organization_id = $1 AND lower(client_code) = 'demo-1042'`,
    [organizationId],
  );
  if (existing.length > 0) {
    return 0;
  }

  const rowan = await insertClient(tx, organizationId, userId, {
    code: 'DEMO-1042',
    name: 'Rowan Ellis',
    preferred: 'Ro',
    language: 'English',
    timezone: 'America/Chicago',
    dob: '2018-03-14',
    status: 'active',
  });
  const quinn = await insertClient(tx, organizationId, userId, {
    code: 'DEMO-1048',
    name: 'Quinn Patel',
    preferred: null,
    language: 'English',
    timezone: 'America/Chicago',
    dob: '2016-11-02',
    status: 'inactive',
  });
  const sloane = await insertClient(tx, organizationId, userId, {
    code: 'DEMO-1103',
    name: 'Sloane Brooks',
    preferred: null,
    language: 'Spanish',
    timezone: 'America/Chicago',
    dob: '2019-07-22',
    status: 'active',
  });

  await tx.query(
    `INSERT INTO client_sensitive_profiles (
       client_id, organization_id, summary, medical_history, allergies, precautions, communication_preferences
     ) VALUES
     ($1, $4, 'No additional clinic notes.', 'No hospital admissions are recorded in this clinic file.', 'No known allergies.', 'Uses a picture schedule during transitions.', 'Short spoken phrases and picture cards.'),
     ($2, $4, 'Inactive sample record.', 'Seasonal congestion noted by the family in 2025.', 'Peanuts.', 'Keep emergency medication with the caregiver, not in the session room.', 'Responds best to one-step spoken directions.'),
     ($3, $4, '', 'No medical precautions recorded.', 'No known allergies.', '', 'Bilingual. Family prefers Spanish for caregiver updates.')`,
    [rowan, quinn, sloane, organizationId],
  );

  await tx.query(
    `INSERT INTO client_guardians (
       organization_id, client_id, name, relationship, email, phone, channels, emergency_contact, portal_access, created_by
     ) VALUES
     ($1, $2, 'Morgan Ellis', 'parent', 'morgan.ellis@example.test', '555-0108', '["email","phone"]'::jsonb, true, false, $4),
     ($1, $2, 'Casey Ellis', 'grandparent', 'casey.ellis@example.test', '555-0144', '["phone"]'::jsonb, false, false, $4),
     ($1, $3, 'Amina Patel', 'parent', 'amina.patel@example.test', '555-0172', '["email"]'::jsonb, true, false, $4)`,
    [organizationId, rowan, quinn, userId],
  );

  await tx.query(
    `INSERT INTO client_behaviors (
       organization_id, client_id, name, operational_definition, measurement_type, measurement_notes, created_by
     ) VALUES (
       $1, $2, 'Leaves the work area',
       'Any time Rowan stands and moves more than one step away from the work chair without a request to move.',
       'frequency', 'Count each occurrence during the session.', $3
     )`,
    [organizationId, rowan, userId],
  );

  await tx.query(
    `INSERT INTO client_goals (
       organization_id, client_id, statement, objective, assessment_reference, review_on, created_by
     ) VALUES (
       $1, $2, 'Request a break with a picture card',
       'Independently exchanges the break card in 4 of 5 opportunities across two consecutive sessions.',
       'Clinic observation, March 2026', '2026-12-01', $3
     )`,
    [organizationId, rowan, userId],
  );

  await tx.query(
    `INSERT INTO client_assessment_references (organization_id, client_id, title, instrument, completed_on, notes, created_by)
     VALUES ($1, $2, 'Communication snapshot', 'Clinic observation', '2026-03-18', 'Synthetic sample. Not a diagnosis.', $3)`,
    [organizationId, rowan, userId],
  );

  const programs = await tx.query<{ id: string; client_id: string }>(
    `INSERT INTO client_programs (organization_id, client_id, name, status, created_by) VALUES
     ($1, $2, 'Functional communication', 'active', $4),
     ($1, $3, 'Listener responding', 'paused', $4)
     RETURNING id, client_id`,
    [organizationId, rowan, sloane, userId],
  );
  for (const program of programs) {
    await tx.query(
      `INSERT INTO program_configuration_versions (
         organization_id, program_id, version, measurement_type, mastery_criteria, teaching_procedure, reason, created_by
       ) VALUES ($1, $2, 1, 'frequency', '', '', 'Initial configuration', $3)`,
      [organizationId, program.id, userId],
    );
  }

  await tx.query(
    `INSERT INTO therapy_sessions (organization_id, client_id, started_at, ended_at, status, created_by)
     VALUES ($1, $2, '2026-10-12T15:00:00Z', '2026-10-12T16:00:00Z', 'completed', $3)`,
    [organizationId, rowan, userId],
  );

  for (const id of [rowan, quinn, sloane]) {
    await recordAudit(tx, {
      organizationId,
      actorUserId: userId,
      action: 'client.created',
      targetType: 'client',
      targetId: id,
      metadata: { sample: true },
    });
  }
  return 3;
}

async function insertClient(
  tx: Queryable,
  organizationId: string,
  userId: string,
  input: {
    code: string;
    name: string;
    preferred: string | null;
    language: string;
    timezone: string;
    dob: string;
    status: 'active' | 'inactive';
  },
): Promise<string> {
  const rows = await tx.query<{ id: string }>(
    `INSERT INTO clients (
       organization_id, display_name, client_code, preferred_name, language, timezone, date_of_birth, status, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [organizationId, input.name, input.code, input.preferred, input.language, input.timezone, input.dob, input.status, userId],
  );
  return String(rows[0]?.id);
}
