import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { baseSchemaOptions } from '../../shared/mongoose/schema-options';

@Schema(baseSchemaOptions)
export class Agreement {
  @Prop({ required: true }) garmentId: string;
  @Prop({ required: true }) agreedConsignorPrice: number;
  @Prop({ required: true }) agreedSalePrice: number;
  @Prop({ required: true }) appliedCommission: number;
  @Prop({ required: true }) agreedAt: Date;
  @Prop({ required: true }) saleDeadline: Date;
}
export type AgreementDocument = HydratedDocument<Agreement>;
export const AgreementSchema = SchemaFactory.createForClass(Agreement);
