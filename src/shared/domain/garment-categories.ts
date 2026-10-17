// Catálogo canónico de categorías, base compartida por toda la plataforma.
// Se siembra en la colección `categories` (ver CategoriesService.seedBase) y es
// la fuente de verdad: trama-web lo consume por la API en lugar de una lista
// estática. No renombrar labels existentes — hay prendas y datos demo que los usan.
// Cada lista de subcategorías cierra con "Otro" como comodín en el front.
export interface CanonicalCategory {
  label: string;
  subcategories: string[];
}

export const CANONICAL_CATEGORIES: CanonicalCategory[] = [
  {
    label: 'Camperas y abrigos',
    subcategories: [
      'Campera de jean',
      'Campera de cuero',
      'Campera de abrigo',
      'Rompevientos',
      'Parka',
      'Tapado',
      'Sobretodo',
      'Piloto',
      'Chaleco',
      'Poncho',
    ],
  },
  {
    label: 'Buzos y sweaters',
    subcategories: [
      'Buzo con capucha',
      'Buzo sin capucha',
      'Sweater',
      'Cárdigan',
      'Polerón',
      'Chaleco tejido',
      'Polar',
    ],
  },
  {
    label: 'Sacos y blazers',
    subcategories: ['Blazer', 'Saco de vestir', 'Saco sport', 'Traje completo'],
  },
  {
    label: 'Remeras y tops',
    subcategories: [
      'Remera manga corta',
      'Remera manga larga',
      'Musculosa',
      'Top',
      'Crop top',
      'Body',
      'Chomba',
    ],
  },
  {
    label: 'Camisas y blusas',
    subcategories: ['Camisa', 'Camisa de jean', 'Camisa de lino', 'Blusa'],
  },
  {
    label: 'Vestidos',
    subcategories: ['Casual', 'De fiesta', 'Corto', 'Midi', 'Largo', 'Camisero', 'Tejido'],
  },
  {
    label: 'Monos y enteritos',
    subcategories: ['Mono largo', 'Mono corto', 'Enterito', 'Jardinero'],
  },
  {
    label: 'Pantalones',
    subcategories: ['Jean', 'De vestir', 'Cargo', 'Chino', 'Palazzo', 'Calza', 'Jogging'],
  },
  {
    label: 'Polleras y shorts',
    subcategories: [
      'Pollera corta',
      'Pollera midi',
      'Pollera larga',
      'Short de jean',
      'Short de vestir',
      'Bermuda',
    ],
  },
  {
    label: 'Ropa deportiva',
    subcategories: [
      'Remera deportiva',
      'Calza deportiva',
      'Short deportivo',
      'Campera deportiva',
      'Conjunto deportivo',
      'Top deportivo',
    ],
  },
  {
    label: 'Trajes de baño',
    subcategories: ['Bikini', 'Malla entera', 'Short de baño', 'Pareo'],
  },
  {
    label: 'Calzado',
    subcategories: [
      'Zapatillas',
      'Zapatillas deportivas',
      'Zapatos de vestir',
      'Mocasines',
      'Zapatos de taco',
      'Stilettos',
      'Chatitas',
      'Botas',
      'Botinetas',
      'Borcegos',
      'Sandalias',
      'Ojotas',
      'Alpargatas',
    ],
  },
  {
    label: 'Bolsos y carteras',
    subcategories: [
      'Cartera',
      'Bandolera',
      'Bolso de mano',
      'Clutch / sobre',
      'Mochila',
      'Riñonera',
      'Bolso de viaje',
      'Tote bag',
      'Billetera',
    ],
  },
  {
    label: 'Accesorios',
    subcategories: [
      'Cinturón',
      'Bufanda',
      'Pañuelo',
      'Gorro',
      'Gorra',
      'Sombrero',
      'Guantes',
      'Anteojos de sol',
      'Corbata',
      'Accesorios para el pelo',
    ],
  },
  {
    label: 'Bijouterie y joyas',
    subcategories: ['Collar', 'Aros', 'Pulsera', 'Anillo', 'Reloj', 'Broche'],
  },
];

export const GARMENT_CATEGORY_LABELS = CANONICAL_CATEGORIES.map(
  (category) => category.label,
) as readonly string[];

export type GarmentCategory = string;
