import { Body, Controller, Get, HttpCode, HttpException, Inject, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import type { AuthProviderInfo, AuthUser, LogoutResult, SignInAccount } from '@abapro/shared';
import type { Request, Response } from 'express';
import * as Iron from '@hapi/iron';
import type { AppConfig } from '../config/app-config';
import { APP_CONFIG } from '../config/app-config.module';
import { Public } from '../common/auth.decorators';
import { CurrentUser } from '../common/current-user.decorator';
import {
  clearCookie,
  clientAddress,
  consumeRateLimit,
  OIDC_COOKIE,
  readCookie,
  safeReturnTo,
  SESSION_COOKIE,
  setCookie,
} from '../common/http';
import type { AuthenticatedRequest } from '../common/session-auth.guard';
import { CreateSignInAccountDto, PasswordLoginDto } from './auth.dto';
import { AccountService } from './account.service';
import { authenticateIdentity } from '../identity/directory';
import { DATABASE } from '../db/database.module';
import type { Database } from '../db/database';
import { OidcClientService } from './oidc-client.service';
import { PlatformAccountService } from './platform-account.service';
import { SessionService } from './session.service';

interface StoredAuthorization {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
}

@Controller('v1/auth')
export class AuthController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DATABASE) private readonly database: Database,
    @Inject(OidcClientService) private readonly oidc: OidcClientService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AccountService) private readonly accounts: AccountService,
    @Inject(PlatformAccountService) private readonly platformAccounts: PlatformAccountService,
  ) {}

  @Public()
  @Get('config')
  configInfo(): AuthProviderInfo {
    return {
      passwordResetEnabled: Boolean(this.config.passwordResetUrl),
      embeddedIdentity: this.config.embeddedOidc,
      mailboxUrl:
        this.config.embeddedOidc && this.config.nodeEnv !== 'production' ? `${this.config.oidcIssuer}/identity/outbox` : null,
    };
  }

  @Public()
  @Get('login')
  async login(@Query('returnTo') returnTo: string | undefined, @Req() request: Request, @Res() response: Response): Promise<void> {
    if (this.config.rateLimit && !consumeRateLimit(`login:${clientAddress(request)}`, 20, 10 * 60 * 1000)) {
      response.status(429).json({
        statusCode: 429,
        message: 'Too many attempts. Try again later.',
        path: request.originalUrl,
        timestamp: new Date().toISOString(),
      });
      return;
    }
    const authorization = await this.oidc.startAuthorization();
    const sealed = await Iron.seal(
      {
        state: authorization.state,
        nonce: authorization.nonce,
        codeVerifier: authorization.codeVerifier,
        returnTo: safeReturnTo(returnTo),
      } satisfies StoredAuthorization,
      this.config.cookieSecret,
      Iron.defaults,
    );
    setCookie(response, OIDC_COOKIE, sealed, {
      secure: this.config.cookieSecure,
      path: '/api/v1/auth',
      maxAgeSeconds: 10 * 60,
    });
    response.redirect(authorization.url);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async passwordLogin(
    @Body() body: PasswordLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthUser> {
    if (this.config.rateLimit && !consumeRateLimit(`password-login:${clientAddress(request)}:${body.email}`, 8, 10 * 60 * 1000)) {
      throw new HttpException('Too many attempts. Try again later.', 429);
    }
    const account = await authenticateIdentity(this.database, body.email, body.password);
    if (!account) {
      throw new UnauthorizedException('The email or password is incorrect.');
    }
    const created = await this.sessions.createForAccount(account);
    setCookie(response, SESSION_COOKIE, created.secret, {
      secure: this.config.cookieSecure,
      path: '/api',
      maxAgeSeconds: this.config.sessionAbsoluteSeconds,
    });
    const signedIn = await this.accounts.load(created.userId, null);
    const onlyOrganization = signedIn.organizations.length === 1 ? signedIn.organizations[0] : null;
    if (!onlyOrganization) {
      return signedIn;
    }
    await this.sessions.setOrganization(this.database, created.sessionId, onlyOrganization.id);
    const withOrganization = await this.accounts.load(created.userId, onlyOrganization.id, null);
    await this.sessions.setClinic(this.database, created.sessionId, withOrganization.clinic?.id ?? null);
    return withOrganization;
  }

  @Get('accounts')
  accountsList(@CurrentUser() user: AuthUser): Promise<SignInAccount[]> {
    return this.platformAccounts.list(user);
  }

  @Post('accounts')
  createAccount(@CurrentUser() user: AuthUser, @Body() body: CreateSignInAccountDto): Promise<SignInAccount> {
    return this.platformAccounts.create(user, body);
  }

  @Public()
  @Get('callback')
  async callback(@Req() request: Request, @Res() response: Response): Promise<void> {
    const failure = (code: 'signin_failed' | 'signin_cancelled') => {
      clearCookie(response, OIDC_COOKIE, { secure: this.config.cookieSecure, path: '/api/v1/auth' });
      response.redirect(`${this.config.webOrigin}/login?error=${code}`);
    };
    if (typeof request.query.error === 'string') {
      failure(request.query.error === 'access_denied' ? 'signin_cancelled' : 'signin_failed');
      return;
    }
    const sealed = readCookie(request, OIDC_COOKIE);
    if (!sealed) {
      failure('signin_failed');
      return;
    }
    try {
      const stored = (await Iron.unseal(sealed, this.config.cookieSecret, Iron.defaults)) as StoredAuthorization;
      const currentUrl = new URL(this.config.oidcRedirectUri);
      currentUrl.search = new URL(request.originalUrl, this.config.webOrigin).search;
      const tokens = await this.oidc.exchange(currentUrl, stored);
      const secret = await this.sessions.create(tokens);
      clearCookie(response, OIDC_COOKIE, { secure: this.config.cookieSecure, path: '/api/v1/auth' });
      setCookie(response, SESSION_COOKIE, secret, {
        secure: this.config.cookieSecure,
        path: '/api',
        maxAgeSeconds: this.config.sessionAbsoluteSeconds,
      });
      response.redirect(`${this.config.webOrigin}${safeReturnTo(stored.returnTo)}`);
    } catch (error) {
      if (this.config.nodeEnv !== 'production' && error instanceof Error) {
        console.error(`Sign-in callback failed: ${error.message}`);
      }
      failure('signin_failed');
    }
  }

  @Public()
  @Get('password-reset')
  passwordReset(@Res() response: Response): void {
    if (!this.config.passwordResetUrl) {
      response.redirect(`${this.config.webOrigin}/login?error=signin_failed`);
      return;
    }
    response.redirect(this.config.passwordResetUrl);
  }

  @Public()
  @Post('logout')
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<LogoutResult> {
    const secret = readCookie(request, SESSION_COOKIE);
    clearCookie(response, SESSION_COOKIE, { secure: this.config.cookieSecure, path: '/api' });
    if (!secret) {
      return { endSessionUrl: null };
    }
    return this.sessions.revoke(secret);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }

  @Post('refresh')
  refresh(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}

export function sessionIdFrom(request: AuthenticatedRequest): string {
  if (!request.sessionId) {
    throw new HttpException('Authentication is required.', 401);
  }
  return request.sessionId;
}
