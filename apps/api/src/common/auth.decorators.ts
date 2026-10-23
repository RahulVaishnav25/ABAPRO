import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@abapro/shared';

export const IS_PUBLIC = 'isPublic';
export const PERMISSIONS_KEY = 'permissions';
export const ANY_PERMISSIONS_KEY = 'any_permissions';

export const Public = () => SetMetadata(IS_PUBLIC, true);

export const RequirePermissions = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_KEY, permissions);
export const RequireAnyPermissions = (...permissions: Permission[]) => SetMetadata(ANY_PERMISSIONS_KEY, permissions);
