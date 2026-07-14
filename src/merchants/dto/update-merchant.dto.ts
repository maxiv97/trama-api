import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

class LocationDto {
  @IsString() @IsNotEmpty() neighborhood: string;
  @IsString() @IsNotEmpty() city: string;
  @IsOptional() @IsNumber() lat?: number;
  @IsOptional() @IsNumber() lng?: number;
}

class CommissionConfigDto {
  @IsNumber() consignorPercentage: number;
  @IsNumber() merchantPercentage: number;
}

class MerchantTermsDto {
  @IsNumber() saleWindowMonths: number;
  @IsNumber() graceMonths: number;
  @IsNumber() payoutDay: number;
}

export class UpdateMerchantDto {
  @IsString() @IsNotEmpty() businessName: string;
  @IsString() @IsNotEmpty() email: string;
  @IsString() @IsNotEmpty() phone: string;
  @ValidateNested() @Type(() => LocationDto) location: LocationDto;
  @ValidateNested() @Type(() => CommissionConfigDto) commissionConfig: CommissionConfigDto;
  @ValidateNested() @Type(() => MerchantTermsDto) terms: MerchantTermsDto;
}
