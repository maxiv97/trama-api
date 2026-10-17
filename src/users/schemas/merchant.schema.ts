import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { baseSchemaOptions } from '../../shared/mongoose/schema-options';
import { SalesPoint, SalesPointSchema } from './sales-point.schema';

@Schema({ _id: false })
export class CommissionConfig {
  @Prop({ required: true }) consignorPercentage: number;
  @Prop({ required: true }) merchantPercentage: number;
}
export const CommissionConfigSchema = SchemaFactory.createForClass(CommissionConfig);

@Schema({ _id: false })
export class MerchantTerms {
  @Prop({ required: true }) saleWindowMonths: number;
  @Prop({ required: true }) graceMonths: number;
  @Prop({ required: true }) payoutDay: number;
}
export const MerchantTermsSchema = SchemaFactory.createForClass(MerchantTerms);

@Schema(baseSchemaOptions)
export class Merchant {
  @Prop({ required: true }) businessName: string;
  @Prop() cuit?: string;
  @Prop({ type: [SalesPointSchema], default: [] }) salesPoints: SalesPoint[];
  @Prop({ type: CommissionConfigSchema, required: true }) commissionConfig: CommissionConfig;
  @Prop({ type: MerchantTermsSchema, required: true }) terms: MerchantTerms;

  // Categorías base que este comercio decidió no ofrecer (opt-out). No afecta al
  // catálogo canónico ni a otros comercios.
  @Prop({ type: [String], default: [] }) hiddenCategoryLabels: string[];
}
export type MerchantDocument = HydratedDocument<Merchant>;
export const MerchantSchema = SchemaFactory.createForClass(Merchant);
