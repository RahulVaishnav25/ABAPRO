import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateClientDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  displayName!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9-]{1,31}$/)
  clientCode?: string;

  @IsOptional()
  @IsUUID()
  clinicId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  preferredName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;
}

export class UpdateClientDto extends CreateClientDto {
  @IsIn(['active', 'inactive'])
  status!: 'active' | 'inactive';

  @IsOptional()
  @IsBoolean()
  confirmDeactivation?: boolean;
}

export class ClientCodeQuery {
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9-]{1,31}$/)
  code!: string;

  @IsOptional()
  @IsUUID()
  except?: string;

  @IsOptional()
  @IsUUID()
  organizationId?: string;
}

export class ClientListQuery {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';

  @IsOptional()
  @IsUUID()
  therapistId?: string;

  @IsOptional()
  @IsUUID()
  supervisorId?: string;

  @IsOptional()
  @IsIn(['active', 'paused', 'completed', 'discontinued'])
  programStatus?: 'active' | 'paused' | 'completed' | 'discontinued';

  @IsOptional()
  @IsIn(['name', 'code', 'status', 'created', 'session', 'programs'])
  sort?: 'name' | 'code' | 'status' | 'created' | 'session' | 'programs';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  direction?: 'asc' | 'desc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;
}

export class SensitiveProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  medicalHistory?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  allergies?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  precautions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  communicationPreferences?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  summary?: string;
}

export class AssignmentDto {
  @IsUUID()
  userId!: string;

  @IsIn(['therapist', 'supervisor', 'guardian'])
  relationship!: 'therapist' | 'supervisor' | 'guardian';
}

export class ShareRecordDto {
  @IsUUID()
  recordId!: string;

  @IsIn(['document', 'graph', 'report'])
  recordType!: 'document' | 'graph' | 'report';

  @IsUUID()
  sharedWithUserId!: string;
}

export class CreateDocumentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  fileName!: string;

  @IsIn(['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
  contentType!: 'application/pdf' | 'image/png' | 'image/jpeg' | 'image/webp';

  @IsOptional()
  @IsIn(['record', 'assessment', 'care', 'supporting'])
  category?: 'record' | 'assessment' | 'care' | 'supporting';

  @IsString()
  @MinLength(1)
  @MaxLength(700_000)
  contentBase64!: string;
}

export class CreateObservationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  note!: string;
}

export class AmendObservationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  note!: string;
}

export class CreateProgramDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsIn(['active', 'paused', 'completed', 'discontinued'])
  status?: 'active' | 'paused' | 'completed' | 'discontinued';
}

export class UpdateProgramStatusDto {
  @IsIn(['active', 'paused', 'completed', 'discontinued'])
  status!: 'active' | 'paused' | 'completed' | 'discontinued';
}

export class GuardianDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsIn(['parent', 'guardian', 'grandparent', 'caregiver', 'other'])
  relationship!: 'parent' | 'guardian' | 'grandparent' | 'caregiver' | 'other';

  @IsOptional()
  @IsString()
  @MaxLength(180)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsArray()
  @IsIn(['email', 'phone', 'portal'], { each: true })
  channels!: Array<'email' | 'phone' | 'portal'>;

  @IsBoolean()
  emergencyContact!: boolean;

  @IsBoolean()
  portalAccess!: boolean;

  @IsOptional()
  @IsUUID()
  linkedUserId?: string;
}

export class BehaviorDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(4000)
  operationalDefinition!: string;

  @IsIn(['frequency', 'duration', 'interval', 'latency', 'rate'])
  measurementType!: 'frequency' | 'duration' | 'interval' | 'latency' | 'rate';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  measurementNotes?: string;

  @IsOptional()
  @IsIn(['active', 'discontinued'])
  status?: 'active' | 'discontinued';
}

export class GoalDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  statement!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  objective?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  assessmentReference?: string;

  @IsOptional()
  @IsDateString()
  reviewOn?: string;

  @IsOptional()
  @IsIn(['active', 'met', 'discontinued'])
  status?: 'active' | 'met' | 'discontinued';
}

export class AssessmentReferenceDto {
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  instrument?: string;

  @IsOptional()
  @IsDateString()
  completedOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class AvatarDto {
  @IsIn(['image/png', 'image/jpeg', 'image/webp'])
  contentType!: 'image/png' | 'image/jpeg' | 'image/webp';

  @IsString()
  @MinLength(1)
  @MaxLength(700_000)
  contentBase64!: string;
}

export class CreateTargetDto {
  @IsUUID()
  programId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;
}

export class ApprovePhaseDto {
  @IsIn(['baseline', 'intervention', 'maintenance', 'mastered'])
  phase!: 'baseline' | 'intervention' | 'maintenance' | 'mastered';
}

export class GrantExceptionDto {
  @IsUUID()
  clientId!: string;

  @IsUUID()
  granteeUserId!: string;

  @IsArray()
  @IsString({ each: true })
  permissions!: string[];

  @IsString()
  @MinLength(20)
  @MaxLength(1000)
  justification!: string;

  @IsString()
  expiresAt!: string;
}

export class UpdateRolePermissionsDto {
  @IsIn(['organization_admin', 'clinical_supervisor', 'therapist', 'parent', 'reviewer'])
  role!: 'organization_admin' | 'clinical_supervisor' | 'therapist' | 'parent' | 'reviewer';

  @IsArray()
  @IsString({ each: true })
  permissions!: string[];
}

export class ChangeRoleDto {
  @IsIn(['organization_admin', 'clinical_supervisor', 'therapist', 'parent', 'reviewer'])
  role!: 'organization_admin' | 'clinical_supervisor' | 'therapist' | 'parent' | 'reviewer';
}
