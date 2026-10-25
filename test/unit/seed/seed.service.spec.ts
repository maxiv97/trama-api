import { buildWorld, World } from '../../helpers/world';
import {
  DEMO_CONSIGNORS,
  DEMO_MERCHANT_EMAIL,
  DEMO_SALES_POINTS,
} from '../../../src/seed/demo-data';

describe('SeedService (base simulada)', () => {
  let w: World;

  beforeAll(async () => {
    w = buildWorld();
    await w.seed.seedAll();
  });

  it('carga el lote base: comercio, cedentes, prendas con código y sus acuerdos', async () => {
    const merchant = await w.users.findByEmailWithPassword(
      'contacto@tramaboutique.com',
    );
    expect(merchant).not.toBeNull();
    const garments = w.models.garment.docs();
    expect(garments).toHaveLength(9);
    expect(
      garments.every((g) => /^TRA-\d{5}$/.test(g.get('code') as string)),
    ).toBe(true);
    expect(w.models.agreement.docs().length).toBeGreaterThan(0);
    expect(w.models.category.docs().length).toBeGreaterThanOrEqual(15);
  });

  it('carga el lote de demostración sin tocar el lote base y es idempotente', async () => {
    await w.seed.seedDemoMerchant();
    await w.seed.seedDemoMerchant();
    const demo = await w.users.findByEmailWithPassword(DEMO_MERCHANT_EMAIL);
    const merchant = await w.users.findMerchantById(String(demo?._id));
    expect(merchant?.salesPoints).toHaveLength(DEMO_SALES_POINTS.length);
    expect(
      w.models.consignor
        .docs()
        .filter((c) => (c.get('email') as string).endsWith('.demo@trama.app')),
    ).toHaveLength(DEMO_CONSIGNORS.length);
    const demoGarments = w.models.garment
      .docs()
      .filter((g) => g.get('merchantId') === String(demo?._id));
    expect(demoGarments.length).toBeGreaterThan(100);
    expect(w.models.return.docs().length).toBeGreaterThan(0);
    const base = w.models.garment
      .docs()
      .filter((g) => g.get('merchantId') === String(merchant?._id) && false);
    expect(base).toHaveLength(0);
  });
});
