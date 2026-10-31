import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AccessModule } from './access.module';
import { ClientRecordsService } from './client-records.service';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { ParentAccountsService } from './parent-accounts.service';
import { ParentsController } from './parents.controller';
import { PlatformRoleController } from './platform-role.controller';
import { PlatformRoleService } from './platform-role.service';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';

@Module({
  imports: [AccessModule, AuthModule],
  controllers: [ClientsController, TeamController, PlatformRoleController, ParentsController],
  providers: [ClientsService, ClientRecordsService, TeamService, PlatformRoleService, ParentAccountsService],
})
export class ClinicalAccessModule {}
