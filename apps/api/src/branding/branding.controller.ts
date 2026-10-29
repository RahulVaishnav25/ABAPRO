import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import type { AuthUser, OrganizationBranding, PlatformBranding } from '@abapro/shared';
import { CurrentUser } from '../common/current-user.decorator';
import { Public } from '../common/auth.decorators';
import { UpdateOrganizationBrandingDto, UpdatePlatformBrandingDto } from './branding.dto';
import { BrandingService } from './branding.service';

@Controller('v1/branding')
export class BrandingController {
  constructor(@Inject(BrandingService) private readonly brandingService: BrandingService) {}

  @Public()
  @Get('platform')
  getPlatformBranding(): Promise<PlatformBranding> {
    return this.brandingService.getPlatformBranding();
  }

  @Put('platform')
  updatePlatformBranding(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdatePlatformBrandingDto,
  ): Promise<PlatformBranding> {
    return this.brandingService.updatePlatformBranding(user, dto);
  }

  @Post('platform/reset')
  @HttpCode(200)
  resetPlatformBranding(@CurrentUser() user: AuthUser): Promise<PlatformBranding> {
    return this.brandingService.resetPlatformBranding(user);
  }

  @Get('organization/:organizationId')
  getOrganizationBranding(
    @CurrentUser() user: AuthUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ): Promise<OrganizationBranding | null> {
    return this.brandingService.getOrganizationBranding(user, organizationId);
  }

  @Put('organization/:organizationId')
  updateOrganizationBranding(
    @CurrentUser() user: AuthUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() dto: UpdateOrganizationBrandingDto,
  ): Promise<OrganizationBranding> {
    return this.brandingService.updateOrganizationBranding(user, organizationId, dto);
  }

  @Post('organization/:organizationId/reset')
  @HttpCode(200)
  resetOrganizationBranding(
    @CurrentUser() user: AuthUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ): Promise<OrganizationBranding> {
    return this.brandingService.resetOrganizationBranding(user, organizationId);
  }
}
