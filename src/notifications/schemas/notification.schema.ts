import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { NotificationType } from '../../shared/domain/enums';
import { baseSchemaOptions } from '../../shared/mongoose/schema-options';

@Schema(baseSchemaOptions)
export class Notification {
  @Prop({ required: true, index: true }) userId: string;
  @Prop({ required: true, type: String }) type: NotificationType;
  @Prop({ required: true }) text: string;
  @Prop({ required: true }) date: Date;
  @Prop({ default: false }) read: boolean;
  @Prop({ required: true }) target: string;
}

export type NotificationDocument = HydratedDocument<Notification>;
export const NotificationSchema = SchemaFactory.createForClass(Notification);
