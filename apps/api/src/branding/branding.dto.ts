import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePlatformBrandingDto {
  @IsString()
  @MaxLength(100)
  @IsOptional()
  portalName?: string;

  @IsString()
  @IsOptional()
  logoUrl?: string;

  @IsString()
  @IsOptional()
  faviconUrl?: string;

  @IsString()
  @MaxLength(30)
  @IsOptional()
  primaryColor?: string;

  @IsString()
  @MaxLength(30)
  @IsOptional()
  secondaryColor?: string;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  loginHeadline?: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  loginSubtitle?: string;

  @IsString()
  @IsOptional()
  updatedAt?: string;
}

export class UpdateOrganizationBrandingDto {
  @IsString()
  @IsOptional()
  organizationId?: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  portalName?: string;

  @IsString()
  @IsOptional()
  logoUrl?: string;

  @IsString()
  @IsOptional()
  faviconUrl?: string;

  @IsString()
  @MaxLength(30)
  @IsOptional()
  primaryColor?: string;

  @IsString()
  @MaxLength(30)
  @IsOptional()
  secondaryColor?: string;

  @IsString()
  @IsOptional()
  updatedAt?: string;
}
