import { Body, Controller, Get, Inject, Param, Patch, Post, Put } from '@nestjs/common';
import { PERMISSIONS, type AuditEventView, type AuthUser, type TeamDirectory, type TeamMember } from '@abapro/shared';
import { RequirePermissions } from '../common/auth.decorators';
import { CurrentUser } from '../common/current-user.decorator';
import { ChangeRoleDto, GrantExceptionDto, UpdateRolePermissionsDto } from './access.dto';
import { TeamService } from './team.service';

@Controller('v1')
export class TeamController {
  constructor(@Inject(TeamService) private readonly team: TeamService) {}

  @Get('team')
  @RequirePermissions(PERMISSIONS.teamView)
  directory(@CurrentUser() user: AuthUser): Promise<TeamDirectory> {
    return this.team.directory(user);
  }

  @Put('team/permissions')
  @RequirePermissions(PERMISSIONS.teamMembershipManage)
  updatePermissions(@CurrentUser() user: AuthUser, @Body() body: UpdateRolePermissionsDto) {
    return this.team.updatePermissions(user, body);
  }

  @Patch('team/members/:membershipId')
  @RequirePermissions(PERMISSIONS.teamMembershipManage)
  changeRole(
    @CurrentUser() user: AuthUser,
    @Param('membershipId') membershipId: string,
    @Body() body: ChangeRoleDto,
  ): Promise<TeamMember> {
    return this.team.changeRole(user, membershipId, body);
  }

  @Post('team/members/:membershipId/revoke')
  @RequirePermissions(PERMISSIONS.teamMembershipManage)
  revoke(@CurrentUser() user: AuthUser, @Param('membershipId') membershipId: string) {
    return this.team.revoke(user, membershipId);
  }

  @Post('team/invitations/:invitationId/revoke')
  @RequirePermissions(PERMISSIONS.teamMembershipManage)
  revokeInvitation(@CurrentUser() user: AuthUser, @Param('invitationId') invitationId: string) {
    return this.team.revokeInvitation(user, invitationId);
  }

  @Post('access/exceptions')
  @RequirePermissions(PERMISSIONS.accessExceptionGrant)
  grantException(@CurrentUser() user: AuthUser, @Body() body: GrantExceptionDto) {
    return this.team.grantException(user, body);
  }

  @Get('audit')
  @RequirePermissions(PERMISSIONS.auditView)
  audit(@CurrentUser() user: AuthUser): Promise<AuditEventView[]> {
    return this.team.audit(user);
  }
}
