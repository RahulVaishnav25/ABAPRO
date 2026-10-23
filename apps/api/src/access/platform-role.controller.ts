import { Body, Controller, Get, Inject, Put } from '@nestjs/common';
import type { AuthUser, RolePermissionState } from '@abapro/shared';
import { CurrentUser } from '../common/current-user.decorator';
import { UpdateRolePermissionsDto } from './access.dto';
import { PlatformRoleService } from './platform-role.service';

@Controller('v1/platform/roles')
export class PlatformRoleController {
  constructor(@Inject(PlatformRoleService) private readonly roles: PlatformRoleService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<RolePermissionState[]> {
    return this.roles.list(user);
  }

  @Put()
  update(@CurrentUser() user: AuthUser, @Body() body: UpdateRolePermissionsDto): Promise<RolePermissionState> {
    return this.roles.update(user, body);
  }
}
