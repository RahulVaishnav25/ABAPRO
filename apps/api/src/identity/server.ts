import '../polyfill-url';
import { loadEsm } from '../load-esm';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { generateKeyPairSync, type JsonWebKey } from 'node:crypto';
import express, { type Request, type Response } from 'express';
import type { AppConfig } from '../config/app-config';
import { clientAddress, consumeRateLimit } from '../common/http';
import type { Database } from '../db/database';
import {
  authenticateIdentity,
  completePasswordReset,
  identityAccount,
  registerIdentity,
  requestPasswordReset,
} from './directory';
import { escapeHtml, loginFields, page } from './pages';

interface IdentityProvider {
  callback(): (req: IncomingMessage, res: ServerResponse) => void;
  interactionDetails(req: IncomingMessage, res: ServerResponse): Promise<InteractionDetails>;
  interactionFinished(
    req: IncomingMessage,
    res: ServerResponse,
    result: unknown,
    options?: { mergeWithLastSubmission?: boolean },
  ): Promise<void>;
  Grant: new (details: { accountId: string; clientId: string }) => {
    addOIDCScope(scope: string): void;
    save(): Promise<string>;
  };
}

interface InteractionDetails {
  prompt: { name: string };
  params: Record<string, string | string[] | undefined>;
  session?: { accountId?: string };
}

export async function startEmbeddedIdentity(db: Database, config: AppConfig): Promise<{ close(): Promise<void> } | null> {
  if (!config.embeddedOidc) {
    return null;
  }
  const imported = await loadEsm<{ default: new (issuer: string, configuration: object) => IdentityProvider }>('oidc-provider');
  const provider = new imported.default(config.oidcIssuer, providerConfiguration(db, config));
  const app = express();
  app.disable('x-powered-by');
  app.use('/identity', identityRouter(provider, db, config));
  app.use(provider.callback());
  const server = createServer(app);
  await listen(server, config.oidcPort);
  return {
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

function providerConfiguration(db: Database, config: AppConfig): object {
  return {
    clients: [
      {
        client_id: config.oidcClientId,
        client_secret: config.oidcClientSecret,
        redirect_uris: [config.oidcRedirectUri],
        post_logout_redirect_uris: [`${config.webOrigin}/login`],
        response_types: ['code'],
        grant_types: ['authorization_code', 'refresh_token'],
        token_endpoint_auth_method: 'client_secret_post',
      },
    ],
    cookies: { keys: [config.cookieSecret] },
    jwks: developmentJwks(),
    pkce: { required: () => true },
    features: {
      devInteractions: { enabled: false },
      revocation: { enabled: true },
      rpInitiatedLogout: { enabled: true },
    },
    interactions: {
      url(_ctx: unknown, interaction: { uid: string }) {
        return `/identity/interaction/${interaction.uid}`;
      },
    },
    ttl: {
      AccessToken: 15 * 60,
      AuthorizationCode: 60,
      IdToken: 60 * 60,
      RefreshToken: config.sessionAbsoluteSeconds,
      Session: config.sessionAbsoluteSeconds,
      Interaction: 10 * 60,
      Grant: config.sessionAbsoluteSeconds,
    },
    conformIdTokenClaims: false,
    issueRefreshToken: () => true,
    findAccount: async (_ctx: unknown, id: string) => {
      const account = await identityAccount(db, id);
      if (!account) {
        return undefined;
      }
      return {
        accountId: id,
        async claims() {
          return { sub: id, email: account.email, email_verified: false, name: account.name };
        },
      };
    },
    claims: {
      openid: ['sub'],
      email: ['email', 'email_verified'],
      profile: ['name'],
    },
    renderError(ctx: { type: string; body: string }, _out: unknown, _error: unknown) {
      ctx.type = 'html';
      ctx.body = page('Sign-in could not be completed', '<p class="error" role="alert">Sign-in could not be completed. Try again.</p>');
    },
  };
}

function identityRouter(provider: IdentityProvider, db: Database, config: AppConfig): express.Router {
  const router = express.Router();
  const parser = express.urlencoded({ extended: false });

  router.get('/interaction/:uid', async (req, res, next) => {
    try {
      const details = await provider.interactionDetails(req, res);
      if (details.prompt.name === 'consent') {
        const accountId = details.session?.accountId;
        const clientId = firstParam(details.params.client_id);
        if (accountId && clientId) {
          await finishConsent(provider, req, res, accountId, clientId);
          return;
        }
      }
      sendHtml(res, page('Sign in', loginFields(`/identity/interaction/${req.params.uid}/login`)));
    } catch (error) {
      next(error);
    }
  });

  router.post('/interaction/:uid/login', parser, async (req, res, next) => {
    try {
      const email = stringField(req.body, 'email');
      const password = stringField(req.body, 'password');
      if (config.rateLimit && !consumeRateLimit(`idp-login:${clientAddress(req)}:${email}`, 8, 10 * 60 * 1000)) {
        sendHtml(res, page('Sign in', loginFields(req.originalUrl, 'Too many attempts. Try again later.')), 429);
        return;
      }
      const details = await provider.interactionDetails(req, res);
      const account = await authenticateIdentity(db, email, password);
      if (!account) {
        sendHtml(res, page('Sign in', loginFields(req.originalUrl, 'The email or password is incorrect.')));
        return;
      }
      await finishLogin(provider, req, res, account.id, firstParam(details.params.client_id));
    } catch (error) {
      next(error);
    }
  });

  router.post('/interaction/:uid/register', parser, async (req, res, next) => {
    try {
      const details = await provider.interactionDetails(req, res);
      const result = await registerIdentity(db, {
        email: stringField(req.body, 'email'),
        name: stringField(req.body, 'name'),
        password: stringField(req.body, 'password'),
      });
      if (!result.ok) {
        sendHtml(res, page('Sign in', loginFields(`/identity/interaction/${req.params.uid}/login`, result.message)));
        return;
      }
      await finishLogin(provider, req, res, result.account.id, firstParam(details.params.client_id));
    } catch (error) {
      next(error);
    }
  });

  router.get('/reset', (_req, res) => {
    sendHtml(res, page('Reset password', resetRequestForm()));
  });

  router.post('/reset', parser, async (req, res, next) => {
    try {
      if (config.rateLimit && !consumeRateLimit(`reset:${clientAddress(req)}`, 5, 15 * 60 * 1000)) {
        sendHtml(res, page('Reset password', '<p class="error" role="alert">Too many attempts. Try again later.</p>'), 429);
        return;
      }
      await requestPasswordReset(db, config, stringField(req.body, 'email'));
      sendHtml(
        res,
        page('Reset password', '<p role="status">If an account exists for that email, a reset link was sent.</p>'),
      );
    } catch (error) {
      next(error);
    }
  });

  router.get('/reset/confirm', (req, res) => {
    sendHtml(res, page('Choose a new password', resetConfirmForm(stringField(req.query, 'token'))));
  });

  router.post('/reset/confirm', parser, async (req, res, next) => {
    try {
      const result = await completePasswordReset(db, stringField(req.body, 'token'), stringField(req.body, 'password'));
      if (!result.ok) {
        sendHtml(res, page('Choose a new password', resetConfirmForm(stringField(req.body, 'token'), result.message)));
        return;
      }
      sendHtml(
        res,
        page('Password updated', `<p role="status">Your password has been updated.</p><p><a href="${escapeHtml(config.webOrigin)}/login">Return to sign in</a></p>`),
      );
    } catch (error) {
      next(error);
    }
  });

  if (config.nodeEnv !== 'production') {
    router.get('/outbox', async (_req, res, next) => {
      try {
        const messages = await db.query(
          `SELECT recipient, subject, body, created_at FROM identity_outbound_messages ORDER BY created_at DESC LIMIT 50`,
        );
        const items = messages
          .map((message) => {
            const body = escapeHtml(String(message.body)).replace(
              /https?:\/\/[^\s<]+/g,
              (url) => `<a href="${url}">${url}</a>`,
            );
            return `<article><h2>${escapeHtml(String(message.subject))}</h2><p>${escapeHtml(String(message.recipient))}</p><pre>${body}</pre></article>`;
          })
          .join('');
        sendHtml(res, page('Development mailbox', items || '<p>No messages yet.</p>'));
      } catch (error) {
        next(error);
      }
    });
  }

  router.use((error: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : '';
    const status = message.toLowerCase().includes('interaction') ? 400 : 500;
    sendHtml(
      res,
      page('Sign-in could not be completed', '<p class="error" role="alert">This sign-in attempt has expired. Start again.</p>'),
      status,
    );
  });

  return router;
}

async function finishLogin(
  provider: IdentityProvider,
  req: Request,
  res: Response,
  accountId: string,
  clientId: string,
): Promise<void> {
  if (!clientId) {
    sendHtml(res, page('Sign-in could not be completed', '<p class="error" role="alert">Sign-in could not be completed. Try again.</p>'), 400);
    return;
  }
  const grant = new provider.Grant({ accountId, clientId });
  grant.addOIDCScope('openid email profile offline_access');
  const grantId = await grant.save();
  await provider.interactionFinished(req, res, { login: { accountId }, consent: { grantId } }, { mergeWithLastSubmission: false });
}

async function finishConsent(
  provider: IdentityProvider,
  req: Request,
  res: Response,
  accountId: string,
  clientId: string,
): Promise<void> {
  const grant = new provider.Grant({ accountId, clientId });
  grant.addOIDCScope('openid email profile offline_access');
  const grantId = await grant.save();
  await provider.interactionFinished(req, res, { consent: { grantId } }, { mergeWithLastSubmission: true });
}

function resetRequestForm(): string {
  return `<form method="post" action="/identity/reset">
    <label for="email">Email</label>
    <input id="email" name="email" type="email" autocomplete="username" required>
    <button type="submit">Send reset link</button>
  </form>`;
}

function resetConfirmForm(token: string, error = ''): string {
  return `${error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : ''}
    <form method="post" action="/identity/reset/confirm">
      <input type="hidden" name="token" value="${escapeHtml(token)}">
      <label for="password">New password</label>
      <input id="password" name="password" type="password" autocomplete="new-password" required>
      <button type="submit">Update password</button>
    </form>`;
}

function sendHtml(res: Response, html: string, status = 200): void {
  res.status(status).set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).send(html);
}

function stringField(source: unknown, key: string): string {
  if (!source || typeof source !== 'object' || !(key in source)) {
    return '';
  }
  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function developmentJwks(): { keys: JsonWebKey[] } {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = privateKey.export({ format: 'jwk' });
  jwk.kid = 'abapro-dev';
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  return { keys: [jwk] };
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
}
