import type {
  GarmentCondition,
  GarmentStatus,
  NotificationType,
} from '../shared/domain/enums';

// Days from today, so the still-in-stock consignment keeps a live sale deadline instead of drifting
// into the past as real time passes (the rest of the seed is historical and stays on fixed dates).
function daysFromNow(days: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}

interface SeedTimelineEvent {
  date: Date;
  actor: 'consignor' | 'merchant' | 'system';
  status: GarmentStatus;
  note?: string;
}

export interface SeedGarment {
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
  status: GarmentStatus;
  createdAt: Date;
  timeline: SeedTimelineEvent[];
}

export interface SeedProposal {
  garmentKey: string;
  requestedConsignorPrice: number;
  calculatedSalePrice: number;
  status: 'under_review' | 'counteroffer' | 'agreed' | 'no_agreement';
  createdAt: Date;
  counteroffer?: { consignorPrice: number; salePrice: number; date: Date };
}

export interface SeedAgreement {
  garmentKey: string;
  agreedConsignorPrice: number;
  agreedSalePrice: number;
  appliedCommission: number;
  agreedAt: Date;
  saleDeadline: Date;
}

export interface SeedSale {
  garmentKey: string;
  actualSalePrice: number;
  soldAt: Date;
  consignorAmount: number;
  merchantCommission: number;
  paidAt?: Date;
  paymentMethod?: 'cash' | 'transfer';
  receiptNumber?: string;
}

export interface SeedNotification {
  userKey: string;
  garmentKey: string;
  base: '/c' | '/m';
  type: NotificationType;
  text: string;
  date: Date;
}

export const MERCHANT_KEY = 'mer-trama';

export const SEED_GARMENTS: SeedGarment[] = [
  {
    key: 'gar-1',
    consignorKey: 'con-ana',
    salesPointKey: 'sp-nc',
    name: 'Vestido de fiesta',
    category: 'Vestidos',
    subcategory: 'Fiesta',
    brand: 'Zara',
    size: 'M',
    color: 'Negro',
    season: 'Verano',
    condition: 'very_good',
    description: 'Vestido negro largo, usado una vez.',
    status: 'under_review',
    createdAt: new Date('2026-06-20'),
    timeline: [
      {
        date: new Date('2026-06-20'),
        actor: 'consignor',
        status: 'submitted',
        note: 'Propuesta enviada',
      },
      { date: new Date('2026-06-20'), actor: 'system', status: 'under_review' },
    ],
  },
  {
    key: 'gar-2',
    consignorKey: 'con-ana',
    salesPointKey: 'sp-nc',
    name: 'Campera de jean',
    category: 'Camperas y abrigos',
    brand: "Levi's",
    size: 'S',
    color: 'Azul',
    season: 'Otoño',
    condition: 'good',
    description: 'Campera de jean clásica.',
    status: 'in_stock',
    createdAt: new Date('2026-05-10'),
    timeline: [
      { date: new Date('2026-05-10'), actor: 'consignor', status: 'submitted' },
      {
        date: new Date('2026-05-12'),
        actor: 'merchant',
        status: 'agreed',
        note: 'Precio acordado',
      },
      {
        date: new Date('2026-05-15'),
        actor: 'merchant',
        status: 'in_stock',
        note: 'Recibida conforme',
      },
    ],
  },
  {
    key: 'gar-3',
    consignorKey: 'con-luis',
    salesPointKey: 'sp-cr',
    name: 'Zapatillas urbanas',
    category: 'Calzado',
    brand: 'Nike',
    size: '42',
    color: 'Blanco',
    season: 'Todo el año',
    condition: 'good',
    description: 'Zapatillas blancas poco uso.',
    status: 'sold',
    createdAt: new Date('2026-04-15'),
    timeline: [
      { date: new Date('2026-04-15'), actor: 'consignor', status: 'submitted' },
      { date: new Date('2026-04-17'), actor: 'merchant', status: 'agreed' },
      { date: new Date('2026-04-20'), actor: 'merchant', status: 'in_stock' },
      {
        date: new Date('2026-06-05'),
        actor: 'merchant',
        status: 'sold',
        note: 'Vendida',
      },
    ],
  },
  {
    key: 'gar-4',
    consignorKey: 'con-ana',
    salesPointKey: 'sp-nc',
    name: 'Blusa de seda',
    category: 'Camisas y blusas',
    subcategory: 'Blusa',
    brand: 'Rapsodia',
    size: 'M',
    color: 'Verde',
    season: 'Primavera',
    condition: 'very_good',
    description: 'Blusa de seda con detalle bordado.',
    status: 'counteroffer',
    createdAt: new Date('2026-06-25'),
    timeline: [
      { date: new Date('2026-06-25'), actor: 'consignor', status: 'submitted' },
      { date: new Date('2026-06-25'), actor: 'system', status: 'under_review' },
      {
        date: new Date('2026-06-27'),
        actor: 'merchant',
        status: 'counteroffer',
        note: 'Contraoferta enviada',
      },
    ],
  },
  {
    key: 'gar-5',
    consignorKey: 'con-ana',
    salesPointKey: 'sp-nc',
    name: 'Abrigo de paño',
    category: 'Camperas y abrigos',
    subcategory: 'Tapado',
    brand: 'Ayres',
    size: 'L',
    color: 'Camel',
    season: 'Invierno',
    condition: 'good',
    description: 'Tapado de paño largo, muy abrigado.',
    status: 'agreed',
    createdAt: new Date('2026-06-18'),
    timeline: [
      { date: new Date('2026-06-18'), actor: 'consignor', status: 'submitted' },
      { date: new Date('2026-06-18'), actor: 'system', status: 'under_review' },
      {
        date: new Date('2026-06-21'),
        actor: 'merchant',
        status: 'agreed',
        note: 'Precio acordado',
      },
    ],
  },
  {
    key: 'gar-6',
    consignorKey: 'con-luis',
    salesPointKey: 'sp-nc',
    name: 'Botas de cuero',
    category: 'Calzado',
    subcategory: 'Botas',
    brand: 'Prüne',
    size: '38',
    color: 'Marrón',
    season: 'Invierno',
    condition: 'very_good',
    description: 'Botas de cuero marrón, taco bajo.',
    status: 'under_review',
    createdAt: new Date('2026-06-29'),
    timeline: [
      {
        date: new Date('2026-06-29'),
        actor: 'consignor',
        status: 'submitted',
        note: 'Propuesta enviada',
      },
      { date: new Date('2026-06-29'), actor: 'system', status: 'under_review' },
    ],
  },
  {
    key: 'gar-7',
    consignorKey: 'con-ana',
    salesPointKey: 'sp-nc',
    name: 'Cartera de cuero',
    category: 'Accesorios',
    subcategory: 'Carteras',
    brand: 'Prüne',
    size: 'Único',
    color: 'Suela',
    season: 'Todo el año',
    condition: 'very_good',
    description: 'Cartera de cuero natural con correa larga.',
    status: 'paid_out',
    createdAt: new Date('2026-04-08'),
    timeline: [
      { date: new Date('2026-04-08'), actor: 'consignor', status: 'submitted' },
      {
        date: new Date('2026-04-10'),
        actor: 'merchant',
        status: 'agreed',
        note: 'Precio acordado',
      },
      {
        date: new Date('2026-04-14'),
        actor: 'merchant',
        status: 'in_stock',
        note: 'Recibida conforme',
      },
      {
        date: new Date('2026-05-10'),
        actor: 'merchant',
        status: 'sold',
        note: 'Vendida',
      },
      {
        date: new Date('2026-06-18'),
        actor: 'merchant',
        status: 'paid_out',
        note: 'Liquidación pagada',
      },
    ],
  },
  {
    key: 'gar-8',
    consignorKey: 'con-luis',
    salesPointKey: 'sp-cr',
    name: 'Campera de cuero',
    category: 'Camperas y abrigos',
    subcategory: 'Campera',
    brand: "Levi's",
    size: 'M',
    color: 'Negro',
    season: 'Invierno',
    condition: 'good',
    description: 'Campera de cuero negra, forrada.',
    status: 'sold',
    createdAt: new Date('2026-04-20'),
    timeline: [
      { date: new Date('2026-04-20'), actor: 'consignor', status: 'submitted' },
      {
        date: new Date('2026-04-22'),
        actor: 'merchant',
        status: 'agreed',
        note: 'Precio acordado',
      },
      {
        date: new Date('2026-04-26'),
        actor: 'merchant',
        status: 'in_stock',
        note: 'Recibida conforme',
      },
      {
        date: new Date('2026-05-22'),
        actor: 'merchant',
        status: 'sold',
        note: 'Vendida',
      },
    ],
  },
  {
    key: 'gar-9',
    consignorKey: 'con-ana',
    salesPointKey: 'sp-nc',
    name: 'Jean recto',
    category: 'Pantalones',
    subcategory: 'Jean',
    brand: 'Rapsodia',
    size: '28',
    color: 'Celeste',
    season: 'Todo el año',
    condition: 'very_good',
    description: 'Jean recto tiro alto, poco uso.',
    status: 'sold',
    createdAt: new Date('2026-05-18'),
    timeline: [
      { date: new Date('2026-05-18'), actor: 'consignor', status: 'submitted' },
      {
        date: new Date('2026-05-20'),
        actor: 'merchant',
        status: 'agreed',
        note: 'Precio acordado',
      },
      {
        date: new Date('2026-05-24'),
        actor: 'merchant',
        status: 'in_stock',
        note: 'Recibida conforme',
      },
      {
        date: new Date('2026-06-12'),
        actor: 'merchant',
        status: 'sold',
        note: 'Vendida',
      },
    ],
  },
];

export const SEED_PROPOSALS: SeedProposal[] = [
  {
    garmentKey: 'gar-1',
    requestedConsignorPrice: 6000,
    calculatedSalePrice: 20000,
    status: 'under_review',
    createdAt: new Date('2026-06-20'),
  },
  {
    garmentKey: 'gar-4',
    requestedConsignorPrice: 9000,
    calculatedSalePrice: 30000,
    status: 'counteroffer',
    createdAt: new Date('2026-06-25'),
    counteroffer: {
      consignorPrice: 6000,
      salePrice: 20000,
      date: new Date('2026-06-27'),
    },
  },
  {
    garmentKey: 'gar-5',
    requestedConsignorPrice: 4500,
    calculatedSalePrice: 15000,
    status: 'agreed',
    createdAt: new Date('2026-06-18'),
  },
  {
    garmentKey: 'gar-6',
    requestedConsignorPrice: 7500,
    calculatedSalePrice: 25000,
    status: 'under_review',
    createdAt: new Date('2026-06-29'),
  },
];

export const SEED_AGREEMENTS: SeedAgreement[] = [
  {
    garmentKey: 'gar-2',
    agreedConsignorPrice: 3000,
    agreedSalePrice: 10000,
    appliedCommission: 70,
    // gar-2 is the only garment still in stock: keep its sale deadline 20 days ahead so it stays a
    // current "expiring consignment" whenever the seed runs (since 23/10/2026 a garment past its
    // sale deadline is no longer in stock: the deadlines job moves it to awaiting_pickup).
    agreedAt: daysFromNow(-70),
    saleDeadline: daysFromNow(20),
  },
  {
    garmentKey: 'gar-3',
    agreedConsignorPrice: 4500,
    agreedSalePrice: 15000,
    appliedCommission: 70,
    agreedAt: new Date('2026-04-17'),
    saleDeadline: new Date('2026-07-17'),
  },
  {
    garmentKey: 'gar-5',
    agreedConsignorPrice: 4500,
    agreedSalePrice: 15000,
    appliedCommission: 70,
    agreedAt: new Date('2026-06-21'),
    saleDeadline: new Date('2026-09-21'),
  },
  {
    garmentKey: 'gar-7',
    agreedConsignorPrice: 6000,
    agreedSalePrice: 20000,
    appliedCommission: 70,
    agreedAt: new Date('2026-04-10'),
    saleDeadline: new Date('2026-07-10'),
  },
  {
    garmentKey: 'gar-8',
    agreedConsignorPrice: 3500,
    agreedSalePrice: 12000,
    appliedCommission: 70,
    agreedAt: new Date('2026-04-22'),
    saleDeadline: new Date('2026-07-22'),
  },
  {
    garmentKey: 'gar-9',
    agreedConsignorPrice: 5000,
    agreedSalePrice: 16000,
    appliedCommission: 70,
    agreedAt: new Date('2026-05-20'),
    saleDeadline: new Date('2026-08-20'),
  },
];

export const SEED_SALES: SeedSale[] = [
  {
    garmentKey: 'gar-3',
    actualSalePrice: 15000,
    soldAt: new Date('2026-06-28'),
    consignorAmount: 4500,
    merchantCommission: 10500,
  },
  {
    garmentKey: 'gar-7',
    actualSalePrice: 20000,
    soldAt: new Date('2026-05-10'),
    consignorAmount: 6000,
    merchantCommission: 14000,
    paidAt: new Date('2026-06-18'),
    paymentMethod: 'transfer',
    receiptNumber: 'TR-0518',
  },
  {
    garmentKey: 'gar-8',
    actualSalePrice: 12000,
    soldAt: new Date('2026-05-22'),
    consignorAmount: 3500,
    merchantCommission: 8500,
  },
  {
    garmentKey: 'gar-9',
    actualSalePrice: 16000,
    soldAt: new Date('2026-06-12'),
    consignorAmount: 5000,
    merchantCommission: 11000,
  },
];

export const SEED_NOTIFICATIONS: SeedNotification[] = [
  {
    userKey: 'con-ana',
    garmentKey: 'gar-1',
    base: '/c',
    type: 'proposal',
    text: 'Tu propuesta de "Vestido de fiesta" está en revisión.',
    date: new Date('2026-06-20'),
  },
  {
    userKey: 'con-luis',
    garmentKey: 'gar-3',
    base: '/c',
    type: 'sale',
    text: '¡Vendimos tus "Zapatillas urbanas"!',
    date: new Date('2026-06-05'),
  },
  {
    userKey: 'mer-trama',
    garmentKey: 'gar-1',
    base: '/m',
    type: 'proposal',
    text: 'Nueva propuesta de Ana Gómez para revisar.',
    date: new Date('2026-06-20'),
  },
];
