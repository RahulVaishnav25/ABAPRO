import { ArrayMaxSize, IsArray, IsEmail, IsIn, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { INVITABLE_ROLES, LOCALES, type AppLocale, type InvitableRole } from '@abapro/shared';

export class InvitationDraftDto {
  @IsEmail()
  email!: string;

  @IsIn(INVITABLE_ROLES)
  role!: InvitableRole;
}

export class ClinicDraftDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsString()
  @Length(2, 160)
  location!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  contactPhone?: string;
}

export class CreateOrganizationDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsEmail()
  contactEmail!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  contactPhone?: string;

  @IsString()
  @Length(2, 2)
  country!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  companyIdentificationNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  taxNumber?: string;

  @IsString()
  @MaxLength(80)
  timezone!: string;

  @IsIn(LOCALES)
  locale!: AppLocale;

  @Matches(/^#[0-9a-fA-F]{6}$/)
  primaryColor!: string;

  @IsOptional()
  @IsIn(['image/png', 'image/jpeg', 'image/webp'])
  logoContentType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(900_000)
  logoBase64?: string;

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => InvitationDraftDto)
  invites: InvitationDraftDto[] = [];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ClinicDraftDto)
  clinics?: ClinicDraftDto[];
}

export class UpdateOrganizationDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsEmail()
  contactEmail!: string;

  @IsString()
  @Length(3, 30)
  contactPhone!: string;

  @IsString()
  @Length(2, 2)
  country!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  companyIdentificationNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  taxNumber?: string;
}

export class SwitchOrganizationDto {
  @IsUUID()
  organizationId!: string;

  @IsOptional()
  @IsUUID()
  clinicId?: string;
}

export class SwitchClinicDto {
  @IsUUID()
  clinicId!: string;
}

export class GrantClinicAccessDto {
  @IsUUID()
  userId!: string;
}

export class AcceptInvitationDto {
  @IsString()
  @Length(20, 200)
  token!: string;
}

export class CreateOrganizationMemberDto {
  @IsString()
  @Length(2, 80)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @Length(10, 128)
  password!: string;

  @IsIn(INVITABLE_ROLES)
  role!: InvitableRole;
}
