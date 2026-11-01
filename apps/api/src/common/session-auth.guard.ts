import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { PARENT_ACCESS_PENDING_MESSAGE, type AuthUser } from '@abapro/shared';
import type { AppConfig } from '../config/app-config';
import { APP_CONFIG } from '../config/app-config.module';
import { IS_PUBLIC } from './auth.decorators';
import { clearCookie, readCookie, SESSION_COOKIE } from './http';
import { SessionService } from '../auth/session.service';

export interface AuthenticatedRequest {
  headers: { cookie?: string };
  user?: AuthUser;
  sessionId?: string;
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const secret = readCookie(request, SESSION_COOKIE);
    if (!secret) {
      if (isPublic) {
        return true;
      }
      throw new UnauthorizedException('Authentication is required.');
    }

    const resolved = await this.sessions.resolve(secret);
    if (!resolved) {
      const response = context.switchToHttp().getResponse<Response>();
      clearCookie(response, SESSION_COOKIE, { secure: this.config.cookieSecure, path: '/api' });
      if (isPublic) {
        return true;
      }
      throw new UnauthorizedException('Your session has expired.');
    }

    // A parent whose last linked child was removed loses the session on the next signed-in request.
    // Public requests treat them as signed out but keep the session, so that request can still say why.
    if (resolved.user.parentAccessPending) {
      if (isPublic) {
        return true;
      }
      await this.sessions.revoke(secret);
      clearCookie(context.switchToHttp().getResponse<Response>(), SESSION_COOKIE, { secure: this.config.cookieSecure, path: '/api' });
      throw new UnauthorizedException(PARENT_ACCESS_PENDING_MESSAGE);
    }

    request.user = resolved.user;
    request.sessionId = resolved.sessionId;
    return true;
  }
}
