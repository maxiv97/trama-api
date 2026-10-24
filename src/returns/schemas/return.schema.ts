import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { baseSchemaOptions } from '../../shared/mongoose/schema-options';

// Devolución: el cedente retiró una prenda que no se vendió. Es el comprobante del retiro.
// Guarda comercio y cedente para consultarse por comercio sin pasar por las prendas.
@Schema({ ...baseSchemaOptions, collection: 'returns' })
export class GarmentReturn {
  @Prop({ required: true, unique: true }) garmentId: string;
  @Prop({ required: true }) merchantId: string;
  @Prop({ required: true }) consignorId: string;
  @Prop() salesPointId?: string;
  @Prop({ required: true }) returnedAt: Date;
  // El comercio confirma que verificó el DNI de quien retira.
  @Prop({ required: true }) identityChecked: boolean;
  @Prop() notes?: string;
  @Prop({ required: true }) receiptNumber: string;
  @Prop({ required: true }) handledBy: string;
}
export type GarmentReturnDocument = HydratedDocument<GarmentReturn>;
export const GarmentReturnSchema = SchemaFactory.createForClass(GarmentReturn);
GarmentReturnSchema.index({ merchantId: 1, returnedAt: 1 });
