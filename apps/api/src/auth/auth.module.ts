import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { AuthController } from './auth.controller';
import { AccountService } from './account.service';
import { OidcClientService } from './oidc-client.service';
import { PlatformAccountService } from './platform-account.service';
import { SessionService } from './session.service';
import { ClinicDirectoryService } from '../organizations/clinic-directory.service';
import { OrganizationController } from '../organizations/organization.controller';
import { OrganizationService } from '../organizations/organization.service';
import { PreferencesController } from '../organizations/preferences.controller';

@Module({
  imports: [AccessModule],
  controllers: [AuthController, OrganizationController, PreferencesController],
  providers: [AccountService, OidcClientService, SessionService, OrganizationService, ClinicDirectoryService, PlatformAccountService],
  exports: [SessionService, AccountService, OrganizationService],
})
export class AuthModule {}
