import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { baseSchemaOptions } from '../../shared/mongoose/schema-options';

@Schema(baseSchemaOptions)
export class Consignor {
  @Prop({ required: true }) dni: string;
  @Prop() bankDetails?: string;
}
export type ConsignorDocument = HydratedDocument<Consignor>;
export const ConsignorSchema = SchemaFactory.createForClass(Consignor);
