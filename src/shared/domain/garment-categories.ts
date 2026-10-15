// Must match the `label` values in trama-web
// (src/app/core/models/garment-taxonomy.ts): the upload wizard sends them as-is.
// Do not rename existing labels — stored garments and seed data use them.
export const GARMENT_CATEGORY_LABELS = [
  'Camperas y abrigos',
  'Buzos y sweaters',
  'Sacos y blazers',
  'Remeras y tops',
  'Camisas y blusas',
  'Vestidos',
  'Monos y enteritos',
  'Pantalones',
  'Polleras y shorts',
  'Ropa deportiva',
  'Trajes de baño',
  'Calzado',
  'Bolsos y carteras',
  'Accesorios',
  'Bijouterie y joyas',
] as const;

export type GarmentCategory = (typeof GARMENT_CATEGORY_LABELS)[number];
