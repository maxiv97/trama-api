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
  @Prop({ index: true }) merchantId?: string;
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
