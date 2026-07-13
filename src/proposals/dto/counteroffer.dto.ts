import { IsNumber, IsPositive } from 'class-validator';

export class CounterofferDto {
  @IsNumber() @IsPositive() consignorPrice: number;
}
