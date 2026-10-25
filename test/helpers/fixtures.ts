/**
 * Datos y recorridos de prueba sobre los servicios reales (ver world.ts): registrar un comercio y un
 * cedente, cargar una prenda y llevarla por el ciclo de consignación.
 */
import type { SessionUser } from '../../src/auth/session-user';
import type { GarmentDocument } from '../../src/garments/schemas/garment.schema';
import type { ReceptionResult } from '../../src/shared/domain/enums';
import type { CreateMerchantInput } from '../../src/users/users.service';
import type { World } from './world';

export const LOCATION = {
  street: 'Obispo Trejo',
  number: '100',
  neighborhood: 'Nueva Córdoba',
  city: 'Córdoba',
  lat: -31.42,
  lng: -64.18,
};

let seq = 0;
const unique = () => `${Date.now().toString(36)}${(seq += 1)}`;

export interface Party {
  id: string;
  session: SessionUser;
  email: string;
}

export interface MerchantParty extends Party {
  salesPointId: string;
}

export async function newMerchant(
  w: World,
  terms: Partial<CreateMerchantInput['terms']> = {},
): Promise<MerchantParty> {
  const email = `comercio-${unique()}@test.com`;
  await w.categories.seedBase();
  const merchant = await w.users.createMerchant({
    name: 'Laura Comercio',
    email,
    phone: '351-1111111',
    password: 'secreto123',
    businessName: 'Percha Test',
    cuit: '30-11111111-1',
    location: LOCATION,
    commissionConfig: { consignorPercentage: 60, merchantPercentage: 40 },
    terms: { saleWindowMonths: 3, payoutDay: 10, ...terms },
    salesPoint: {
      name: 'Local Centro',
      address: 'Obispo Trejo 100',
      phone: '351-2222222',
      geo: { lat: -31.42, lng: -64.18 },
      receptionSchedule: {
        days: 'Lun a Vie',
        hours: '10 a 18',
        instructions: 'Timbre B',
      },
    },
  });
  const salesPointId = String(
    (merchant.salesPoints[0] as unknown as { _id: unknown })._id,
  );
  return {
    id: merchant.id,
    email,
    salesPointId,
    session: { id: merchant.id, name: 'Laura Comercio', role: 'merchant' },
  };
}

export async function newConsignor(w: World, name = 'Ana'): Promise<Party> {
  const email = `cedente-${unique()}@test.com`;
  const consignor = await w.users.createConsignor({
    firstName: name,
    lastName: 'Prueba',
    email,
    phone: '351-3333333',
    password: 'secreto123',
    dni: '30111222',
    bankDetails: 'ana.mp',
    location: LOCATION,
  });
  return {
    id: consignor.id,
    email,
    session: { id: consignor.id, name: `${name} Prueba`, role: 'consignor' },
  };
}

/** Carga una prenda y envía la propuesta (queda En revisión). */
export async function proposed(
  w: World,
  c: Party,
  m: MerchantParty,
  price = 10000,
  name = 'Campera de jean',
): Promise<GarmentDocument> {
  const garment = await w.garments.create(c.id, {
    name,
    category: 'Camperas y abrigos',
    brand: 'Levis',
    size: 'M',
    color: 'Azul',
    season: 'Invierno',
    condition: 'very_good',
    photos: ['data:image/jpeg;base64,AAA', 'data:image/jpeg;base64,BBB'],
    merchantId: m.id,
    salesPointId: m.salesPointId,
  });
  await w.proposals.create(c.id, {
    garmentId: garment.id,
    requestedConsignorPrice: price,
  });
  return garment;
}

export async function agreed(
  w: World,
  c: Party,
  m: MerchantParty,
  price = 10000,
  name?: string,
) {
  const garment = await proposed(w, c, m, price, name);
  await w.proposals.accept(garment.id, m.id);
  return garment;
}

export async function received(
  w: World,
  c: Party,
  m: MerchantParty,
  result: ReceptionResult = 'accepted',
  name?: string,
) {
  const garment = await agreed(w, c, m, 10000, name);
  await w.receptions.create(m.session, {
    garmentId: garment.id,
    salesPointId: m.salesPointId,
    result,
    discrepancies: result === 'accepted' ? [] : ['condition'],
    detail: result === 'accepted' ? undefined : 'Tiene una mancha',
    evidence: [],
  });
  return garment;
}

export async function sold(
  w: World,
  c: Party,
  m: MerchantParty,
  price = 20000,
  name?: string,
) {
  const garment = await received(w, c, m, 'accepted', name);
  await w.sales.create(m.session, {
    garmentId: garment.id,
    actualSalePrice: price,
    soldAt: new Date().toISOString(),
  });
  return garment;
}

/** Espera a que terminen los envíos de correo que los servicios disparan sin esperar. */
export const flush = () => new Promise((resolve) => setImmediate(resolve));
