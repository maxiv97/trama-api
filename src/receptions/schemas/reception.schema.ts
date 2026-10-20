import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { ReceptionDiscrepancy, ReceptionResult } from '../../shared/domain/enums';
import { baseSchemaOptions } from '../../shared/mongoose/schema-options';

@Schema(baseSchemaOptions)
export class Reception {
  @Prop({ required: true, index: true }) garmentId: string;
  @Prop({ required: true }) receivedAt: Date;
  @Prop({ required: true }) salesPointId: string;
  @Prop({ required: true, type: String }) result: ReceptionResult;
  @Prop({ type: [String], default: [] }) discrepancies: ReceptionDiscrepancy[];
  @Prop() detail?: string;
  @Prop({ type: [String], default: [] }) evidence: string[];
  @Prop({ required: true }) receiptNumber: string;
  @Prop({ required: true }) handledBy: string;
}
export type ReceptionDocument = HydratedDocument<Reception>;
export const ReceptionSchema = SchemaFactory.createForClass(Reception);
