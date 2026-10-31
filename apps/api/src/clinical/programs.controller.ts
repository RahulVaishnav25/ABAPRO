import { BadRequestException, Body, Controller, Get, HttpStatus, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  PERMISSIONS,
  type AuthUser,
  type ProgramDetail,
  type ProgramSummary,
  type TargetListItem,
  type TaskRecordHistory,
  type TaskRecordingStatus,
} from '@abapro/shared';
import { RequirePermissions } from '../common/auth.decorators';
import { CurrentUser } from '../common/current-user.decorator';
import { DocumentUploadDto, ProgramDto, StatusChangeDto, TargetDto, TaskRecordDto } from './clinical.dto';
import { ProgramService } from './program.service';
import { TaskRecordService } from './task-record.service';

@Controller('v1/programs')
export class ProgramsController {
  constructor(
    @Inject(ProgramService) private readonly programs: ProgramService,
    @Inject(TaskRecordService) private readonly records: TaskRecordService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.programsView)
  list(@CurrentUser() user: AuthUser, @Query('clientId') clientId?: string): Promise<ProgramSummary[]> {
    return this.programs.list(user, clientId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.programsEdit)
  create(@CurrentUser() user: AuthUser, @Body() body: ProgramDto): Promise<ProgramDetail> {
    return this.programs.create(user, body);
  }

  // Declared before ':programId' so 'targets' is not read as a program id.
  @Get('targets')
  @RequirePermissions(PERMISSIONS.programsView)
  listTargets(
    @CurrentUser() user: AuthUser,
    @Query('programId', new ParseUUIDPipe({ optional: true })) programId?: string,
  ): Promise<TargetListItem[]> {
    return this.programs.listTargets(user, programId);
  }

  @Get('targets/:targetId')
  @RequirePermissions(PERMISSIONS.programsView)
  getTarget(
    @CurrentUser() user: AuthUser,
    @Param('targetId', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND })) targetId: string,
  ): Promise<TargetListItem> {
    return this.programs.getTarget(user, targetId);
  }

  /** Today's remaining recording capacity for each of a client's tasks. */
  @Get('records/status')
  @RequirePermissions(PERMISSIONS.programsView)
  recordingStatuses(
    @CurrentUser() user: AuthUser,
    @Query('clientId', new ParseUUIDPipe()) clientId: string,
  ): Promise<TaskRecordingStatus[]> {
    return this.records.statuses(user, clientId);
  }

  @Get('targets/:targetId/records')
  @RequirePermissions(PERMISSIONS.programsView)
  taskRecords(
    @CurrentUser() user: AuthUser,
    @Param('targetId', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND })) targetId: string,
    @Query('from') from?: string,
  ): Promise<TaskRecordHistory> {
    if (from !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      throw new BadRequestException('Use a from date in the form YYYY-MM-DD.');
    }
    return this.records.history(user, targetId, from);
  }

  // The service allows only therapists assigned to the client.
  @Post('targets/:targetId/records')
  @RequirePermissions(PERMISSIONS.programsView)
  recordTask(
    @CurrentUser() user: AuthUser,
    @Param('targetId', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND })) targetId: string,
    @Body() body: TaskRecordDto,
  ): Promise<TaskRecordingStatus> {
    return this.records.record(user, targetId, body);
  }

  @Get(':programId')
  @RequirePermissions(PERMISSIONS.programsView)
  get(@CurrentUser() user: AuthUser, @Param('programId') programId: string): Promise<ProgramDetail> {
    return this.programs.get(user, programId);
  }

  @Patch(':programId')
  @RequirePermissions(PERMISSIONS.programsEdit)
  update(@CurrentUser() user: AuthUser, @Param('programId') programId: string, @Body() body: ProgramDto): Promise<ProgramDetail> {
    return this.programs.update(user, programId, body);
  }

  @Post(':programId/documents')
  @RequirePermissions(PERMISSIONS.documentsUpload)
  addDocument(@CurrentUser() user: AuthUser, @Param('programId') programId: string, @Body() body: DocumentUploadDto): Promise<ProgramDetail> {
    return this.programs.addDocument(user, programId, body);
  }

  // Assigned therapists may also add tasks; the service checks programs.edit or the assignment.
  @Post(':programId/targets')
  @RequirePermissions(PERMISSIONS.programsView)
  addTarget(@CurrentUser() user: AuthUser, @Param('programId') programId: string, @Body() body: TargetDto): Promise<ProgramDetail> {
    return this.programs.addTarget(user, programId, body);
  }

  @Patch(':programId/status')
  @RequirePermissions(PERMISSIONS.programsView)
  setStatus(@CurrentUser() user: AuthUser, @Param('programId') programId: string, @Body() body: StatusChangeDto): Promise<ProgramDetail> {
    return this.programs.setProgramStatus(user, programId, body.status, body.changeReason);
  }

  @Patch(':programId/targets/:targetId/status')
  @RequirePermissions(PERMISSIONS.programsView)
  setTargetStatus(
    @CurrentUser() user: AuthUser,
    @Param('programId') programId: string,
    @Param('targetId') targetId: string,
    @Body() body: StatusChangeDto,
  ): Promise<ProgramDetail> {
    return this.programs.setTargetStatus(user, programId, targetId, body.status, body.changeReason);
  }

  @Patch(':programId/targets/:targetId')
  @RequirePermissions(PERMISSIONS.programsEdit)
  updateTarget(
    @CurrentUser() user: AuthUser,
    @Param('programId') programId: string,
    @Param('targetId') targetId: string,
    @Body() body: TargetDto,
  ): Promise<ProgramDetail> {
    return this.programs.updateTarget(user, programId, targetId, body);
  }
}
