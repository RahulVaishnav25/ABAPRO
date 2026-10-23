import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppConfigModule } from './config/app-config.module';
import { DatabaseModule } from './db/database.module';
import { SessionAuthGuard } from './common/session-auth.guard';
import { PermissionsGuard } from './common/permissions.guard';
import { AuthModule } from './auth/auth.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthModule } from './health/health.module';
import { ClinicalAccessModule } from './access/clinical-access.module';
import { ClinicalProgramsModule } from './clinical/clinical.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { ProgressModule } from './modules/progress/progress.module';
import { ReportsModule } from './modules/reports/reports.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { ParentPortalModule } from './modules/parent-portal/parent-portal.module';
import { MessagesModule } from './modules/messages/messages.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    AuthModule,
    HealthModule,
    DashboardModule,
    ClinicalAccessModule,
    ClinicalProgramsModule,
    SessionsModule,
    ProgressModule,
    ReportsModule,
    MaintenanceModule,
    ParentPortalModule,
    MessagesModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
