import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { SeedService } from './../src/seed/seed.service';

interface ExpiringItem {
  garmentId: string;
  name: string;
  consignorName: string;
  daysLeft: number;
  overdue: boolean;
  saleDeadline: string;
  effectiveDeadline: string;
}

describe('Reports (e2e)', () => {
  let app: INestApplication<App>;
  let mongo: MongoMemoryServer;
  let consignorToken: string;
  let merchantToken: string;

  const login = (email: string) =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'trama1234' });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongo.getUri();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    await app.get(SeedService).seedAll();

    consignorToken = (await login('ana@example.com')).body.token;
    merchantToken = (await login('contacto@tramaboutique.com')).body.token;
  }, 120000);

  afterAll(async () => {
    await app.close();
    await mongo.stop();
  });

  it('lists in-stock consignments whose deadline falls within the window', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/reports/expiring?withinDays=3650')
      .set(auth(merchantToken))
      .expect(200);

    const items = res.body as ExpiringItem[];
    // The only seeded in-stock garment with an agreement is "Campera de jean" (gar-2).
    expect(items).toHaveLength(1);
    const item = items[0];
    expect(item.name).toBe('Campera de jean');
    expect(item.consignorName).toBe('Ana Gómez');
    expect(item.saleDeadline).toEqual(expect.any(String));
    expect(item.effectiveDeadline).toEqual(expect.any(String));
    expect(typeof item.daysLeft).toBe('number');
    expect(typeof item.overdue).toBe('boolean');
    // The effective deadline is the sale deadline plus the merchant grace period.
    expect(new Date(item.effectiveDeadline).getTime()).toBeGreaterThan(
      new Date(item.saleDeadline).getTime(),
    );
  });

  it('excludes consignments outside the window', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/reports/expiring?withinDays=1')
      .set(auth(merchantToken))
      .expect(200);
    // The seeded in-stock garment expires well beyond one day from now.
    expect(res.body).toHaveLength(0);
  });

  it('forbids a consignor from the merchant report', () => {
    return request(app.getHttpServer())
      .get('/api/reports/expiring')
      .set(auth(consignorToken))
      .expect(403);
  });

  it('aggregates sales and stock by category, ranked by profit', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/reports/by-category')
      .set(auth(merchantToken))
      .expect(200);

    const rows = res.body as {
      category: string;
      soldCount: number;
      soldRevenue: number;
      merchantProfit: number;
      inStockCount: number;
      conversion: number | null;
      avgDaysToSale: number | null;
    }[];

    // Seed: 4 sales across Accesorios/Pantalones/Calzado/Camperas y abrigos + 1 in-stock (Camperas).
    expect(rows).toHaveLength(4);
    expect(rows[0].category).toBe('Accesorios');
    expect(rows[0].merchantProfit).toBe(14000);
    expect(rows[0].soldRevenue).toBe(20000);
    expect(rows[0].soldCount).toBe(1);
    // Accesorios: 1 received (gar-7), 1 sold → 100%; sold 32 days after created (2026-04-08 → 2026-05-10).
    expect(rows[0].conversion).toBe(100);
    expect(rows[0].avgDaysToSale).toBe(32);

    // Ranked by profit descending.
    const profits = rows.map((r) => r.merchantProfit);
    expect(profits).toEqual([...profits].sort((a, b) => b - a));

    const camperas = rows.find((r) => r.category === 'Camperas y abrigos');
    expect(camperas?.inStockCount).toBe(1);
    // Camperas: 2 received (gar-2 in stock, gar-8 sold), 1 sold → 50%; gar-8 sold 32 days after created.
    expect(camperas?.conversion).toBe(50);
    expect(camperas?.avgDaysToSale).toBe(32);
  });

  it('forbids a consignor from the by-category report', () => {
    return request(app.getHttpServer())
      .get('/api/reports/by-category')
      .set(auth(consignorToken))
      .expect(403);
  });

  it('reports per-consignor acceptance and payout metrics', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/reports/consignors')
      .set(auth(merchantToken))
      .expect(200);

    const rows = res.body as {
      name: string;
      acceptanceRate: number | null;
      inStockCount: number;
      liquidatedAmount: number;
      pendingAmount: number;
      merchantProfit: number;
      avgPayoutDays: number | null;
    }[];

    expect(rows).toHaveLength(2);

    const ana = rows.find((r) => r.name === 'Ana Gómez')!;
    expect(ana.acceptanceRate).toBe(100);
    expect(ana.inStockCount).toBe(1);
    expect(ana.liquidatedAmount).toBe(6000);
    expect(ana.pendingAmount).toBe(5000);
    expect(ana.merchantProfit).toBe(25000); // gar-7 (14000) + gar-9 (11000)
    expect(ana.avgPayoutDays).toBe(39); // gar-7: soldAt 2026-05-10 → paidAt 2026-06-18

    const luis = rows.find((r) => r.name === 'Luis Ríos')!;
    expect(luis.pendingAmount).toBe(8000);
    expect(luis.merchantProfit).toBe(19000); // gar-3 (10500) + gar-8 (8500)
    expect(luis.avgPayoutDays).toBeNull(); // no paid sales yet
  });

  it('forbids a consignor from the consignors report', () => {
    return request(app.getHttpServer())
      .get('/api/reports/consignors')
      .set(auth(consignorToken))
      .expect(403);
  });

  it('aggregates sales by point of sale, ranked by profit', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/reports/by-point')
      .set(auth(merchantToken))
      .expect(200);

    const rows = res.body as {
      name: string;
      soldCount: number;
      revenue: number;
      merchantProfit: number;
    }[];

    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('Trama Nueva Córdoba'); // gar-7 + gar-9
    expect(rows[0].merchantProfit).toBe(25000);
    expect(rows[0].soldCount).toBe(2);
    const cerro = rows.find((r) => r.name === 'Trama Cerro'); // gar-3 + gar-8
    expect(cerro?.merchantProfit).toBe(19000);
  });

  it('forbids a consignor from the by-point report', () => {
    return request(app.getHttpServer())
      .get('/api/reports/by-point')
      .set(auth(consignorToken))
      .expect(403);
  });

  it('reports stock aging buckets and average days to sale', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/reports/rotation')
      .set(auth(merchantToken))
      .expect(200);

    const aging = res.body.stockAging as { bucket: string; count: number }[];
    expect(aging).toHaveLength(7);
    // Only one seeded garment is in stock (Campera de jean / gar-2).
    expect(aging.reduce((sum, b) => sum + b.count, 0)).toBe(1);
    // 4 seeded sales with fixed dates → (74+32+32+25)/4 = 40.75 ≈ 41 (date-stable).
    expect(res.body.avgDaysToSale).toBe(41);
  });

  it('forbids a consignor from the rotation report', () => {
    return request(app.getHttpServer())
      .get('/api/reports/rotation')
      .set(auth(consignorToken))
      .expect(403);
  });
});
