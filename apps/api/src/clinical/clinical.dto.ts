import { IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CARE_STATUSES } from '@abapro/shared';
import type {
  AssessmentItemWrite,
  AssessmentStatus,
  AssessmentTemplateWrite,
  AssessmentWrite,
  CareStatus,
  DocumentUpload,
  MeasurementMethod,
  MeasurementProcedure,
  ProgramWrite,
  StatusChange,
  ResponseKind,
  TargetStatus,
  TargetWrite,
} from '@abapro/shared';

export class ItemDto implements AssessmentItemWrite {
  @IsString()
  @MinLength(2)
  @MaxLength(240)
  label!: string;

  @IsIn(['text', 'yes_no', 'rating', 'count'])
  responseKind!: ResponseKind;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  guidance?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  responseText?: string;
}

export class AssessmentDto implements AssessmentWrite {
  @IsUUID()
  clientId!: string;

  @IsOptional()
  @IsUUID()
  templateId?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  assessmentType!: string;

  @IsOptional()
  @IsIn(['draft', 'in_progress', 'completed', 'reviewed'])
  status?: AssessmentStatus;

  @IsOptional()
  @IsDateString()
  assessedOn?: string;

  @IsOptional()
  @IsDateString()
  reviewOn?: string;

  @IsOptional()
  @IsUUID()
  assignedClinicianId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  summary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  resultsNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  changeReason?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemDto)
  items?: ItemDto[];
}

export class TemplateDto implements AssessmentTemplateWrite {
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  assessmentType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsIn(['active', 'retired'])
  status?: 'active' | 'retired';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemDto)
  items?: ItemDto[];
}

export class ProgramDto implements ProgramWrite {
  @IsUUID()
  clientId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  domain?: string;

  @IsOptional()
  @IsDateString()
  dateImplemented?: string;

  @IsOptional()
  @IsDateString()
  dateMastered?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  assessmentType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  sd?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  masterySteps?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  errorCorrectionProcedure?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  teachingMethod?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  netTeachingIdea?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  measurementProcedure?: MeasurementProcedure;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  objective?: string;

  @IsOptional()
  @IsUUID()
  assessmentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  goalStatement?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  goalObjective?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  teachingProcedure?: string;

  @IsOptional()
  @IsDateString()
  reviewOn?: string;

  @IsOptional()
  @IsIn(CARE_STATUSES)
  status?: CareStatus;

  @IsOptional()
  @IsIn(['trial', 'probe', 'frequency', 'duration', 'abc'])
  measurementType?: MeasurementMethod;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  expectedTrialCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  masteryCriteria?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  changeReason?: string;
}

export class ProgramTemplateDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  objective?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  teachingProcedure?: string;

  @IsIn(['trial', 'probe', 'frequency', 'duration', 'abc'])
  measurementType!: MeasurementMethod;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  expectedTrialCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  masteryCriteria?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsIn(['active', 'retired'])
  status?: 'active' | 'retired';
}

export class TargetDto implements TargetWrite {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  operationalDefinition?: string;

  @IsIn(['trial', 'probe', 'frequency', 'duration', 'abc'])
  measurementMethod!: MeasurementMethod;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  expectedTrialCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  baselineNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  teachingInstructions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  promptHierarchy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  masteryCriteria?: string;

  @IsOptional()
  @IsIn(['baseline', 'intervention', 'maintenance', 'mastered'])
  phase?: string;

  @IsOptional()
  @IsIn(CARE_STATUSES)
  status?: TargetStatus;

  @IsOptional()
  @IsDateString()
  startedOn?: string;

  @IsOptional()
  @IsDateString()
  reviewOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  clinicalNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  sd?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  masterySessions?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  masteryProbe?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  baselineSessions?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  baselineProbe?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  changeReason?: string;
}

export class AssignmentDto {
  @IsUUID()
  userId!: string;
}

export class CopyTemplateDto {
  @IsUUID()
  clientId!: string;
}

export class StatusChangeDto implements StatusChange {
  @IsIn(CARE_STATUSES)
  status!: CareStatus;

  @IsString()
  @MaxLength(1000)
  changeReason!: string;
}

export class DocumentUploadDto implements DocumentUpload {
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
