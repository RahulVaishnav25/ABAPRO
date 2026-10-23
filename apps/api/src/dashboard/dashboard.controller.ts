import { Controller, Get, Inject } from '@nestjs/common';
import { PERMISSIONS, type AuthUser, type DashboardResponse } from '@abapro/shared';
import { RequirePermissions } from '../common/auth.decorators';
import { CurrentUser } from '../common/current-user.decorator';
import { DashboardService } from './dashboard.service';

@Controller('v1/dashboard')
export class DashboardController {
  constructor(@Inject(DashboardService) private readonly dashboard: DashboardService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.dashboardView)
  getDashboard(@CurrentUser() user: AuthUser): DashboardResponse {
    return this.dashboard.getForUser(user);
  }
}
