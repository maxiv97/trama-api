import { IsDateString, IsNumber, IsPositive, IsString, MinLength } from 'class-validator';

export class CreateSaleDto {
  @IsString() @MinLength(1) garmentId: string;
  @IsNumber() @IsPositive() actualSalePrice: number;
  @IsDateString() soldAt: string;
}
