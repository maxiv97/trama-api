import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { baseSchemaOptions } from '../../shared/mongoose/schema-options';

@Schema(baseSchemaOptions)
export class Agreement {
  @Prop({ required: true, index: true }) garmentId: string;
  @Prop({ required: true }) agreedConsignorPrice: number;
  @Prop({ required: true }) agreedSalePrice: number;
  @Prop({ required: true }) appliedCommission: number;
  @Prop({ required: true }) agreedAt: Date;
  // Mientras la prenda no se recibe es provisoria (acuerdo + ventana); al recibirla se recalcula
  // desde la recepción, que es cuando de verdad empieza a exhibirse.
  @Prop({ required: true, index: true }) saleDeadline: Date;

  // Plazos congelados al cerrar el acuerdo (opcionales: los acuerdos anteriores al 23/10/2026 no
  // los tienen y la tarea de plazos los completa con la configuración vigente del comercio).
  @Prop() saleWindowMonths?: number;
  @Prop() deliveryDays?: number;
  @Prop({ index: true }) deliveryDeadline?: Date;
  @Prop() pickupDays?: number;
  @Prop({ index: true }) pickupDeadline?: Date;

  // Avisos de plazos ya emitidos para esta prenda, para que la tarea diaria sea idempotente.
  @Prop({ type: [String], default: [] }) notices: string[];
}
export type AgreementDocument = HydratedDocument<Agreement>;
export const AgreementSchema = SchemaFactory.createForClass(Agreement);
