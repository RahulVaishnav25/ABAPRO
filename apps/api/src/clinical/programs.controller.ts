import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { PERMISSIONS, type AuthUser, type ProgramDetail, type ProgramSummary, type ProgramTemplate, type SessionObservationView } from '@abapro/shared';
import { RequirePermissions } from '../common/auth.decorators';
import { CurrentUser } from '../common/current-user.decorator';
import { AssignmentDto, CopyTemplateDto, ObservationDto, ProgramDto, ProgramTemplateDto, ReorderDto, TargetDto } from './clinical.dto';
import { ProgramService } from './program.service';

class DocumentBody {
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  fileName!: string;

  @IsIn(['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
  contentType!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(700_000)
  contentBase64!: string;
}

@Controller('v1/programs')
export class ProgramsController {
  constructor(@Inject(ProgramService) private readonly programs: ProgramService) {}

  @Get('templates')
  @RequirePermissions(PERMISSIONS.programsView)
  templates(@CurrentUser() user: AuthUser): Promise<ProgramTemplate[]> {
    return this.programs.templates(user);
  }

  @Post('templates')
  @RequirePermissions(PERMISSIONS.programsEdit)
  createTemplate(@CurrentUser() user: AuthUser, @Body() body: ProgramTemplateDto): Promise<ProgramTemplate> {
    return this.programs.saveTemplate(user, body);
  }

  @Patch('templates/:templateId')
  @RequirePermissions(PERMISSIONS.programsEdit)
  updateTemplate(@CurrentUser() user: AuthUser, @Param('templateId') templateId: string, @Body() body: ProgramTemplateDto): Promise<ProgramTemplate> {
    return this.programs.saveTemplate(user, body, templateId);
  }

  @Post('templates/:templateId/copy')
  @RequirePermissions(PERMISSIONS.programsEdit)
  copy(@CurrentUser() user: AuthUser, @Param('templateId') templateId: string, @Body() body: CopyTemplateDto): Promise<ProgramDetail> {
    return this.programs.copyTemplate(user, templateId, body.clientId);
  }

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
  addDocument(@CurrentUser() user: AuthUser, @Param('programId') programId: string, @Body() body: DocumentBody): Promise<ProgramDetail> {
    return this.programs.addDocument(user, programId, body);
  }

  @Post(':programId/targets')
  @RequirePermissions(PERMISSIONS.targetsEdit)
  addTarget(@CurrentUser() user: AuthUser, @Param('programId') programId: string, @Body() body: TargetDto): Promise<ProgramDetail> {
    return this.programs.addTarget(user, programId, body);
  }

  @Patch(':programId/targets/reorder')
  @RequirePermissions(PERMISSIONS.targetsEdit)
  reorder(@CurrentUser() user: AuthUser, @Param('programId') programId: string, @Body() body: ReorderDto): Promise<ProgramDetail> {
    return this.programs.reorder(user, programId, body.targetIds);
  }

  @Patch(':programId/targets/:targetId')
  @RequirePermissions(PERMISSIONS.targetsEdit)
  updateTarget(
    @CurrentUser() user: AuthUser,
    @Param('programId') programId: string,
    @Param('targetId') targetId: string,
    @Body() body: TargetDto,
  ): Promise<ProgramDetail> {
    return this.programs.updateTarget(user, programId, targetId, body);
  }

  @Post(':programId/assignments')
  @RequirePermissions(PERMISSIONS.assignmentsManage)
  assign(@CurrentUser() user: AuthUser, @Param('programId') programId: string, @Body() body: AssignmentDto): Promise<ProgramDetail> {
    return this.programs.assign(user, programId, body.userId);
  }

  @Post(':programId/assignments/:assignmentId/end')
  @RequirePermissions(PERMISSIONS.assignmentsManage)
  endAssignment(
    @CurrentUser() user: AuthUser,
    @Param('programId') programId: string,
    @Param('assignmentId') assignmentId: string,
  ): Promise<ProgramDetail> {
    return this.programs.endAssignment(user, programId, assignmentId);
  }

  @Post(':programId/targets/:targetId/observations')
  @RequirePermissions(PERMISSIONS.observationsRecord)
  observe(
    @CurrentUser() user: AuthUser,
    @Param('programId') programId: string,
    @Param('targetId') targetId: string,
    @Body() body: ObservationDto,
  ): Promise<SessionObservationView> {
    return this.programs.recordObservation(user, programId, targetId, body);
  }
}
