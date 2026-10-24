import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

class LocationDto {
  @IsString() @IsNotEmpty() neighborhood: string;
  @IsString() @IsNotEmpty() city: string;
  @IsOptional() @IsNumber() lat?: number;
  @IsOptional() @IsNumber() lng?: number;
}

// Mismos rangos que el alta del comercio (register-merchant.dto): el backend valida la
// configuración aunque la interfaz ya la limite, para no aceptar valores fuera de rango.
class CommissionConfigDto {
  @IsInt() @Min(0) @Max(100) consignorPercentage: number;
  @IsInt() @Min(0) @Max(100) merchantPercentage: number;
}

class MerchantTermsDto {
  @IsInt() @Min(1) @Max(24) saleWindowMonths: number;
  // Opcionales para no romper clientes que todavía no los envían: se usan los defaults (alta)
  // o los valores vigentes del comercio (actualización).
  @IsOptional() @IsInt() @Min(1) @Max(30) deliveryDays?: number;
  @IsOptional() @IsInt() @Min(1) @Max(60) pickupDays?: number;
  @IsInt() @Min(1) @Max(28) payoutDay: number;
}

export class UpdateMerchantDto {
  @IsString() @IsNotEmpty() businessName: string;
  @IsString() @IsNotEmpty() email: string;
  @IsString() @IsNotEmpty() phone: string;
  @ValidateNested() @Type(() => LocationDto) location: LocationDto;
  @ValidateNested() @Type(() => CommissionConfigDto) commissionConfig: CommissionConfigDto;
  @ValidateNested() @Type(() => MerchantTermsDto) terms: MerchantTermsDto;
}
