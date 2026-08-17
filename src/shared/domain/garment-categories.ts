export const GARMENT_CATEGORY_LABELS = [
  'Camperas y abrigos',
  'Vestidos',
  'Pantalones',
  'Remeras y tops',
  'Camisas y blusas',
  'Calzado',
  'Accesorios',
] as const;

export type GarmentCategory = (typeof GARMENT_CATEGORY_LABELS)[number];
