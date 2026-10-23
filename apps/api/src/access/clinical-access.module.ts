import { Module } from '@nestjs/common';
import { AccessModule } from './access.module';
import { ClientRecordsService } from './client-records.service';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { PlatformRoleController } from './platform-role.controller';
import { PlatformRoleService } from './platform-role.service';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';

@Module({
  imports: [AccessModule],
  controllers: [ClientsController, TeamController, PlatformRoleController],
  providers: [ClientsService, ClientRecordsService, TeamService, PlatformRoleService],
})
export class ClinicalAccessModule {}
