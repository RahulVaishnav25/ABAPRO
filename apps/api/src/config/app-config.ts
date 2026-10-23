export interface AppConfig {
  nodeEnv: string;
  port: number;
  oidcPort: number;
  webOrigin: string;
  corsOrigin: string;
  databaseUrl: string | null;
  pgliteDir: string;
  sessionIdleSeconds: number;
  sessionAbsoluteSeconds: number;
  cookieSecure: boolean;
  cookieSecret: string;
  embeddedOidc: boolean;
  oidcIssuer: string;
  oidcClientId: string;
  oidcClientSecret: string;
  oidcRedirectUri: string;
  passwordResetUrl: string | null;
  rateLimit: boolean;
}

const DEV_COOKIE_SECRET = 'dev-only-cookie-secret-change-me!!';
const DEV_OIDC_CLIENT_SECRET = 'dev-only-oidc-client-secret-change';

export function readAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const port = readPort(env.PORT, 3001);
  const oidcPort = readPort(env.OIDC_PORT, port + 1);
  const webOrigin = (env.WEB_ORIGIN ?? 'http://localhost:5173').replace(/\/$/, '');
  const embeddedRequested = env.EMBEDDED_OIDC !== 'false';
  const embeddedOidc = nodeEnv === 'production' ? false : embeddedRequested;
  if (nodeEnv === 'production' && env.EMBEDDED_OIDC === 'true') {
    throw new Error('Embedded OpenID Connect cannot run in production. Set OIDC_ISSUER to your identity provider.');
  }

  const cookieSecret = env.COOKIE_SECRET ?? (nodeEnv === 'production' ? '' : DEV_COOKIE_SECRET);
  const oidcClientSecret = env.OIDC_CLIENT_SECRET ?? (embeddedOidc ? DEV_OIDC_CLIENT_SECRET : '');
  const oidcClientId = env.OIDC_CLIENT_ID ?? (embeddedOidc ? 'abapro-web' : '');
  const oidcIssuer = (env.OIDC_ISSUER ?? (embeddedOidc ? `http://127.0.0.1:${oidcPort}` : '')).replace(/\/$/, '');
  const databaseUrl = env.DATABASE_URL ?? null;

  if (nodeEnv === 'production') {
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required in production.');
    }
    if (!oidcIssuer || !oidcIssuer.startsWith('https://')) {
      throw new Error('OIDC_ISSUER must be the HTTPS issuer of your identity provider in production.');
    }
    if (!oidcClientId || !oidcClientSecret || oidcClientSecret === DEV_OIDC_CLIENT_SECRET) {
      throw new Error('OIDC_CLIENT_ID and OIDC_CLIENT_SECRET must be set to production credentials.');
    }
    if (!cookieSecret || cookieSecret.length < 32 || cookieSecret === DEV_COOKIE_SECRET) {
      throw new Error('COOKIE_SECRET must be a unique value of at least 32 characters in production.');
    }
  } else if (!embeddedOidc) {
    if (!oidcIssuer || !oidcClientId || !oidcClientSecret) {
      throw new Error('OIDC_ISSUER, OIDC_CLIENT_ID, and OIDC_CLIENT_SECRET are required when EMBEDDED_OIDC=false.');
    }
  }

  if (cookieSecret.length < 32) {
    throw new Error('COOKIE_SECRET must be at least 32 characters.');
  }

  const passwordResetUrl =
    env.OIDC_PASSWORD_RESET_URL ?? (embeddedOidc ? `${oidcIssuer}/identity/reset` : null);

  return {
    nodeEnv,
    port,
    oidcPort,
    webOrigin,
    corsOrigin: env.CORS_ORIGIN ?? webOrigin,
    databaseUrl,
    pgliteDir: env.PGLITE_DIR ?? 'data/pglite',
    sessionIdleSeconds: 60 * 60 * 8,
    sessionAbsoluteSeconds: 60 * 60 * 12,
    cookieSecure: nodeEnv === 'production',
    cookieSecret,
    embeddedOidc,
    oidcIssuer,
    oidcClientId,
    oidcClientSecret,
    oidcRedirectUri: env.OIDC_REDIRECT_URI ?? `${webOrigin}/api/v1/auth/callback`,
    passwordResetUrl,
    rateLimit: env.RATE_LIMIT !== 'false',
  };
}

function readPort(value: string | undefined, fallback: number): number {
  const port = Number(value ?? fallback);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('Ports must be positive integers.');
  }
  return port;
}
