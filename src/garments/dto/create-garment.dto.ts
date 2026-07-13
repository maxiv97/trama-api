import { IsArray, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import type { GarmentCondition } from '../../shared/domain/enums';

const CONDITIONS: GarmentCondition[] = ['new', 'very_good', 'good', 'fair'];

export class CreateGarmentDto {
  @IsString() @MinLength(1) name: string;
  @IsString() @MinLength(1) category: string;
  @IsOptional() @IsString() subcategory?: string;
  @IsString() @MinLength(1) brand: string;
  @IsString() @MinLength(1) size: string;
  @IsString() @MinLength(1) color: string;
  @IsString() @MinLength(1) season: string;
  @IsIn(CONDITIONS) condition: GarmentCondition;
  @IsString() description: string;
  @IsArray() @IsString({ each: true }) photos: string[];
  @IsOptional() @IsString() video?: string;
  @IsString() @MinLength(1) merchantId: string;
  @IsOptional() @IsString() salesPointId?: string;
}
