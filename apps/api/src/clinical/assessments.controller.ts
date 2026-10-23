import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { PERMISSIONS, type AssessmentDetail, type AssessmentSummary, type AssessmentTemplate, type AuthUser } from '@abapro/shared';
import { RequirePermissions } from '../common/auth.decorators';
import { CurrentUser } from '../common/current-user.decorator';
import { AssessmentService } from './assessment.service';
import { AssessmentDto, TemplateDto } from './clinical.dto';

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

@Controller('v1/assessments')
export class AssessmentsController {
  constructor(@Inject(AssessmentService) private readonly assessments: AssessmentService) {}

  @Get('templates')
  @RequirePermissions(PERMISSIONS.assessmentsView)
  templates(@CurrentUser() user: AuthUser): Promise<AssessmentTemplate[]> {
    return this.assessments.templates(user);
  }

  @Post('templates')
  @RequirePermissions(PERMISSIONS.assessmentsCreate)
  createTemplate(@CurrentUser() user: AuthUser, @Body() body: TemplateDto): Promise<AssessmentTemplate> {
    return this.assessments.saveTemplate(user, body);
  }

  @Patch('templates/:templateId')
  @RequirePermissions(PERMISSIONS.assessmentsCreate)
  updateTemplate(
    @CurrentUser() user: AuthUser,
    @Param('templateId') templateId: string,
    @Body() body: TemplateDto,
  ): Promise<AssessmentTemplate> {
    return this.assessments.saveTemplate(user, body, templateId);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.assessmentsView)
  list(@CurrentUser() user: AuthUser, @Query('clientId') clientId?: string): Promise<AssessmentSummary[]> {
    return this.assessments.list(user, clientId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.assessmentsCreate)
  create(@CurrentUser() user: AuthUser, @Body() body: AssessmentDto): Promise<AssessmentDetail> {
    return this.assessments.create(user, body);
  }

  @Get(':assessmentId')
  @RequirePermissions(PERMISSIONS.assessmentsView)
  get(@CurrentUser() user: AuthUser, @Param('assessmentId') assessmentId: string): Promise<AssessmentDetail> {
    return this.assessments.get(user, assessmentId);
  }

  @Patch(':assessmentId')
  @RequirePermissions(PERMISSIONS.assessmentsCreate)
  update(
    @CurrentUser() user: AuthUser,
    @Param('assessmentId') assessmentId: string,
    @Body() body: AssessmentDto,
  ): Promise<AssessmentDetail> {
    return this.assessments.update(user, assessmentId, body);
  }

  @Post(':assessmentId/documents')
  @RequirePermissions(PERMISSIONS.documentsUpload)
  addDocument(
    @CurrentUser() user: AuthUser,
    @Param('assessmentId') assessmentId: string,
    @Body() body: DocumentBody,
  ): Promise<{ id: string }> {
    return this.assessments.addDocument(user, assessmentId, body);
  }
}
