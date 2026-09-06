import { Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { LocationDto } from './register-consignor.dto';

export class ReceptionScheduleDto {
  @IsString() @MinLength(1) days: string;
  @IsString() @MinLength(1) hours: string;
  @IsString() @MinLength(1) instructions: string;
}

export class GeoDto {
  @IsNumber() lat: number;
  @IsNumber() lng: number;
}

export class SalesPointDto {
  @IsString() @MinLength(1) name: string;
  @IsString() @MinLength(1) address: string;
  @IsString() @MinLength(1) phone: string;

  @ValidateNested()
  @Type(() => GeoDto)
  geo: GeoDto;

  @ValidateNested()
  @Type(() => ReceptionScheduleDto)
  receptionSchedule: ReceptionScheduleDto;
}

export class CommissionConfigDto {
  @IsInt() @Min(0) @Max(100) consignorPercentage: number;
  @IsInt() @Min(0) @Max(100) merchantPercentage: number;
}

export class MerchantTermsDto {
  @IsInt() @Min(1) @Max(24) saleWindowMonths: number;
  @IsInt() @Min(0) @Max(12) graceMonths: number;
  @IsInt() @Min(1) @Max(28) payoutDay: number;
}

export class RegisterMerchantDto {
  @IsString() @MinLength(1) @MaxLength(120) name: string;
  @IsEmail() email: string;
  @IsString() @MinLength(1) phone: string;
  @IsString() @MinLength(6) @MaxLength(72) password: string;
  @IsString() @MinLength(1) businessName: string;
  @IsString() @MinLength(1) cuit: string;

  @ValidateNested()
  @Type(() => LocationDto)
  location: LocationDto;

  @ValidateNested()
  @Type(() => CommissionConfigDto)
  commissionConfig: CommissionConfigDto;

  @ValidateNested()
  @Type(() => MerchantTermsDto)
  terms: MerchantTermsDto;

  @ValidateNested()
  @Type(() => SalesPointDto)
  salesPoint: SalesPointDto;
}
