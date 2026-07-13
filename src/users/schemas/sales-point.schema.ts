import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { baseSchemaOptions } from '../../shared/mongoose/schema-options';

@Schema({ _id: false })
export class Geo {
  @Prop({ required: true }) lat: number;
  @Prop({ required: true }) lng: number;
}
export const GeoSchema = SchemaFactory.createForClass(Geo);

@Schema({ _id: false })
export class ReceptionSchedule {
  @Prop({ required: true }) days: string;
  @Prop({ required: true }) hours: string;
  @Prop({ required: true }) instructions: string;
}
export const ReceptionScheduleSchema = SchemaFactory.createForClass(ReceptionSchedule);

@Schema(baseSchemaOptions)
export class SalesPoint {
  @Prop({ required: true }) merchantId: string;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) address: string;
  @Prop({ type: GeoSchema, required: true }) geo: Geo;
  @Prop({ required: true }) phone: string;
  @Prop({ type: ReceptionScheduleSchema, required: true }) receptionSchedule: ReceptionSchedule;
}
export const SalesPointSchema = SchemaFactory.createForClass(SalesPoint);
