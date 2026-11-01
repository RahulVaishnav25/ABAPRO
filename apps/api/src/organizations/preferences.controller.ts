import { Body, Controller, Get, Inject, Put } from '@nestjs/common';
import type { AuthUser, EffectivePreferences, RegionalSettings, UserPreferences } from '@abapro/shared';
import { CurrentUser } from '../common/current-user.decorator';
import type { Database } from '../db/database';
import { DATABASE } from '../db/database.module';
import { RegionalSettingsDto, UserPreferencesDto } from './organization.dto';
import {
  effectivePreferences,
  organizationRegional,
  platformRegional,
  saveOrganizationRegional,
  savePlatformRegional,
  saveUserPreferences,
  userPreferences,
} from './preferences';

/** Language, timezone and formats for the user, their organisation and the platform. */
@Controller('v1')
export class PreferencesController {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  @Get('me/preferences')
  async mine(@CurrentUser() user: AuthUser): Promise<{ user: UserPreferences; effective: EffectivePreferences }> {
    return {
      user: await userPreferences(this.database, user.id),
      effective: await effectivePreferences(this.database, user.id, user.organization?.id ?? null),
    };
  }

  @Put('me/preferences')
  async saveMine(@CurrentUser() user: AuthUser, @Body() body: UserPreferencesDto): Promise<{ user: UserPreferences; effective: EffectivePreferences }> {
    await saveUserPreferences(this.database, user, body);
    return this.mine(user);
  }

  @Get('organization/regional')
  organization(@CurrentUser() user: AuthUser): Promise<RegionalSettings> {
    return user.organization ? organizationRegional(this.database, user.organization.id) : Promise.resolve({});
  }

  @Put('organization/regional')
  async saveOrganization(@CurrentUser() user: AuthUser, @Body() body: RegionalSettingsDto): Promise<RegionalSettings> {
    await saveOrganizationRegional(this.database, user, body);
    return this.organization(user);
  }

  @Get('platform/regional')
  platform(): Promise<RegionalSettings> {
    return platformRegional(this.database);
  }

  @Put('platform/regional')
  async savePlatform(@CurrentUser() user: AuthUser, @Body() body: RegionalSettingsDto): Promise<RegionalSettings> {
    await savePlatformRegional(this.database, user, body);
    return platformRegional(this.database);
  }
}
