import { Inject, Injectable } from '@nestjs/common';
import type { AppConfig } from '../config/app-config';
import { APP_CONFIG } from '../config/app-config.module';
import { loadEsm } from '../load-esm';

export interface AuthorizationRequest {
  url: string;
  state: string;
  nonce: string;
  codeVerifier: string;
}

export interface RefreshedTokens {
  refreshToken: string;
  idToken: string;
  expiresIn: number;
}

export interface IssuedTokens extends RefreshedTokens {
  subject: string;
  email: string;
  name: string;
  emailVerified: boolean;
}

interface TokenSet {
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  claims(): Record<string, unknown> | undefined;
}

interface OpenId {
  discovery(
    issuer: URL,
    clientId: string,
    clientSecret: string,
    clientAuthentication?: unknown,
    options?: { execute?: Array<(config: unknown) => void> },
  ): Promise<unknown>;
  allowInsecureRequests(config: unknown): void;
  randomPKCECodeVerifier(): string;
  calculatePKCECodeChallenge(verifier: string): Promise<string>;
  randomState(): string;
  randomNonce(): string;
  buildAuthorizationUrl(config: unknown, parameters: Record<string, string>): URL;
  authorizationCodeGrant(config: unknown, currentUrl: URL, checks: Record<string, string>): Promise<TokenSet>;
  refreshTokenGrant(config: unknown, refreshToken: string): Promise<TokenSet>;
  buildEndSessionUrl(config: unknown, parameters: Record<string, string>): URL;
}

@Injectable()
export class OidcClientService {
  private configuration: Promise<unknown> | null = null;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async startAuthorization(): Promise<AuthorizationRequest> {
    const openid = await this.openid();
    const configuration = await this.discover();
    const codeVerifier = openid.randomPKCECodeVerifier();
    const codeChallenge = await openid.calculatePKCECodeChallenge(codeVerifier);
    const state = openid.randomState();
    const nonce = openid.randomNonce();
    const url = openid.buildAuthorizationUrl(configuration, {
      redirect_uri: this.config.oidcRedirectUri,
      scope: 'openid email profile offline_access',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      nonce,
    });
    return { url: url.href, state, nonce, codeVerifier };
  }

  async exchange(currentUrl: URL, check: { state: string; nonce: string; codeVerifier: string }): Promise<IssuedTokens> {
    const openid = await this.openid();
    const tokens = await openid.authorizationCodeGrant(await this.discover(), currentUrl, {
      pkceCodeVerifier: check.codeVerifier,
      expectedState: check.state,
      expectedNonce: check.nonce,
    });
    return this.readTokens(tokens);
  }

  async refresh(refreshToken: string): Promise<RefreshedTokens> {
    const openid = await this.openid();
    const tokens = await openid.refreshTokenGrant(await this.discover(), refreshToken);
    if (!tokens.refresh_token || !tokens.id_token) {
      throw new Error('The identity provider did not renew the session.');
    }
    return {
      refreshToken: tokens.refresh_token,
      idToken: tokens.id_token,
      expiresIn: tokens.expires_in ?? 300,
    };
  }

  async endSessionUrl(idToken: string): Promise<string> {
    const openid = await this.openid();
    const url = openid.buildEndSessionUrl(await this.discover(), {
      client_id: this.config.oidcClientId,
      id_token_hint: idToken,
      post_logout_redirect_uri: `${this.config.webOrigin}/login`,
    });
    return url.href;
  }

  private readTokens(tokens: TokenSet): IssuedTokens {
    const claims = tokens.claims() ?? {};
    const subject = stringClaim(claims, 'sub');
    const email = stringClaim(claims, 'email');
    const name = stringClaim(claims, 'name') || email;
    if (!tokens.refresh_token || !tokens.id_token || !subject || !email) {
      throw new Error('The identity provider did not return a complete sign-in.');
    }
    return {
      refreshToken: tokens.refresh_token,
      idToken: tokens.id_token,
      expiresIn: tokens.expires_in ?? 300,
      subject,
      email,
      name,
      emailVerified: claims.email_verified === true,
    };
  }

  private async discover(): Promise<unknown> {
    if (!this.configuration) {
      const openid = await this.openid();
      const insecure = this.config.oidcIssuer.startsWith('http://');
      this.configuration = openid.discovery(
        new URL(this.config.oidcIssuer),
        this.config.oidcClientId,
        this.config.oidcClientSecret,
        undefined,
        insecure ? { execute: [openid.allowInsecureRequests] } : undefined,
      );
    }
    return this.configuration;
  }

  private async openid(): Promise<OpenId> {
    return loadEsm<OpenId>('openid-client');
  }
}

function stringClaim(claims: Record<string, unknown>, key: string): string {
  const value = claims[key];
  return typeof value === 'string' ? value : '';
}
