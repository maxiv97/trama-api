import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

// Secuencia atómica para generar códigos legibles de prenda (TRA-00001).
@Schema({ versionKey: false })
export class Counter {
  @Prop({ required: true }) _id: string;
  @Prop({ required: true, default: 0 }) seq: number;
}

export type CounterDocument = HydratedDocument<Counter>;
export const CounterSchema = SchemaFactory.createForClass(Counter);
