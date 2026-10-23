import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { PlatformDashboardController } from './platform-dashboard.controller';
import { PlatformDashboardService } from './platform-dashboard.service';

@Module({
  controllers: [DashboardController, PlatformDashboardController],
  providers: [DashboardService, PlatformDashboardService],
})
export class DashboardModule {}
