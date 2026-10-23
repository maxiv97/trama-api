import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { EventActor, GarmentCondition, GarmentStatus } from '../../shared/domain/enums';
import { baseSchemaOptions } from '../../shared/mongoose/schema-options';

@Schema({ _id: false })
export class GarmentEvent {
  @Prop({ required: true }) date: Date;
  @Prop({ required: true, type: String }) actor: EventActor;
  @Prop({ required: true, type: String }) status: GarmentStatus;
  @Prop() note?: string;
}
export const GarmentEventSchema = SchemaFactory.createForClass(GarmentEvent);

@Schema(baseSchemaOptions)
export class Garment {
  @Prop({ required: true, index: true }) consignorId: string;
  // Sin índice simple: lo cubren como prefijo los índices compuestos {merchantId, …} de abajo.
  @Prop() merchantId?: string;
  // Código legible para que el comercio identifique/busque la prenda (TRA-00001).
  @Prop({ unique: true, sparse: true }) code?: string;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) category: string;
  @Prop() subcategory?: string;
  @Prop({ required: true }) brand: string;
  @Prop({ required: true }) size: string;
  @Prop({ required: true }) color: string;
  @Prop({ required: true }) season: string;
  @Prop({ required: true, type: String }) condition: GarmentCondition;
  @Prop({ default: '' }) description: string;
  @Prop({ type: [String], default: [] }) photos: string[];
  @Prop() video?: string;
  @Prop({ required: true, type: String }) status: GarmentStatus;
  @Prop({ required: true }) createdAt: Date;
  @Prop() salesPointId?: string;
  @Prop({ type: [GarmentEventSchema], default: [] }) timeline: GarmentEvent[];
}
export type GarmentDocument = HydratedDocument<Garment>;
export const GarmentSchema = SchemaFactory.createForClass(Garment);
// Reportes, panel e inventario filtran por comercio y estado; el directorio de cedentes y la
// verificación de pertenencia, por comercio y cedente.
GarmentSchema.index({ merchantId: 1, status: 1 });
GarmentSchema.index({ merchantId: 1, consignorId: 1 });
