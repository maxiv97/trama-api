import { Type } from 'class-transformer';
import {
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class LocationDto {
  @IsString() @MinLength(1) neighborhood: string;
  @IsString() @MinLength(1) city: string;
  @IsOptional() @IsNumber() lat?: number;
  @IsOptional() @IsNumber() lng?: number;
}

export class RegisterConsignorDto {
  @IsString() @MinLength(1) @MaxLength(120) name: string;
  @IsEmail() email: string;
  @IsString() @MinLength(1) phone: string;
  @IsString() @MinLength(6) @MaxLength(72) password: string;
  @IsString() @MinLength(1) dni: string;

  @ValidateNested()
  @Type(() => LocationDto)
  location: LocationDto;
}
