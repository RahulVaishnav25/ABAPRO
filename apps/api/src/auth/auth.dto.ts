import { IsBoolean, IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class PasswordLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(1, 128)
  password!: string;
}

export class CreateSignInAccountDto {
  @IsString()
  @Length(1, 80)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsBoolean()
  platformAdmin?: boolean;
}
