import { IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { AssessmentStatus, MeasurementMethod, ResponseKind, TargetStatus, TrialResult } from '@abapro/shared';

export class ItemDto {
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

export class AssessmentDto {
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

export class TemplateDto {
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

export class ProgramDto {
  @IsUUID()
  clientId!: string;

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
  startedOn?: string;

  @IsOptional()
  @IsDateString()
  reviewOn?: string;

  @IsOptional()
  @IsUUID()
  responsibleClinicianId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  therapistIds?: string[];

  @IsOptional()
  @IsIn(['active', 'paused', 'completed', 'discontinued'])
  status?: 'active' | 'paused' | 'completed' | 'discontinued';

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TargetDto)
  targets?: TargetDto[];
}

export class TargetDto {
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
  @IsIn(['active', 'inactive', 'mastered', 'discontinued'])
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
  @IsArray()
  @IsUUID(undefined, { each: true })
  staffIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  changeReason?: string;
}

export class ReorderDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  targetIds!: string[];
}

export class StatusDto {
  @IsIn(['active', 'inactive', 'mastered', 'discontinued', 'paused', 'completed'])
  status!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(1000)
  changeReason!: string;
}

export class AssignmentDto {
  @IsUUID()
  userId!: string;
}

export class CopyTemplateDto {
  @IsUUID()
  clientId!: string;
}

export class TrialDto {
  @IsInt()
  @Min(1)
  @Max(30)
  trialNumber!: number;

  @IsIn(['correct', 'incorrect', 'prompted', 'no_response'])
  result!: TrialResult;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  promptLevel?: string;
}

export class ObservationDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  frequencyCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86400)
  durationSeconds?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  antecedent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  behaviorNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  consequence?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TrialDto)
  trials?: TrialDto[];
}

export type AssessmentWrite = AssessmentDto;
export type TemplateWrite = TemplateDto;
