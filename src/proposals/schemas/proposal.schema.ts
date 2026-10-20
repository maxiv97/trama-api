import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { ProposalStatus } from '../../shared/domain/enums';
import { baseSchemaOptions } from '../../shared/mongoose/schema-options';

@Schema({ _id: false })
export class Counteroffer {
  @Prop({ required: true }) consignorPrice: number;
  @Prop({ required: true }) salePrice: number;
  @Prop({ required: true }) date: Date;
}
export const CounterofferSchema = SchemaFactory.createForClass(Counteroffer);

@Schema(baseSchemaOptions)
export class Proposal {
  @Prop({ required: true, index: true }) garmentId: string;
  @Prop({ required: true }) requestedConsignorPrice: number;
  @Prop({ required: true }) calculatedSalePrice: number;
  @Prop({ required: true, type: String }) status: ProposalStatus;
  @Prop({ required: true }) createdAt: Date;
  @Prop({ type: CounterofferSchema }) counteroffer?: Counteroffer;
}
export type ProposalDocument = HydratedDocument<Proposal>;
export const ProposalSchema = SchemaFactory.createForClass(Proposal);
