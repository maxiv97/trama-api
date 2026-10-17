import { IsArray, IsIn, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import type { GarmentCondition } from '../../shared/domain/enums';

const CONDITIONS: GarmentCondition[] = ['new', 'very_good', 'good', 'fair'];

// Edición de una consignación en revisión: campos de la prenda + precio pedido.
export class UpdateDraftDto {
  @IsString() @MinLength(1) name: string;
  @IsString() @MinLength(1) category: string;
  @IsOptional() @IsString() subcategory?: string;
  @IsString() @MinLength(1) brand: string;
  @IsString() @MinLength(1) size: string;
  @IsString() @MinLength(1) color: string;
  @IsString() @MinLength(1) season: string;
  @IsIn(CONDITIONS) condition: GarmentCondition;
  @IsOptional() @IsString() description?: string;
  @IsArray() @IsString({ each: true }) photos: string[];
  @IsOptional() @IsString() video?: string;
  @IsNumber() @Min(1) requestedConsignorPrice: number;
}
