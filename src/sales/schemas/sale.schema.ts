import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { PaymentMethod } from '../../shared/domain/enums';
import { baseSchemaOptions } from '../../shared/mongoose/schema-options';

@Schema(baseSchemaOptions)
export class Sale {
  @Prop({ required: true, index: true }) garmentId: string;
  @Prop({ required: true }) actualSalePrice: number;
  @Prop({ required: true }) soldAt: Date;
  @Prop({ required: true }) consignorAmount: number;
  @Prop({ required: true }) merchantCommission: number;
  @Prop() paidAt?: Date;
  @Prop({ type: String }) paymentMethod?: PaymentMethod;
  @Prop() receiptNumber?: string;
}
export type SaleDocument = HydratedDocument<Sale>;
export const SaleSchema = SchemaFactory.createForClass(Sale);
