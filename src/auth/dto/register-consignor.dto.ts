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

// Used by the merchant registration (locates through its sales point, so no street address).
export class LocationDto {
  @IsString() @MinLength(1) neighborhood: string;
  @IsString() @MinLength(1) city: string;
  @IsOptional() @IsNumber() lat?: number;
  @IsOptional() @IsNumber() lng?: number;
}

export class ConsignorLocationDto extends LocationDto {
  @IsString() @MinLength(1) street: string;
  @IsString() @MinLength(1) number: string;
  @IsOptional() @IsString() unit?: string;
}

export class RegisterConsignorDto {
  @IsString() @MinLength(1) @MaxLength(80) firstName: string;
  @IsString() @MinLength(1) @MaxLength(80) lastName: string;
  @IsEmail() email: string;
  @IsString() @MinLength(1) phone: string;
  @IsString() @MinLength(6) @MaxLength(72) password: string;
  @IsString() @MinLength(1) dni: string;

  @ValidateNested()
  @Type(() => ConsignorLocationDto)
  location: ConsignorLocationDto;
}
