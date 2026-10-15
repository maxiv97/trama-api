import type {
  GarmentCondition,
  GarmentStatus,
  NotificationType,
  PaymentMethod,
  ReceptionDiscrepancy,
  ReceptionResult,
} from '../shared/domain/enums';
import type { GarmentCategory as AnyGarmentCategory } from '../shared/domain/garment-categories';

// The demo dataset only covers the original seven categories (each needs a
// hand-picked photo pool and a pricing profile below); the full catalog lives
// in shared/domain/garment-categories.ts.
const GARMENT_CATEGORY_LABELS = [
  'Camperas y abrigos',
  'Vestidos',
  'Pantalones',
  'Remeras y tops',
  'Camisas y blusas',
  'Calzado',
  'Accesorios',
] as const satisfies readonly AnyGarmentCategory[];

type GarmentCategory = (typeof GARMENT_CATEGORY_LABELS)[number];

// ---------------------------------------------------------------------------
// A large, deterministic dataset for one demo merchant: ~100 garments spread
// over the last 6 months, touching every GarmentStatus, so the reports/
// dashboards built on top of trama-api have something worth charting.
// Dates are computed relative to `now` (captured once, at generation time),
// not hardcoded — so re-running the seed later still produces a sensible
// "last 6 months" spread, current stock ages, and overdue/upcoming payouts.
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

// ---- deterministic PRNG (mulberry32) so re-running the seed is reproducible ----
function mulberry32(seed: number): () => number {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;

function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

function pickWeighted<T>(
  rng: Rng,
  items: readonly { value: T; weight: number }[],
): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = rng() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item.value;
  }
  return items[items.length - 1].value;
}

function pickTwoDistinct<T>(rng: Rng, items: readonly T[]): [T, T] {
  const first = Math.floor(rng() * items.length);
  let second = Math.floor(rng() * (items.length - 1));
  if (second >= first) second += 1;
  return [items[first], items[second]];
}

function randInt(rng: Rng, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function daysBefore(now: Date, days: number): Date {
  return addDays(now, -days);
}

// ---------------------------------------------------------------------------
// Photos — real, category-appropriate stock photography (Unsplash), picked by
// hand per category and verified to resolve. Every garment gets 2 distinct
// photos from its category's pool, resized via Unsplash's imgix params.
// ---------------------------------------------------------------------------

const CATEGORY_PHOTO_IDS: Record<GarmentCategory, string[]> = {
  'Camperas y abrigos': [
    'photo-1551028719-00167b16eac5',
    'photo-1592158249887-ac6ae7921691',
    'photo-1539533113208-f6df8cc8b543',
    'photo-1425100599170-85ec4f00a6ee',
  ],
  Vestidos: [
    'photo-1533659828870-95ee305cee3e',
    'photo-1496747611176-843222e1e57c',
    'photo-1496217590455-aa63a8350eea',
    'photo-1528494553736-33532ee22168',
  ],
  Pantalones: [
    'photo-1542272604-787c3835535d',
    'photo-1541840031508-326b77c9a17e',
    'photo-1624378439575-d8705ad7ae80',
    'photo-1473966968600-fa801b869a1a',
  ],
  'Remeras y tops': [
    'photo-1503340588524-222d094c7066',
    'photo-1544441892-715e8df46144',
    'photo-1529374255404-311a2a4f1fd9',
    'photo-1648483098902-7af8f711498f',
  ],
  'Camisas y blusas': [
    'photo-1584030373081-f37b7bb4fa8e',
    'photo-1608234807905-4466023792f5',
    'photo-1564257631407-4deb1f99d992',
    'photo-1549062572-544a64fb0c56',
  ],
  Calzado: [
    'photo-1560769629-975ec94e6a86',
    'photo-1542219550-37153d387c27',
    'photo-1605733160314-4fc7dac4bb16',
    'photo-1550998358-08b4f83dc345',
  ],
  Accesorios: [
    'photo-1584917865442-de89df76afd3',
    'photo-1548036328-c9fa89d128fa',
    'photo-1577803645773-f96470509666',
    'photo-1508296695146-257a814070b4',
  ],
};

function photoUrl(id: string): string {
  return `https://images.unsplash.com/${id}?w=1200&q=80&auto=format&fit=crop`;
}

function pickPhotos(rng: Rng, category: GarmentCategory): string[] {
  const [a, b] = pickTwoDistinct(rng, CATEGORY_PHOTO_IDS[category]);
  return [photoUrl(a), photoUrl(b)];
}

// ---------------------------------------------------------------------------
// Garment templates: name / brand / subcategory / attribute pools per
// category, plus the consignor-price band that category tends to sell in.
// ---------------------------------------------------------------------------

interface GarmentTemplate {
  name: string;
  subcategory?: string;
  brands: string[];
  sizes: string[];
  colors: string[];
  seasons: string[];
}

interface CategoryProfile {
  templates: GarmentTemplate[];
  priceRange: [number, number]; // requested consignor price, ARS
  sellSpeed: 'fast' | 'medium' | 'slow'; // flavors days-to-sale
}

const CATEGORY_PROFILES: Record<GarmentCategory, CategoryProfile> = {
  'Camperas y abrigos': {
    priceRange: [8000, 22000],
    sellSpeed: 'medium',
    templates: [
      {
        name: 'Campera de jean',
        brands: ["Levi's", 'Wanama', 'Mistral'],
        sizes: ['S', 'M', 'L'],
        colors: ['Azul', 'Celeste'],
        seasons: ['Otoño', 'Primavera'],
      },
      {
        name: 'Campera de cuero',
        subcategory: 'Campera',
        brands: ["Levi's", 'Uma', 'Airbag'],
        sizes: ['S', 'M', 'L'],
        colors: ['Negro', 'Marrón'],
        seasons: ['Invierno', 'Otoño'],
      },
      {
        name: 'Tapado de paño',
        subcategory: 'Tapado',
        brands: ['Ayres', 'Vitamina', 'Mishka'],
        sizes: ['M', 'L', 'XL'],
        colors: ['Camel', 'Gris', 'Negro'],
        seasons: ['Invierno'],
      },
      {
        name: 'Parka impermeable',
        subcategory: 'Parka',
        brands: ['Kosiuko', 'Rapsodia'],
        sizes: ['S', 'M', 'L'],
        colors: ['Verde', 'Negro'],
        seasons: ['Invierno', 'Otoño'],
      },
      {
        name: 'Blazer de lana',
        subcategory: 'Blazer',
        brands: ['Complot', 'Ayres'],
        sizes: ['S', 'M'],
        colors: ['Beige', 'Negro'],
        seasons: ['Otoño', 'Invierno'],
      },
    ],
  },
  Vestidos: {
    priceRange: [6000, 18000],
    sellSpeed: 'fast',
    templates: [
      {
        name: 'Vestido de fiesta',
        subcategory: 'Fiesta',
        brands: ['Zara', 'Rapsodia', 'Ginebra'],
        sizes: ['S', 'M', 'L'],
        colors: ['Negro', 'Bordó'],
        seasons: ['Verano'],
      },
      {
        name: 'Vestido floreado',
        subcategory: 'Casual',
        brands: ['Mishka', 'Wanama', 'Ayres'],
        sizes: ['S', 'M'],
        colors: ['Estampado', 'Blanco'],
        seasons: ['Verano', 'Primavera'],
      },
      {
        name: 'Vestido de lino',
        subcategory: 'Casual',
        brands: ['Vitamina', 'Complot'],
        sizes: ['M', 'L'],
        colors: ['Crudo', 'Verde'],
        seasons: ['Verano'],
      },
      {
        name: 'Vestido de gala',
        subcategory: 'Fiesta',
        brands: ['Ginebra', 'Cher'],
        sizes: ['S', 'M'],
        colors: ['Verde esmeralda', 'Negro'],
        seasons: ['Verano'],
      },
      {
        name: 'Vestido tejido',
        subcategory: 'Invierno',
        brands: ['Rapsodia', 'Ayres'],
        sizes: ['M', 'L'],
        colors: ['Gris', 'Camel'],
        seasons: ['Invierno'],
      },
    ],
  },
  Pantalones: {
    priceRange: [4000, 11000],
    sellSpeed: 'medium',
    templates: [
      {
        name: 'Jean recto',
        subcategory: 'Jean',
        brands: ['Rapsodia', "Levi's", 'Mistral'],
        sizes: ['26', '28', '30', '32'],
        colors: ['Celeste', 'Azul oscuro'],
        seasons: ['Todo el año'],
      },
      {
        name: 'Jean oxford',
        subcategory: 'Jean',
        brands: ["Levi's", 'Kosiuko'],
        sizes: ['28', '30', '32'],
        colors: ['Negro', 'Azul'],
        seasons: ['Todo el año'],
      },
      {
        name: 'Pantalón de vestir',
        subcategory: 'Formal',
        brands: ['Complot', 'Ayres'],
        sizes: ['S', 'M', 'L'],
        colors: ['Negro', 'Gris'],
        seasons: ['Todo el año'],
      },
      {
        name: 'Pantalón cargo',
        subcategory: 'Cargo',
        brands: ['Wanama', 'Airbag'],
        sizes: ['S', 'M', 'L'],
        colors: ['Verde militar', 'Beige'],
        seasons: ['Otoño', 'Primavera'],
      },
      {
        name: 'Calza deportiva',
        subcategory: 'Deportivo',
        brands: ['Nike', 'Adidas'],
        sizes: ['S', 'M', 'L'],
        colors: ['Negro', 'Gris'],
        seasons: ['Todo el año'],
      },
    ],
  },
  'Remeras y tops': {
    priceRange: [2500, 7000],
    sellSpeed: 'fast',
    templates: [
      {
        name: 'Remera básica',
        brands: ['47 Street', 'Wanama'],
        sizes: ['S', 'M', 'L'],
        colors: ['Blanco', 'Negro'],
        seasons: ['Todo el año'],
      },
      {
        name: 'Top cruzado',
        subcategory: 'Top',
        brands: ['Kosiuko', 'Mishka'],
        sizes: ['S', 'M'],
        colors: ['Negro', 'Estampado'],
        seasons: ['Verano'],
      },
      {
        name: 'Musculosa de lino',
        subcategory: 'Musculosa',
        brands: ['Vitamina'],
        sizes: ['S', 'M', 'L'],
        colors: ['Crudo', 'Blanco'],
        seasons: ['Verano'],
      },
      {
        name: 'Remera estampada',
        brands: ['47 Street', 'Complot'],
        sizes: ['S', 'M', 'L'],
        colors: ['Estampado'],
        seasons: ['Todo el año'],
      },
      {
        name: 'Body de algodón',
        subcategory: 'Body',
        brands: ['Mistral'],
        sizes: ['S', 'M'],
        colors: ['Negro', 'Blanco'],
        seasons: ['Verano'],
      },
    ],
  },
  'Camisas y blusas': {
    priceRange: [3500, 9000],
    sellSpeed: 'medium',
    templates: [
      {
        name: 'Blusa de seda',
        subcategory: 'Blusa',
        brands: ['Rapsodia', 'Ginebra'],
        sizes: ['S', 'M'],
        colors: ['Verde', 'Blanco'],
        seasons: ['Primavera'],
      },
      {
        name: 'Camisa a rayas',
        subcategory: 'Camisa',
        brands: ['Complot', 'Ayres'],
        sizes: ['S', 'M', 'L'],
        colors: ['Rayas azul y blanco'],
        seasons: ['Todo el año'],
      },
      {
        name: 'Camisa de lino',
        subcategory: 'Camisa',
        brands: ['Vitamina', 'Uma'],
        sizes: ['M', 'L'],
        colors: ['Blanco', 'Celeste'],
        seasons: ['Verano'],
      },
      {
        name: 'Blusa con volados',
        subcategory: 'Blusa',
        brands: ['Mishka', 'Wanama'],
        sizes: ['S', 'M'],
        colors: ['Rosa', 'Blanco'],
        seasons: ['Primavera'],
      },
    ],
  },
  Calzado: {
    priceRange: [7000, 20000],
    sellSpeed: 'fast',
    templates: [
      {
        name: 'Zapatillas urbanas',
        brands: ['Nike', 'Adidas', 'Puma'],
        sizes: ['37', '38', '39', '40', '42'],
        colors: ['Blanco', 'Negro'],
        seasons: ['Todo el año'],
      },
      {
        name: 'Botas de cuero',
        subcategory: 'Botas',
        brands: ['Prüne', 'Uma'],
        sizes: ['36', '37', '38', '39'],
        colors: ['Marrón', 'Negro'],
        seasons: ['Invierno'],
      },
      {
        name: 'Sandalias de taco',
        subcategory: 'Sandalias',
        brands: ['Prüne', 'Ricky Sarkany'],
        sizes: ['36', '37', '38'],
        colors: ['Negro', 'Dorado'],
        seasons: ['Verano'],
      },
      {
        name: 'Mocasines',
        subcategory: 'Mocasines',
        brands: ['Prüne', 'Ayres'],
        sizes: ['37', '38', '39'],
        colors: ['Marrón', 'Negro'],
        seasons: ['Todo el año'],
      },
    ],
  },
  Accesorios: {
    priceRange: [4000, 16000],
    sellSpeed: 'slow',
    templates: [
      {
        name: 'Cartera de cuero',
        subcategory: 'Carteras',
        brands: ['Prüne', 'Uma'],
        sizes: ['Único'],
        colors: ['Suela', 'Negro'],
        seasons: ['Todo el año'],
      },
      {
        name: 'Bandolera chica',
        subcategory: 'Carteras',
        brands: ['Prüne', 'Airbag'],
        sizes: ['Único'],
        colors: ['Negro', 'Camel'],
        seasons: ['Todo el año'],
      },
      {
        name: 'Cinturón de cuero',
        subcategory: 'Cinturones',
        brands: ['Ayres', 'Uma'],
        sizes: ['S', 'M', 'L'],
        colors: ['Negro', 'Marrón'],
        seasons: ['Todo el año'],
      },
      {
        name: 'Pañuelo de seda',
        subcategory: 'Pañuelos',
        brands: ['Rapsodia', 'Ginebra'],
        sizes: ['Único'],
        colors: ['Estampado'],
        seasons: ['Todo el año'],
      },
      {
        name: 'Anteojos de sol',
        subcategory: 'Anteojos',
        brands: ['Infinit', 'Ray-Ban'],
        sizes: ['Único'],
        colors: ['Negro', 'Carey'],
        seasons: ['Verano'],
      },
    ],
  },
};

const CONDITIONS: { value: GarmentCondition; weight: number }[] = [
  { value: 'new', weight: 10 },
  { value: 'very_good', weight: 40 },
  { value: 'good', weight: 35 },
  { value: 'fair', weight: 15 },
];

const CONDITION_LABEL: Record<GarmentCondition, string> = {
  new: 'con etiqueta, sin uso',
  very_good: 'muy buen estado, poco uso',
  good: 'buen estado, uso moderado',
  fair: 'estado aceptable, con señales de uso',
};

const DISCREPANCY_TYPES: ReceptionDiscrepancy[] = [
  'condition',
  'damage',
  'photo_mismatch',
  'measurements',
  'accessories',
  'hygiene',
];

const DISCREPANCY_NOTE: Record<ReceptionDiscrepancy, string> = {
  condition: 'El estado real difiere levemente de lo declarado',
  damage: 'Presenta un daño no informado en la carga',
  photo_mismatch: 'La prenda recibida no coincide del todo con las fotos',
  measurements: 'El talle real difiere del informado',
  accessories:
    'Faltan accesorios mencionados en la carga (cinturón, funda, etc.)',
  hygiene: 'Requiere limpieza antes de exhibirse',
};

// ---------------------------------------------------------------------------
// Consignors — 12 people with a "reliability" tag that biases which cohorts
// (accepted / rejected / cancelled) they tend to land in, so the "consignor
// performance" report shows real spread instead of a flat 100% everywhere.
// ---------------------------------------------------------------------------

export interface DemoConsignorDef {
  key: string;
  name: string;
  email: string;
  phone: string;
  dni: string;
  verified: boolean;
  neighborhood: string;
  city: string;
  lat: number;
  lng: number;
  reliability: 'reliable' | 'average' | 'risky';
}

export const DEMO_CONSIGNORS: DemoConsignorDef[] = [
  {
    key: 'dc-1',
    name: 'Camila Suárez',
    email: 'camila.suarez.demo@trama.app',
    phone: '351-4100001',
    dni: '30.111.001',
    verified: true,
    neighborhood: 'Nueva Córdoba',
    city: 'Córdoba',
    lat: -31.4281,
    lng: -64.1888,
    reliability: 'reliable',
  },
  {
    key: 'dc-2',
    name: 'Bruno Ferreyra',
    email: 'bruno.ferreyra.demo@trama.app',
    phone: '351-4100002',
    dni: '29.222.002',
    verified: true,
    neighborhood: 'Cofico',
    city: 'Córdoba',
    lat: -31.4104,
    lng: -64.1794,
    reliability: 'reliable',
  },
  {
    key: 'dc-3',
    name: 'Valentina Ríos',
    email: 'valentina.rios.demo@trama.app',
    phone: '351-4100003',
    dni: '33.333.003',
    verified: true,
    neighborhood: 'Güemes',
    city: 'Córdoba',
    lat: -31.4256,
    lng: -64.195,
    reliability: 'reliable',
  },
  {
    key: 'dc-4',
    name: 'Tomás Aguirre',
    email: 'tomas.aguirre.demo@trama.app',
    phone: '351-4100004',
    dni: '31.444.004',
    verified: true,
    neighborhood: 'Alta Córdoba',
    city: 'Córdoba',
    lat: -31.3891,
    lng: -64.1795,
    reliability: 'average',
  },
  {
    key: 'dc-5',
    name: 'Martina Correa',
    email: 'martina.correa.demo@trama.app',
    phone: '351-4100005',
    dni: '32.555.005',
    verified: false,
    neighborhood: 'Cerro de las Rosas',
    city: 'Córdoba',
    lat: -31.3833,
    lng: -64.2378,
    reliability: 'average',
  },
  {
    key: 'dc-6',
    name: 'Ignacio Molina',
    email: 'ignacio.molina.demo@trama.app',
    phone: '351-4100006',
    dni: '28.666.006',
    verified: true,
    neighborhood: 'General Paz',
    city: 'Córdoba',
    lat: -31.4137,
    lng: -64.1728,
    reliability: 'average',
  },
  {
    key: 'dc-7',
    name: 'Sofía Peralta',
    email: 'sofia.peralta.demo@trama.app',
    phone: '351-4100007',
    dni: '34.777.007',
    verified: true,
    neighborhood: 'Nueva Córdoba',
    city: 'Córdoba',
    lat: -31.4293,
    lng: -64.1861,
    reliability: 'average',
  },
  {
    key: 'dc-8',
    name: 'Lucas Domínguez',
    email: 'lucas.dominguez.demo@trama.app',
    phone: '351-4100008',
    dni: '27.888.008',
    verified: false,
    neighborhood: 'Güemes',
    city: 'Córdoba',
    lat: -31.4249,
    lng: -64.1932,
    reliability: 'average',
  },
  {
    key: 'dc-9',
    name: 'Julieta Navarro',
    email: 'julieta.navarro.demo@trama.app',
    phone: '351-4100009',
    dni: '35.999.009',
    verified: false,
    neighborhood: 'Cofico',
    city: 'Córdoba',
    lat: -31.4088,
    lng: -64.1811,
    reliability: 'risky',
  },
  {
    key: 'dc-10',
    name: 'Franco Ledesma',
    email: 'franco.ledesma.demo@trama.app',
    phone: '351-4100010',
    dni: '30.101.010',
    verified: false,
    neighborhood: 'Alberdi',
    city: 'Córdoba',
    lat: -31.4103,
    lng: -64.2003,
    reliability: 'risky',
  },
  {
    key: 'dc-11',
    name: 'Agustina Villalba',
    email: 'agustina.villalba.demo@trama.app',
    phone: '351-4100011',
    dni: '31.202.011',
    verified: true,
    neighborhood: 'Cerro de las Rosas',
    city: 'Córdoba',
    lat: -31.3809,
    lng: -64.2401,
    reliability: 'reliable',
  },
  {
    key: 'dc-12',
    name: 'Nicolás Bustos',
    email: 'nicolas.bustos.demo@trama.app',
    phone: '351-4100012',
    dni: '29.303.012',
    verified: false,
    neighborhood: 'General Paz',
    city: 'Córdoba',
    lat: -31.4155,
    lng: -64.1702,
    reliability: 'risky',
  },
];

const CONSIGNORS_BY_RELIABILITY: Record<
  DemoConsignorDef['reliability'],
  DemoConsignorDef[]
> = {
  reliable: DEMO_CONSIGNORS.filter((c) => c.reliability === 'reliable'),
  average: DEMO_CONSIGNORS.filter((c) => c.reliability === 'average'),
  risky: DEMO_CONSIGNORS.filter((c) => c.reliability === 'risky'),
};

function pickConsignorFor(rng: Rng, cohort: GarmentStatus): DemoConsignorDef {
  // Negative-outcome cohorts skew toward "risky" consignors; the bulk of
  // volume (in_stock/sold/paid_out) skews toward "reliable" ones — but
  // everyone gets some spread so no report shows a mechanical 0%/100%.
  const weights: Record<DemoConsignorDef['reliability'], number> =
    cohort === 'no_agreement' || cohort === 'rejected' || cohort === 'cancelled'
      ? { reliable: 15, average: 35, risky: 50 }
      : cohort === 'in_stock' ||
          cohort === 'with_remarks' ||
          cohort === 'sold' ||
          cohort === 'paid_out'
        ? { reliable: 45, average: 40, risky: 15 }
        : { reliable: 33, average: 34, risky: 33 };
  const pool = pickWeighted(rng, [
    { value: 'reliable' as const, weight: weights.reliable },
    { value: 'average' as const, weight: weights.average },
    { value: 'risky' as const, weight: weights.risky },
  ]);
  return pick(rng, CONSIGNORS_BY_RELIABILITY[pool]);
}

// ---------------------------------------------------------------------------
// Sales points — 3 branches with uneven weight, so "sales by point" charts
// show a real ranking instead of a flat split.
// ---------------------------------------------------------------------------

export interface DemoSalesPointDef {
  key: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  phone: string;
  days: string;
  hours: string;
  instructions: string;
  weight: number;
}

export const DEMO_SALES_POINTS: DemoSalesPointDef[] = [
  {
    key: 'dsp-nc',
    name: 'Segunda Vuelta Nueva Córdoba',
    address: 'Bv. Illia 350',
    lat: -31.4278,
    lng: -64.1872,
    phone: '351-4200001',
    days: 'Lun a Sáb',
    hours: '10 a 19 h',
    instructions: 'Timbre local 1, preguntar por recepción de consignaciones.',
    weight: 45,
  },
  {
    key: 'dsp-crr',
    name: 'Segunda Vuelta Cerro de las Rosas',
    address: 'Rafael Núñez 4820',
    lat: -31.3798,
    lng: -64.2412,
    phone: '351-4200002',
    days: 'Mar a Sáb',
    hours: '11 a 20 h',
    instructions: 'Entregar en mostrador, dejar prenda planchada.',
    weight: 35,
  },
  {
    key: 'dsp-gp',
    name: 'Segunda Vuelta General Paz',
    address: 'Av. Vélez Sarsfield 1200',
    lat: -31.4142,
    lng: -64.1735,
    phone: '351-4200003',
    days: 'Lun a Vie',
    hours: '10 a 18 h',
    instructions: 'Recepción solo por la mañana, coordinar por teléfono.',
    weight: 20,
  },
];

function pickSalesPoint(rng: Rng): DemoSalesPointDef {
  return pickWeighted(
    rng,
    DEMO_SALES_POINTS.map((sp) => ({ value: sp, weight: sp.weight })),
  );
}

// ---------------------------------------------------------------------------
// Output shapes — mirror seed-data.ts's Seed* interfaces (garmentKey-based
// references resolved to real ids in seed.service.ts) plus a Reception type
// the original seed never populated.
// ---------------------------------------------------------------------------

interface DemoTimelineEvent {
  date: Date;
  actor: 'consignor' | 'merchant' | 'system';
  status: GarmentStatus;
  note?: string;
}

export interface DemoGarment {
  key: string;
  consignorKey: string;
  salesPointKey: string;
  name: string;
  category: string;
  subcategory?: string;
  brand: string;
  size: string;
  color: string;
  season: string;
  condition: GarmentCondition;
  description: string;
  photos: string[];
  status: GarmentStatus;
  createdAt: Date;
  timeline: DemoTimelineEvent[];
}

export interface DemoProposal {
  garmentKey: string;
  requestedConsignorPrice: number;
  calculatedSalePrice: number;
  status: 'under_review' | 'counteroffer' | 'agreed' | 'no_agreement';
  createdAt: Date;
  counteroffer?: { consignorPrice: number; salePrice: number; date: Date };
}

export interface DemoAgreement {
  garmentKey: string;
  agreedConsignorPrice: number;
  agreedSalePrice: number;
  appliedCommission: number;
  agreedAt: Date;
  saleDeadline: Date;
}

export interface DemoReception {
  garmentKey: string;
  salesPointKey: string;
  receivedAt: Date;
  result: ReceptionResult;
  discrepancies: ReceptionDiscrepancy[];
  detail?: string;
  receiptNumber: string;
  handledBy: string;
}

export interface DemoSale {
  garmentKey: string;
  actualSalePrice: number;
  soldAt: Date;
  consignorAmount: number;
  merchantCommission: number;
  paidAt?: Date;
  paymentMethod?: PaymentMethod;
  receiptNumber?: string;
}

export interface DemoNotification {
  userKey: string; // consignorKey, or the literal merchant key
  garmentKey: string;
  base: '/c' | '/m';
  type: NotificationType;
  text: string;
  date: Date;
  read: boolean;
}

export interface DemoDataset {
  garments: DemoGarment[];
  proposals: DemoProposal[];
  agreements: DemoAgreement[];
  receptions: DemoReception[];
  sales: DemoSale[];
  notifications: DemoNotification[];
}

// ---------------------------------------------------------------------------
// Merchant setup — commission split, terms, and the constants seed.service
// needs to make the whole thing idempotent.
// ---------------------------------------------------------------------------

export const DEMO_MERCHANT_KEY = 'mer-demo';
export const DEMO_MERCHANT_EMAIL = 'comercio.demo@segundavuelta.app';
export const DEMO_CONSIGNOR_PERCENTAGE = 65;
export const DEMO_MERCHANT_PERCENTAGE = 35;
export const DEMO_TERMS = {
  saleWindowMonths: 3,
  graceMonths: 1,
  payoutDay: 20,
};

// Cohort plan: target GarmentStatus, how many garments, and the age window
// (days-ago range for createdAt) that produces a meaningful spread across
// every rotation bucket, payout-overdue case, and expiring-consignment case.
interface Cohort {
  status: GarmentStatus;
  count: number;
  minDaysAgo: number;
  maxDaysAgo: number;
}

const COHORTS: Cohort[] = [
  { status: 'submitted', count: 1, minDaysAgo: 0, maxDaysAgo: 0 },
  { status: 'under_review', count: 7, minDaysAgo: 0, maxDaysAgo: 6 },
  { status: 'counteroffer', count: 5, minDaysAgo: 1, maxDaysAgo: 10 },
  { status: 'agreed', count: 6, minDaysAgo: 3, maxDaysAgo: 22 },
  { status: 'no_agreement', count: 5, minDaysAgo: 5, maxDaysAgo: 150 },
  { status: 'cancelled', count: 3, minDaysAgo: 5, maxDaysAgo: 150 },
  { status: 'rejected', count: 4, minDaysAgo: 10, maxDaysAgo: 150 },
  // in_stock / with_remarks ages are split explicitly below to hit every
  // rotation.stockAging bucket (0-15, 16-30, 31-45, 46-60, 61-90, 91-120, +120).
  { status: 'in_stock', count: 5, minDaysAgo: 3, maxDaysAgo: 15 },
  { status: 'in_stock', count: 4, minDaysAgo: 16, maxDaysAgo: 30 },
  { status: 'in_stock', count: 4, minDaysAgo: 31, maxDaysAgo: 45 },
  { status: 'in_stock', count: 4, minDaysAgo: 46, maxDaysAgo: 60 },
  { status: 'in_stock', count: 4, minDaysAgo: 61, maxDaysAgo: 90 },
  { status: 'in_stock', count: 2, minDaysAgo: 91, maxDaysAgo: 120 },
  { status: 'in_stock', count: 2, minDaysAgo: 121, maxDaysAgo: 150 },
  // Deliberately past the 3-month sale window + 1-month grace (~122 days),
  // so `reports/expiring` always has a guaranteed "overdue" example — the
  // 91-150 range above is too close to that boundary to guarantee one.
  { status: 'in_stock', count: 2, minDaysAgo: 155, maxDaysAgo: 200 },
  // And a couple sitting just inside the window, so `expiring` also has a
  // guaranteed "coming up soon" example rather than only overdue ones.
  { status: 'in_stock', count: 2, minDaysAgo: 106, maxDaysAgo: 114 },
  { status: 'with_remarks', count: 6, minDaysAgo: 10, maxDaysAgo: 70 },
  { status: 'sold', count: 6, minDaysAgo: 40, maxDaysAgo: 150 }, // unpaid, overdue payout
  { status: 'sold', count: 4, minDaysAgo: 5, maxDaysAgo: 20 }, // unpaid, still within terms
  { status: 'paid_out', count: 28, minDaysAgo: 35, maxDaysAgo: 175 },
];

const CATEGORIES = [...GARMENT_CATEGORY_LABELS];

const SELL_SPEED_DAYS: Record<CategoryProfile['sellSpeed'], [number, number]> =
  {
    fast: [4, 18],
    medium: [8, 30],
    slow: [15, 50],
  };

function templateFor(rng: Rng, category: GarmentCategory): GarmentTemplate {
  return pick(rng, CATEGORY_PROFILES[category].templates);
}

function round100(value: number): number {
  return Math.round(value / 100) * 100;
}

function calculateSalePrice(
  consignorPrice: number,
  consignorPercentage: number,
): number {
  return Math.round(consignorPrice / (consignorPercentage / 100));
}

function calculateConsignorAmount(
  actualSalePrice: number,
  consignorPercentage: number,
): number {
  return Math.round(actualSalePrice * (consignorPercentage / 100));
}

let garmentCounter = 0;
let notificationSeq = 0;

function buildGarment(
  rng: Rng,
  now: Date,
  cohort: Cohort,
  dataset: DemoDataset,
): void {
  garmentCounter += 1;
  const key = `dg-${garmentCounter}`;
  const category = pick(rng, CATEGORIES);
  const profile = CATEGORY_PROFILES[category];
  const template = templateFor(rng, category);
  const consignor = pickConsignorFor(rng, cohort.status);
  const salesPoint = pickSalesPoint(rng);
  const condition = pickWeighted(rng, CONDITIONS);
  const createdAt = daysBefore(
    now,
    randInt(rng, cohort.minDaysAgo, cohort.maxDaysAgo),
  );

  const [minPrice, maxPrice] = profile.priceRange;
  const requestedConsignorPrice = round100(randInt(rng, minPrice, maxPrice));
  const calculatedSalePrice = calculateSalePrice(
    requestedConsignorPrice,
    DEMO_CONSIGNOR_PERCENTAGE,
  );

  const garment: DemoGarment = {
    key,
    consignorKey: consignor.key,
    salesPointKey: salesPoint.key,
    name: template.name,
    category,
    subcategory: template.subcategory,
    brand: pick(rng, template.brands),
    size: pick(rng, template.sizes),
    color: pick(rng, template.colors),
    season: pick(rng, template.seasons),
    condition,
    description: `${template.name}, ${CONDITION_LABEL[condition]}.`,
    photos: pickPhotos(rng, category),
    status: cohort.status,
    createdAt,
    timeline: [
      {
        date: createdAt,
        actor: 'consignor',
        status: 'submitted',
        note: 'Propuesta enviada',
      },
    ],
  };

  if (cohort.status === 'submitted') {
    // Synthetic edge case: the real app auto-advances submitted -> under_review
    // the instant a garment is created, so this status never actually rests
    // here in production. Kept as a single example purely so the "submitted"
    // status badge has something to render in the UI during a demo.
    dataset.garments.push(garment);
    return;
  }

  const underReviewAt = createdAt;
  garment.timeline.push({
    date: underReviewAt,
    actor: 'system',
    status: 'under_review',
  });
  notify(dataset, {
    userKey: DEMO_MERCHANT_KEY,
    garmentKey: key,
    base: '/m',
    type: 'proposal',
    text: `Nueva propuesta de "${garment.name}" para revisar.`,
    date: underReviewAt,
    now,
  });

  if (cohort.status === 'under_review') {
    dataset.garments.push(garment);
    dataset.proposals.push({
      garmentKey: key,
      requestedConsignorPrice,
      calculatedSalePrice,
      status: 'under_review',
      createdAt: underReviewAt,
    });
    return;
  }

  // From here on, most cohorts get a shot at going through a counteroffer
  // round before landing on their target status.
  const wentThroughCounteroffer =
    cohort.status === 'counteroffer' || rng() < 0.35;
  let negotiationPrice = requestedConsignorPrice;
  let negotiationSalePrice = calculatedSalePrice;
  let counterofferAt: Date | undefined;
  let proposalStatus: DemoProposal['status'] = 'under_review';
  let counterofferPayload: DemoProposal['counteroffer'];

  if (wentThroughCounteroffer) {
    counterofferAt = addDays(underReviewAt, randInt(rng, 1, 3));
    negotiationPrice = round100(
      requestedConsignorPrice * (0.78 + rng() * 0.12),
    );
    negotiationSalePrice = calculateSalePrice(
      negotiationPrice,
      DEMO_CONSIGNOR_PERCENTAGE,
    );
    garment.timeline.push({
      date: counterofferAt,
      actor: 'merchant',
      status: 'counteroffer',
      note: 'Contraoferta enviada',
    });
    proposalStatus = 'counteroffer';
    counterofferPayload = {
      consignorPrice: negotiationPrice,
      salePrice: negotiationSalePrice,
      date: counterofferAt,
    };
    notify(dataset, {
      userKey: consignor.key,
      garmentKey: key,
      base: '/c',
      type: 'counteroffer',
      text: `El comercio te hizo una contraoferta por "${garment.name}".`,
      date: counterofferAt,
      now,
    });
  }

  if (cohort.status === 'counteroffer') {
    dataset.garments.push(garment);
    dataset.proposals.push({
      garmentKey: key,
      requestedConsignorPrice,
      calculatedSalePrice,
      status: proposalStatus,
      createdAt: underReviewAt,
      counteroffer: counterofferPayload,
    });
    return;
  }

  if (cohort.status === 'no_agreement') {
    const rejectedAt = addDays(
      counterofferAt ?? underReviewAt,
      randInt(rng, 1, 5),
    );
    garment.timeline.push({
      date: rejectedAt,
      actor: 'merchant',
      status: 'no_agreement',
      note: 'Propuesta rechazada',
    });
    dataset.garments.push(garment);
    dataset.proposals.push({
      garmentKey: key,
      requestedConsignorPrice,
      calculatedSalePrice,
      status: 'no_agreement',
      createdAt: underReviewAt,
      counteroffer: counterofferPayload,
    });
    notify(dataset, {
      userKey: consignor.key,
      garmentKey: key,
      base: '/c',
      type: 'proposal',
      text: `El comercio rechazó tu propuesta de "${garment.name}".`,
      date: rejectedAt,
      now,
    });
    return;
  }

  if (cohort.status === 'cancelled') {
    const cancelledAt = addDays(
      counterofferAt ?? underReviewAt,
      randInt(rng, 1, 6),
    );
    garment.timeline.push({
      date: cancelledAt,
      actor: 'consignor',
      status: 'cancelled',
      note: 'Cancelado por el cedente',
    });
    dataset.garments.push(garment);
    dataset.proposals.push({
      garmentKey: key,
      requestedConsignorPrice,
      calculatedSalePrice,
      status: proposalStatus,
      createdAt: underReviewAt,
      counteroffer: counterofferPayload,
    });
    notify(dataset, {
      userKey: DEMO_MERCHANT_KEY,
      garmentKey: key,
      base: '/m',
      type: 'proposal',
      text: `El cedente canceló "${garment.name}".`,
      date: cancelledAt,
      now,
    });
    return;
  }

  // Everything past this point reaches an agreement.
  const agreedAt = addDays(counterofferAt ?? underReviewAt, randInt(rng, 1, 4));
  const agreedActor = wentThroughCounteroffer ? 'consignor' : 'merchant';
  garment.timeline.push({
    date: agreedAt,
    actor: agreedActor,
    status: 'agreed',
    note: 'Precio acordado',
  });
  dataset.proposals.push({
    garmentKey: key,
    requestedConsignorPrice,
    calculatedSalePrice,
    status: 'agreed',
    createdAt: underReviewAt,
    counteroffer: counterofferPayload,
  });
  const saleDeadline = new Date(agreedAt);
  saleDeadline.setMonth(saleDeadline.getMonth() + DEMO_TERMS.saleWindowMonths);
  dataset.agreements.push({
    garmentKey: key,
    agreedConsignorPrice: negotiationPrice,
    agreedSalePrice: negotiationSalePrice,
    appliedCommission: DEMO_MERCHANT_PERCENTAGE,
    agreedAt,
    saleDeadline,
  });
  notify(dataset, {
    userKey: consignor.key,
    garmentKey: key,
    base: '/c',
    type: 'agreement',
    text: wentThroughCounteroffer
      ? `El cedente aceptó tu contraoferta de "${garment.name}".`
      : `El comercio aceptó tu propuesta de "${garment.name}".`,
    date: agreedAt,
    now,
  });

  if (cohort.status === 'agreed') {
    dataset.garments.push(garment);
    return;
  }

  // Reception: rejected cohort always rejects; everyone else gets a mostly
  // clean reception, with a chance of remarks even on garments that go on
  // to sell (feeds the discrepancies report beyond just the terminal cohort).
  const receivedAt = addDays(agreedAt, randInt(rng, 2, 8));
  const receiptNumber = `REC-${key.toUpperCase()}`;

  if (cohort.status === 'rejected') {
    const discCount = randInt(rng, 1, 2);
    const discrepancies = sampleDiscrepancies(rng, discCount);
    garment.timeline.push({
      date: receivedAt,
      actor: 'merchant',
      status: 'rejected',
      note: 'Recepción rechazada',
    });
    dataset.garments.push(garment);
    dataset.receptions.push({
      garmentKey: key,
      salesPointKey: salesPoint.key,
      receivedAt,
      result: 'rejected',
      discrepancies,
      detail: discrepancies.map((d) => DISCREPANCY_NOTE[d]).join(' · '),
      receiptNumber,
      handledBy: 'Encargado/a de local',
    });
    notify(dataset, {
      userKey: consignor.key,
      garmentKey: key,
      base: '/c',
      type: 'reception',
      text: `El comercio rechazó la recepción de "${garment.name}".`,
      date: receivedAt,
      now,
    });
    return;
  }

  const isWithRemarksTerminal = cohort.status === 'with_remarks';
  const hasRemarksAtReception = isWithRemarksTerminal || rng() < 0.12;
  const receptionResult: ReceptionResult = hasRemarksAtReception
    ? 'with_remarks'
    : 'accepted';
  const discrepancies = hasRemarksAtReception
    ? sampleDiscrepancies(rng, randInt(rng, 1, 2))
    : [];
  const receptionStatus: GarmentStatus = hasRemarksAtReception
    ? 'with_remarks'
    : 'in_stock';

  garment.timeline.push({
    date: receivedAt,
    actor: 'merchant',
    status: receptionStatus,
    note: hasRemarksAtReception
      ? 'Recibida con observaciones'
      : 'Recibida conforme',
  });
  dataset.receptions.push({
    garmentKey: key,
    salesPointKey: salesPoint.key,
    receivedAt,
    result: receptionResult,
    discrepancies,
    detail: discrepancies.length
      ? discrepancies.map((d) => DISCREPANCY_NOTE[d]).join(' · ')
      : undefined,
    receiptNumber,
    handledBy: 'Encargado/a de local',
  });
  notify(dataset, {
    userKey: consignor.key,
    garmentKey: key,
    base: '/c',
    type: 'reception',
    text: hasRemarksAtReception
      ? `El comercio recibió "${garment.name}" con observaciones.`
      : `El comercio recibió "${garment.name}" conforme.`,
    date: receivedAt,
    now,
  });

  if (cohort.status === 'in_stock' || cohort.status === 'with_remarks') {
    dataset.garments.push(garment);
    return;
  }

  // sold / paid_out: register the sale after `receivedAt`, flavored by how
  // fast this category typically sells, but never later than `now`.
  const [minSellDays, maxSellDays] = SELL_SPEED_DAYS[profile.sellSpeed];
  const latestPossible = Math.max(
    1,
    Math.floor((now.getTime() - receivedAt.getTime()) / DAY_MS) - 1,
  );
  const sellGap = Math.min(
    randInt(rng, minSellDays, maxSellDays),
    latestPossible,
  );
  const soldAt = addDays(receivedAt, Math.max(1, sellGap));
  const priceVariance = 0.95 + rng() * 0.1; // small realistic spread around the agreed sale price
  const actualSalePrice = round100(negotiationSalePrice * priceVariance);
  const consignorAmount = calculateConsignorAmount(
    actualSalePrice,
    DEMO_CONSIGNOR_PERCENTAGE,
  );
  const merchantCommission = actualSalePrice - consignorAmount;

  garment.timeline.push({
    date: soldAt,
    actor: 'merchant',
    status: 'sold',
    note: 'Venta registrada',
  });
  notify(dataset, {
    userKey: consignor.key,
    garmentKey: key,
    base: '/c',
    type: 'sale',
    text: `¡Vendimos "${garment.name}"!`,
    date: soldAt,
    now,
  });

  const sale: DemoSale = {
    garmentKey: key,
    actualSalePrice,
    soldAt,
    consignorAmount,
    merchantCommission,
  };

  if (cohort.status === 'sold') {
    garment.status = 'sold';
    dataset.garments.push(garment);
    dataset.sales.push(sale);
    return;
  }

  // paid_out
  const payoutGap = randInt(rng, 4, 35);
  const latestPayout = Math.max(
    1,
    Math.floor((now.getTime() - soldAt.getTime()) / DAY_MS) - 1,
  );
  const paidAt = addDays(soldAt, Math.min(payoutGap, latestPayout));
  sale.paidAt = paidAt;
  sale.paymentMethod = rng() < 0.6 ? 'transfer' : 'cash';
  sale.receiptNumber = `PAY-${key.toUpperCase()}`;
  garment.timeline.push({
    date: paidAt,
    actor: 'merchant',
    status: 'paid_out',
    note: 'Liquidación pagada',
  });
  dataset.garments.push(garment);
  dataset.sales.push(sale);
  notify(dataset, {
    userKey: consignor.key,
    garmentKey: key,
    base: '/c',
    type: 'payout',
    text: `Liquidamos el pago de "${garment.name}".`,
    date: paidAt,
    now,
  });
}

function sampleDiscrepancies(rng: Rng, count: number): ReceptionDiscrepancy[] {
  const shuffled = [...DISCREPANCY_TYPES].sort(() => rng() - 0.5);
  return shuffled.slice(0, count);
}

function notify(
  dataset: DemoDataset,
  opts: {
    userKey: string;
    garmentKey: string;
    base: '/c' | '/m';
    type: NotificationType;
    text: string;
    date: Date;
    now: Date;
  },
): void {
  notificationSeq += 1;
  const daysOld = (opts.now.getTime() - opts.date.getTime()) / DAY_MS;
  // Older notifications are almost certainly read; recent ones are a mix —
  // gives the "no leídas" badge something real to count.
  const rng = mulberry32(notificationSeq * 2654435761);
  const read = daysOld > 5 ? true : rng() < 0.45;
  dataset.notifications.push({
    userKey: opts.userKey,
    garmentKey: opts.garmentKey,
    base: opts.base,
    type: opts.type,
    text: opts.text,
    date: opts.date,
    read,
  });
}

/**
 * Builds the full demo dataset. `now` is captured by the caller so every
 * date in the dataset (stock age, overdue payouts, expiring consignments)
 * stays correct relative to whenever the seed actually runs.
 */
export function buildDemoDataset(now: Date = new Date()): DemoDataset {
  const rng = mulberry32(20260826); // fixed seed: reproducible runs
  garmentCounter = 0;
  notificationSeq = 0;
  const dataset: DemoDataset = {
    garments: [],
    proposals: [],
    agreements: [],
    receptions: [],
    sales: [],
    notifications: [],
  };
  for (const cohort of COHORTS) {
    for (let i = 0; i < cohort.count; i += 1) {
      buildGarment(rng, now, cohort, dataset);
    }
  }
  return dataset;
}
