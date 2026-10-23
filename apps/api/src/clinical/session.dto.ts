import { IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { DurationUnit, TrialResult } from '@abapro/shared';

export class TrialBody {
  @IsString()
  @MinLength(8)
  @MaxLength(80)
  idempotencyKey!: string;

  @Type(() => Number)
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

export class ObservationBody {
  @IsString()
  @MinLength(8)
  @MaxLength(80)
  idempotencyKey!: string;

  @IsUUID()
  targetId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  note?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TrialBody)
  trials?: TrialBody[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  frequencyCount?: number;

  @IsOptional()
  @IsString()
  windowStartedAt?: string;

  @IsOptional()
  @IsString()
  windowEndedAt?: string;

  @IsOptional()
  @IsString()
  occurredAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationSeconds?: number;

  @IsOptional()
  @IsIn(['seconds', 'minutes'])
  durationUnit?: DurationUnit;

  @IsOptional()
  @IsString()
  startedAt?: string;

  @IsOptional()
  @IsString()
  endedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  antecedent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  behaviorNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  consequence?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  contextNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class StartSessionBody {
  @IsUUID()
  clientId!: string;

  @IsOptional()
  @IsUUID()
  therapistId?: string;

  @IsOptional()
  @IsString()
  startedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  setting?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  note?: string;
}

export class SessionNoteBody {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  setting?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  location?: string;

  @IsOptional()
  @IsUUID()
  therapistId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
