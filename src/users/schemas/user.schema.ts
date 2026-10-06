import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { AccountStatus, Role } from '../../shared/domain/enums';
import { baseSchemaOptions } from '../../shared/mongoose/schema-options';

@Schema({ _id: false })
export class UserLocation {
  @Prop({ required: true }) neighborhood: string;
  @Prop({ required: true }) city: string;
  @Prop() lat?: number;
  @Prop() lng?: number;
}
export const UserLocationSchema = SchemaFactory.createForClass(UserLocation);

@Schema({ collection: 'users', discriminatorKey: 'role', ...baseSchemaOptions })
export class User {
  @Prop({ required: true }) name: string;
  @Prop({ required: true, unique: true }) email: string;
  @Prop({ required: true }) phone: string;
  @Prop({ required: true, type: String }) role: Role;
  @Prop({ default: false }) verified: boolean;
  @Prop({ required: true }) createdAt: Date;
  @Prop({ required: true, type: String }) accountStatus: AccountStatus;
  @Prop({ type: UserLocationSchema, required: true }) location: UserLocation;
  @Prop({ required: true, select: false }) password: string;
  @Prop({ select: false }) verificationCode?: string;
  @Prop({ select: false }) verificationCodeExpiresAt?: Date;
}
export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);
