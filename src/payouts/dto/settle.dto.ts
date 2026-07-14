import { ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import type { PaymentMethod } from '../../shared/domain/enums';

export class SettleDto {
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) garmentIds: string[];
  @IsIn(['cash', 'transfer']) paymentMethod: PaymentMethod;
  @IsOptional() @IsString() receiptNumber?: string;
}
