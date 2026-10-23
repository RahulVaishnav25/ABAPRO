CREATE TABLE platform_role_customizations (
  role text PRIMARY KEY
);

CREATE TABLE platform_role_grants (
  role text NOT NULL,
  permission text NOT NULL,
  PRIMARY KEY (role, permission)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON platform_role_customizations, platform_role_grants TO abapro_app;
