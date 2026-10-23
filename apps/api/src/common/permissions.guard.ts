import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser, Permission } from '@abapro/shared';
import { ANY_PERMISSIONS_KEY, IS_PUBLIC, PERMISSIONS_KEY } from './auth.decorators';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const anyOf = this.reflector.getAllAndOverride<Permission[]>(ANY_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if ((!required || required.length === 0) && (!anyOf || anyOf.length === 0)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException('Authentication is required.');
    }

    const hasAll = !required?.length || required.every((permission) => user.permissions.includes(permission));
    const hasAny = !anyOf?.length || anyOf.some((permission) => user.permissions.includes(permission));
    if (!hasAll || !hasAny) {
      throw new ForbiddenException('You do not have access to this resource.');
    }
    return true;
  }
}
