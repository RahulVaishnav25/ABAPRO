-- Counts the clients a parent account is linked to in an organisation, through active guardian assignments.
-- Sign-in and every request use it, outside any tenant transaction, so it sets the tenant itself for the
-- row-level security policies and then puts back whatever was set before. Clinic scope is cleared so that a
-- link to a child in any clinic counts.

CREATE OR REPLACE FUNCTION parent_linked_client_count(target_user uuid, target_organization uuid) RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  previous_organization text := current_setting('app.organization_id', true);
  previous_clinic text := current_setting('app.clinic_id', true);
  linked integer;
BEGIN
  PERFORM set_config('app.organization_id', target_organization::text, true);
  PERFORM set_config('app.clinic_id', '', true);
  SELECT count(DISTINCT a.client_id) INTO linked
  FROM client_assignments a
  WHERE a.user_id = target_user
    AND a.organization_id = target_organization
    AND a.relationship = 'guardian'
    AND a.ended_at IS NULL;
  PERFORM set_config('app.organization_id', COALESCE(previous_organization, ''), true);
  PERFORM set_config('app.clinic_id', COALESCE(previous_clinic, ''), true);
  RETURN linked;
END
$$;

GRANT EXECUTE ON FUNCTION parent_linked_client_count(uuid, uuid) TO abapro_app;
