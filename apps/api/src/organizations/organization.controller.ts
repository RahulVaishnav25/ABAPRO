import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { PERMISSIONS, type AuthUser, type ClinicDetail, type ClinicDirectoryPage, type InvitationCreated, type OrganizationDirectoryItem, type OrganizationSettingsView } from '@abapro/shared';
import type { Response } from 'express';
import { RequireAnyPermissions, RequirePermissions } from '../common/auth.decorators';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthenticatedRequest } from '../common/session-auth.guard';
import { sessionIdFrom } from '../auth/auth.controller';
import { ClinicDirectoryService } from './clinic-directory.service';
import { AcceptInvitationDto, ClinicDraftDto, CreateOrganizationDto, CreateOrganizationMemberDto, GrantClinicAccessDto, InvitationDraftDto, SwitchClinicDto, SwitchOrganizationDto, UpdateOrganizationDto } from './organization.dto';
import { OrganizationService } from './organization.service';

@Controller('v1')
export class OrganizationController {
  constructor(
    @Inject(OrganizationService) private readonly organizations: OrganizationService,
    @Inject(ClinicDirectoryService) private readonly clinics: ClinicDirectoryService,
  ) {}

  @Get('clinics')
  listClinics(
    @CurrentUser() user: AuthUser,
    @Query('q') search?: string,
    @Query('organizationId') organizationId?: string,
    @Query('country') country?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<ClinicDirectoryPage> {
    return this.clinics.list(user, search ?? '', organizationId ?? '', country ?? '', page, pageSize);
  }

  @Get('clinics/:clinicId')
  clinicDetail(@CurrentUser() user: AuthUser, @Param('clinicId', ParseUUIDPipe) clinicId: string): Promise<ClinicDetail> {
    return this.clinics.detail(user, clinicId);
  }

  @Patch('clinics/:clinicId')
  async updateClinic(
    @CurrentUser() user: AuthUser,
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
    @Body() body: ClinicDraftDto,
  ): Promise<ClinicDetail> {
    await this.organizations.updateClinic(user, clinicId, body);
    return this.clinics.detail(user, clinicId);
  }

  @Get('organizations')
  list(
    @CurrentUser() user: AuthUser,
    @Query('q') search?: string,
    @Query('country') country?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.organizations.list(user, search ?? '', country ?? '', page, pageSize);
  }

  @Get('organizations/:organizationId')
  detail(@CurrentUser() user: AuthUser, @Param('organizationId', ParseUUIDPipe) organizationId: string): Promise<OrganizationDirectoryItem> {
    return this.organizations.detail(user, organizationId);
  }

  @Patch('organizations/:organizationId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() body: UpdateOrganizationDto,
  ): Promise<OrganizationDirectoryItem> {
    return this.organizations.update(user, organizationId, body);
  }

  @Post('organizations/:organizationId/members')
  @HttpCode(201)
  createMember(
    @CurrentUser() user: AuthUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() body: CreateOrganizationMemberDto,
  ): Promise<OrganizationDirectoryItem> {
    return this.organizations.createMember(user, organizationId, body);
  }

  @Post('organizations/:organizationId/clinics')
  addClinic(
    @CurrentUser() user: AuthUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() body: ClinicDraftDto,
  ): Promise<OrganizationDirectoryItem> {
    return this.organizations.addClinic(user, organizationId, body);
  }

  @Post('organizations/:organizationId/clinics/:clinicId/access')
  grantAccess(
    @CurrentUser() user: AuthUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
    @Body() body: GrantClinicAccessDto,
  ): Promise<OrganizationDirectoryItem> {
    return this.organizations.grantClinicAccess(user, organizationId, clinicId, body.userId);
  }

  @Post('organizations')
  create(
    @CurrentUser() user: AuthUser,
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateOrganizationDto,
  ): Promise<AuthUser> {
    return this.organizations.create(user, sessionIdFrom(request), body);
  }

  @Post('auth/switch-organization')
  switchOrganization(
    @CurrentUser() user: AuthUser,
    @Req() request: AuthenticatedRequest,
    @Body() body: SwitchOrganizationDto,
  ): Promise<AuthUser> {
    return this.organizations.switchOrganization(user, sessionIdFrom(request), body.organizationId, body.clinicId);
  }

  @Post('auth/switch-clinic')
  @HttpCode(200)
  switchClinic(
    @CurrentUser() user: AuthUser,
    @Req() request: AuthenticatedRequest,
    @Body() body: SwitchClinicDto,
  ): Promise<AuthUser> {
    return this.organizations.switchClinic(user, sessionIdFrom(request), body.clinicId);
  }

  @Get('organization/settings')
  @RequirePermissions(PERMISSIONS.settingsView)
  settings(@CurrentUser() user: AuthUser): Promise<OrganizationSettingsView> {
    return this.organizations.settings(user);
  }

  @Get('organization/branding/logo')
  async logo(@CurrentUser() user: AuthUser, @Res() response: Response): Promise<void> {
    const logo = await this.organizations.logo(user);
    if (!logo) {
      response.status(404).json({
        statusCode: 404,
        message: 'This organization does not have a logo.',
        path: '/api/v1/organization/branding/logo',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    response.set({ 'Content-Type': logo.contentType, 'Cache-Control': 'private, max-age=300' }).send(logo.bytes);
  }

  @Get('organization/invitations')
  @RequireAnyPermissions(PERMISSIONS.settingsView, PERMISSIONS.teamMembershipManage)
  listInvitations(@CurrentUser() user: AuthUser) {
    return this.organizations.listInvitations(user);
  }

  @Post('organization/invitations')
  @RequireAnyPermissions(PERMISSIONS.settingsView, PERMISSIONS.teamMembershipManage)
  invite(@CurrentUser() user: AuthUser, @Body() body: InvitationDraftDto): Promise<InvitationCreated> {
    return this.organizations.invite(user, body);
  }

  @Post('invitations/accept')
  accept(
    @CurrentUser() user: AuthUser,
    @Req() request: AuthenticatedRequest,
    @Body() body: AcceptInvitationDto,
  ): Promise<AuthUser> {
    return this.organizations.accept(user, sessionIdFrom(request), body.token);
  }
}
