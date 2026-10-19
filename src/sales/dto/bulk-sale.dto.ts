import { ArrayNotEmpty, IsArray, IsDateString, IsString } from 'class-validator';

// Marca varias prendas como vendidas a la vez, al precio de venta acordado de cada una.
export class BulkSaleDto {
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) garmentIds: string[];
  @IsDateString() soldAt: string;
}
