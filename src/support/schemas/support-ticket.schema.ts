import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { baseSchemaOptions } from '../../shared/mongoose/schema-options';
import type { SupportMotivo, SupportRole } from '../support.constants';

// Consulta enviada desde /ayuda/contacto. `origen` y `faqsVistas` sirven para saber qué material de
// ayuda no está resolviendo dudas.
@Schema({
  ...baseSchemaOptions,
  timestamps: { createdAt: true, updatedAt: false },
})
export class SupportTicket {
  @Prop({ required: true, unique: true }) ticketId: string;
  @Prop({ required: true, type: String }) motivo: SupportMotivo;
  @Prop({ required: true, type: String }) rol: SupportRole;
  @Prop({ required: true }) nombre: string;
  @Prop({ required: true, lowercase: true, index: true }) email: string;
  @Prop({ required: true }) mensaje: string;
  @Prop() origen?: string;
  @Prop({ type: [String], default: [] }) faqsVistas: string[];
  @Prop({ default: false }) conCaptura: boolean;
  // Usuario logueado que la envió, si había sesión.
  @Prop() userId?: string;
  @Prop({ default: 'abierto' }) estado: string;
  createdAt?: Date;
}

export type SupportTicketDocument = HydratedDocument<SupportTicket>;
export const SupportTicketSchema = SchemaFactory.createForClass(SupportTicket);

// Contador por año para numerar los tickets: TR-2026-000123.
@Schema({ versionKey: false })
export class SupportCounter {
  @Prop({ required: true }) _id: string;
  @Prop({ required: true, default: 0 }) seq: number;
}

export const SupportCounterSchema =
  SchemaFactory.createForClass(SupportCounter);
