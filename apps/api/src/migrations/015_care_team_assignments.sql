-- Clinical supervisors could previously be assigned to a client as a therapist.
-- Supervisors now reach a client through a supervisor assignment, so move those rows over.

-- A supervisor who is already assigned as supervisor keeps that row, and the duplicate therapist row ends.
UPDATE client_assignments a
SET ended_at = now()
WHERE a.relationship = 'therapist'
  AND a.ended_at IS NULL
  AND EXISTS (
    SELECT 1 FROM organization_memberships m
    WHERE m.organization_id = a.organization_id AND m.user_id = a.user_id AND m.role = 'clinical_supervisor'
  )
  AND EXISTS (
    SELECT 1 FROM client_assignments s
    WHERE s.client_id = a.client_id AND s.user_id = a.user_id AND s.relationship = 'supervisor' AND s.ended_at IS NULL
  );

UPDATE client_assignments a
SET relationship = 'supervisor'
WHERE a.relationship = 'therapist'
  AND a.ended_at IS NULL
  AND EXISTS (
    SELECT 1 FROM organization_memberships m
    WHERE m.organization_id = a.organization_id AND m.user_id = a.user_id AND m.role = 'clinical_supervisor'
  );
