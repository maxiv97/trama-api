import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { baseSchemaOptions } from '../../shared/mongoose/schema-options';

@Schema(baseSchemaOptions)
export class Category {
  @Prop({ required: true }) label: string;

  @Prop({ type: [String], default: [] }) subcategories: string[];

  // Las categorías base son el catálogo canónico compartido: las ve y usa todo
  // comercio, no se pueden editar ni dar de baja.
  @Prop({ required: true, default: false }) base: boolean;

  // Comercio dueño de una categoría custom (vacío en las base).
  @Prop() ownerMerchantId?: string;

  // Categoría base a la que mapea una custom, para consolidar métricas globales.
  @Prop() parentLabel?: string;

  // Baja lógica: una categoría inactiva deja de ofrecerse sin borrar el historial.
  @Prop({ required: true, default: true }) active: boolean;
}

export type CategoryDocument = HydratedDocument<Category>;
export const CategorySchema = SchemaFactory.createForClass(Category);
