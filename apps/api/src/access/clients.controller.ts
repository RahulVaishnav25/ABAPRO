import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import {
  PERMISSIONS,
  type AuthUser,
  type ClientDirectoryPage,
  type ClientDocumentSummary,
  type ClientProfile,
  type ClientSummary,
} from '@abapro/shared';
import type { Response } from 'express';
import { RequireAnyPermissions, RequirePermissions } from '../common/auth.decorators';
import { CurrentUser } from '../common/current-user.decorator';
import {
  AssessmentReferenceDto,
  AssignmentDto,
  AvatarDto,
  BehaviorDto,
  ClientCodeQuery,
  ClientListQuery,
  CreateClientDto,
  CreateDocumentDto,
  CreateProgramDto,
  GoalDto,
  GuardianDto,
  SensitiveProfileDto,
  ShareRecordDto,
  UpdateClientDto,
} from './access.dto';
import { ClientRecordsService } from './client-records.service';
import { ClientsService } from './clients.service';

@Controller('v1/clients')
export class ClientsController {
  constructor(
    @Inject(ClientsService) private readonly clients: ClientsService,
    @Inject(ClientRecordsService) private readonly records: ClientRecordsService,
  ) {}

  @Get()
  @RequireAnyPermissions(PERMISSIONS.clientsView, PERMISSIONS.parentPortalView)
  list(@CurrentUser() user: AuthUser, @Query() query: ClientListQuery): Promise<ClientDirectoryPage> {
    return this.clients.list(user, query);
  }

  @Get('assignees')
  @RequireAnyPermissions(PERMISSIONS.clientsView, PERMISSIONS.parentPortalView)
  assignees(@CurrentUser() user: AuthUser) {
    return this.clients.assignees(user);
  }

  @Get('parent-members')
  @RequirePermissions(PERMISSIONS.guardiansManage)
  parentMembers(@CurrentUser() user: AuthUser) {
    return this.clients.parentMembers(user);
  }

  @Get('code-available')
  @RequireAnyPermissions(PERMISSIONS.clientsCreate, PERMISSIONS.clientsEdit)
  codeAvailable(@CurrentUser() user: AuthUser, @Query() query: ClientCodeQuery) {
    return this.clients.codeAvailable(user, query.code, query.except, query.organizationId);
  }

  @Get('placement')
  @RequireAnyPermissions(PERMISSIONS.clientsCreate, PERMISSIONS.clientsEdit)
  placement(@CurrentUser() user: AuthUser) {
    return this.clients.placement(user);
  }

  @Post('demo')
  @RequirePermissions(PERMISSIONS.clientsCreate)
  seedDemo(@CurrentUser() user: AuthUser) {
    return this.clients.seedDemo(user);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.clientsCreate)
  create(@CurrentUser() user: AuthUser, @Body() body: CreateClientDto): Promise<ClientSummary> {
    return this.clients.create(user, body);
  }

  @Get(':clientId')
  @RequireAnyPermissions(PERMISSIONS.clientsView, PERMISSIONS.parentPortalView)
  get(@CurrentUser() user: AuthUser, @Param('clientId') clientId: string): Promise<ClientProfile> {
    return this.clients.get(user, clientId);
  }

  @Delete(':clientId')
  @RequirePermissions(PERMISSIONS.clientsEdit)
  remove(@CurrentUser() user: AuthUser, @Param('clientId') clientId: string): Promise<never> {
    return this.clients.remove(user, clientId);
  }

  @Patch(':clientId')
  @RequirePermissions(PERMISSIONS.clientsEdit)
  update(
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
    @Body() body: UpdateClientDto,
  ): Promise<ClientSummary> {
    return this.clients.update(user, clientId, body);
  }

  @Get(':clientId/sensitive')
  @RequirePermissions(PERMISSIONS.clientsSensitiveView)
  sensitive(@CurrentUser() user: AuthUser, @Param('clientId') clientId: string) {
    return this.clients.sensitive(user, clientId);
  }

  @Put(':clientId/sensitive')
  @RequirePermissions(PERMISSIONS.clientsEdit)
  saveSensitive(
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
    @Body() body: SensitiveProfileDto,
  ) {
    return this.clients.saveSensitive(user, clientId, body);
  }

  @Post(':clientId/assignments')
  @RequireAnyPermissions(PERMISSIONS.assignmentsManage, PERMISSIONS.guardiansManage)
  assign(@CurrentUser() user: AuthUser, @Param('clientId') clientId: string, @Body() body: AssignmentDto) {
    return this.clients.assign(user, clientId, body);
  }

  @Post(':clientId/assignments/:assignmentId/end')
  @RequireAnyPermissions(PERMISSIONS.assignmentsManage, PERMISSIONS.guardiansManage)
  endAssignment(
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
    @Param('assignmentId') assignmentId: string,
  ) {
    return this.clients.endAssignment(user, clientId, assignmentId);
  }

  @Post(':clientId/guardians')
  @RequirePermissions(PERMISSIONS.guardiansManage)
  addGuardian(@CurrentUser() user: AuthUser, @Param('clientId') clientId: string, @Body() body: GuardianDto) {
    return this.records.addGuardian(user, clientId, body);
  }

  @Patch(':clientId/guardians/:guardianId')
  @RequirePermissions(PERMISSIONS.guardiansManage)
  updateGuardian(
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
    @Param('guardianId') guardianId: string,
    @Body() body: GuardianDto,
  ) {
    return this.records.updateGuardian(user, clientId, guardianId, body);
  }

  @Post(':clientId/guardians/:guardianId/end')
  @RequirePermissions(PERMISSIONS.guardiansManage)
  endGuardian(
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
    @Param('guardianId') guardianId: string,
  ) {
    return this.records.endGuardian(user, clientId, guardianId);
  }

  @Get(':clientId/behaviors')
  @RequirePermissions(PERMISSIONS.clientsView)
  behaviors(@CurrentUser() user: AuthUser, @Param('clientId') clientId: string) {
    return this.records.behaviors(user, clientId);
  }

  @Post(':clientId/behaviors')
  @RequirePermissions(PERMISSIONS.clientsEdit)
  addBehavior(@CurrentUser() user: AuthUser, @Param('clientId') clientId: string, @Body() body: BehaviorDto) {
    return this.records.saveBehavior(user, clientId, body);
  }

  @Patch(':clientId/behaviors/:behaviorId')
  @RequirePermissions(PERMISSIONS.clientsEdit)
  updateBehavior(
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
    @Param('behaviorId') behaviorId: string,
    @Body() body: BehaviorDto,
  ) {
    return this.records.saveBehavior(user, clientId, body, behaviorId);
  }

  @Get(':clientId/goals')
  @RequirePermissions(PERMISSIONS.programsView)
  goals(@CurrentUser() user: AuthUser, @Param('clientId') clientId: string) {
    return this.records.goals(user, clientId);
  }

  @Post(':clientId/goals')
  @RequirePermissions(PERMISSIONS.programsEdit)
  addGoal(@CurrentUser() user: AuthUser, @Param('clientId') clientId: string, @Body() body: GoalDto) {
    return this.records.saveGoal(user, clientId, body);
  }

  @Patch(':clientId/goals/:goalId')
  @RequirePermissions(PERMISSIONS.programsEdit)
  updateGoal(
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
    @Param('goalId') goalId: string,
    @Body() body: GoalDto,
  ) {
    return this.records.saveGoal(user, clientId, body, goalId);
  }

  @Get(':clientId/assessments')
  @RequirePermissions(PERMISSIONS.assessmentsView)
  assessments(@CurrentUser() user: AuthUser, @Param('clientId') clientId: string) {
    return this.records.assessments(user, clientId);
  }

  @Post(':clientId/assessments')
  @RequirePermissions(PERMISSIONS.assessmentsCreate)
  addAssessment(
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
    @Body() body: AssessmentReferenceDto,
  ) {
    return this.records.addAssessment(user, clientId, body);
  }

  @Get(':clientId/programs')
  @RequirePermissions(PERMISSIONS.programsView)
  programs(@CurrentUser() user: AuthUser, @Param('clientId') clientId: string) {
    return this.records.programs(user, clientId);
  }

  @Get(':clientId/documents')
  @RequireAnyPermissions(PERMISSIONS.documentsDownload, PERMISSIONS.documentsUpload)
  documents(@CurrentUser() user: AuthUser, @Param('clientId') clientId: string) {
    return this.records.documents(user, clientId);
  }

  @Get(':clientId/activity')
  @RequirePermissions(PERMISSIONS.auditView)
  activity(@CurrentUser() user: AuthUser, @Param('clientId') clientId: string) {
    return this.records.activity(user, clientId);
  }

  @Post(':clientId/avatar')
  @RequirePermissions(PERMISSIONS.clientsEdit)
  saveAvatar(@CurrentUser() user: AuthUser, @Param('clientId') clientId: string, @Body() body: AvatarDto) {
    return this.records.saveAvatar(user, clientId, body);
  }

  @Get(':clientId/avatar')
  @RequireAnyPermissions(PERMISSIONS.clientsView, PERMISSIONS.parentPortalView)
  async avatar(
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.records.avatar(user, clientId);
    response.status(200).set({ 'Content-Type': file.contentType, 'Cache-Control': 'private, no-store' }).send(file.content);
  }

  @Post(':clientId/shares')
  @RequirePermissions(PERMISSIONS.guardiansManage)
  share(@CurrentUser() user: AuthUser, @Param('clientId') clientId: string, @Body() body: ShareRecordDto) {
    return this.clients.share(user, clientId, body);
  }

  @Post(':clientId/documents')
  @RequirePermissions(PERMISSIONS.documentsUpload)
  addDocument(
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
    @Body() body: CreateDocumentDto,
  ): Promise<ClientDocumentSummary> {
    return this.clients.addDocument(user, clientId, body);
  }

  @Get(':clientId/documents/:documentId')
  @RequirePermissions(PERMISSIONS.documentsDownload)
  async document(
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
    @Param('documentId') documentId: string,
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.clients.document(user, clientId, documentId);
    response
      .status(200)
      .set({
        'Content-Type': file.contentType,
        'Content-Disposition': `attachment; filename="${file.fileName.replace(/"/g, '')}"`,
        'Cache-Control': 'private, no-store',
      })
      .send(file.content);
  }

  @Post(':clientId/programs')
  @RequirePermissions(PERMISSIONS.programsEdit)
  addProgram(@CurrentUser() user: AuthUser, @Param('clientId') clientId: string, @Body() body: CreateProgramDto) {
    return this.clients.addProgram(user, clientId, body);
  }
}
