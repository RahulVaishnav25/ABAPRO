import { Controller, Get, Inject } from '@nestjs/common';
import type { AuthUser, PlatformDashboard } from '@abapro/shared';
import { CurrentUser } from '../common/current-user.decorator';
import { PlatformDashboardService } from './platform-dashboard.service';

@Controller('v1/platform/dashboard')
export class PlatformDashboardController {
  constructor(@Inject(PlatformDashboardService) private readonly dashboard: PlatformDashboardService) {}

  @Get()
  getDashboard(@CurrentUser() user: AuthUser): Promise<PlatformDashboard> {
    return this.dashboard.get(user);
  }
}
