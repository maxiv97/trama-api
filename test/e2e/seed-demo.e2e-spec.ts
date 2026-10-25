import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { DeadlinesService } from '../../src/deadlines/deadlines.service';
import {
  DEMO_CONSIGNORS,
  DEMO_DEADLINES_CONSIGNOR_KEY,
  DEMO_MERCHANT_EMAIL,
  DEMO_SALES_POINTS,
} from '../../src/seed/demo-data';
import { SeedService } from '../../src/seed/seed.service';

interface GarmentBody {
  id: string;
  status: string;
  photos: string[];
  salesPointId: string;
}

const ALL_STATUSES = [
  'submitted',
  'under_review',
  'counteroffer',
  'agreed',
  'in_stock',
  'with_remarks',
  'rejected',
  'sold',
  'paid_out',
  'no_agreement',
  'cancelled',
  'delivery_expired',
  'awaiting_pickup',
  'returned',
  'unclaimed',
];

describe('Demo merchant seed (e2e)', () => {
  let app: INestApplication<App>;
  let mongo: MongoMemoryServer;
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
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    // Seed the small default dataset first, to prove the demo seed leaves it untouched.
    await app.get(SeedService).seedAll();
    // Run twice: proves seedDemoMerchant() is idempotent (no duplicate piling up).
    await app.get(SeedService).seedDemoMerchant();
    await app.get(SeedService).seedDemoMerchant();

    const merchant = await login(DEMO_MERCHANT_EMAIL);
    merchantToken = merchant.body.token;
  }, 180000);

  afterAll(async () => {
    await app.close();
    await mongo.stop();
  });

  it('creates every demo consignor and sales point exactly once', async () => {
    const merchantId = (await login(DEMO_MERCHANT_EMAIL)).body.user
      .id as string;

    const res = await request(app.getHttpServer())
      .get(`/api/sales-points?merchantId=${merchantId}`)
      .set(auth(merchantToken))
      .expect(200);
    expect(res.body).toHaveLength(DEMO_SALES_POINTS.length);

    const consignors = await request(app.getHttpServer())
      .get(`/api/consignors?merchantId=${merchantId}`)
      .set(auth(merchantToken))
      .expect(200);
    expect(consignors.body).toHaveLength(DEMO_CONSIGNORS.length);
  });

  it('produces ~110 garments covering every GarmentStatus, with photos', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/garments')
      .set(auth(merchantToken))
      .expect(200);
    const garments = res.body as GarmentBody[];

    expect(garments.length).toBeGreaterThanOrEqual(90);
    expect(garments.length).toBeLessThanOrEqual(125);

    const statusesPresent = new Set(garments.map((g) => g.status));
    for (const status of ALL_STATUSES) {
      expect(statusesPresent.has(status)).toBe(true);
    }

    // El listado devuelve solo la miniatura (primera foto) por performance.
    for (const garment of garments) {
      expect(garment.photos).toHaveLength(1);
      expect(garment.photos[0]).toMatch(/^https:\/\/images\.unsplash\.com\//);
    }

    // El detalle sí trae todas las fotos: el seed crea 2+ por prenda.
    const detail = await request(app.getHttpServer())
      .get(`/api/garments/${garments[0].id}`)
      .set(auth(merchantToken))
      .expect(200);
    const detailBody = detail.body as GarmentBody;
    expect(detailBody.photos.length).toBeGreaterThanOrEqual(2);
    for (const photo of detailBody.photos) {
      expect(photo).toMatch(/^https:\/\/images\.unsplash\.com\//);
    }
  });

  const deadlinesState = async () => {
    const garments = (
      await request(app.getHttpServer())
        .get('/api/garments?lite=1')
        .set(auth(merchantToken))
        .expect(200)
    ).body as GarmentBody[];
    const agreements = (
      await request(app.getHttpServer())
        .get('/api/agreements')
        .set(auth(merchantToken))
        .expect(200)
    ).body as {
      garmentId: string;
      saleDeadline: string;
      deliveryDeadline: string;
      pickupDeadline?: string;
    }[];
    const byGarment = new Map(agreements.map((a) => [a.garmentId, a]));
    return { garments, byGarment };
  };
  const time = (value?: string) => (value ? new Date(value).getTime() : NaN);

  // El seed deja el recorrido de plazos como estaría antes de la tarea de las 3:00: dos entregas,
  // dos ventas y un retiro vencidos ayer, sin procesar. El resto del lote ya está al día.
  it('leaves only the deadline walkthrough pending for the daily job', async () => {
    const { garments, byGarment } = await deadlinesState();
    const now = Date.now();
    const overdue = { delivery: 0, sale: 0, pickup: 0 };
    for (const garment of garments) {
      const agreement = byGarment.get(garment.id);
      if (
        (garment.status === 'agreed' || garment.status === 'rejected') &&
        time(agreement?.deliveryDeadline) <= now
      )
        overdue.delivery += 1;
      if (
        (garment.status === 'in_stock' || garment.status === 'with_remarks') &&
        time(agreement?.saleDeadline) <= now
      )
        overdue.sale += 1;
      if (
        garment.status === 'awaiting_pickup' &&
        time(agreement?.pickupDeadline) <= now
      )
        overdue.pickup += 1;
    }
    expect(overdue).toEqual({ delivery: 2, sale: 2, pickup: 1 });
  });

  it('processes the walkthrough with the daily job, once, with grouped notices', async () => {
    const deadlines = app.get(DeadlinesService);
    const first = await deadlines.run();
    expect(first).toMatchObject({
      deliveryExpired: 2,
      saleExpired: 2,
      unclaimed: 1,
    });
    // Vencimientos (cedente y comercio) y los tres recordatorios del recorrido, como mínimo.
    expect(first.notifications).toBeGreaterThanOrEqual(9);

    const again = await deadlines.run();
    expect(again).toEqual({
      deliveryExpired: 0,
      saleExpired: 0,
      unclaimed: 0,
      notifications: 0,
    });

    const consignor = DEMO_CONSIGNORS.find(
      (c) => c.key === DEMO_DEADLINES_CONSIGNOR_KEY,
    )!;
    const token = (await login(consignor.email)).body.token as string;
    const texts = (
      (
        await request(app.getHttpServer())
          .get('/api/notifications')
          .set(auth(token))
          .expect(200)
      ).body as { text: string }[]
    ).map((n) => n.text);
    expect(texts.some((t) => t.startsWith('2 prendas no se vendieron.'))).toBe(
      true,
    );
    expect(
      texts.some((t) =>
        t.startsWith('Venció el plazo para entregar 2 prendas'),
      ),
    ).toBe(true);
    expect(texts.some((t) => t.startsWith('Recordá entregar'))).toBe(true);
    expect(
      texts.some((t) => t.startsWith('Te quedan pocos días para retirar')),
    ).toBe(true);
  });

  it('keeps every deadline coherent with the garment status once the job ran', async () => {
    const { garments, byGarment } = await deadlinesState();
    const now = Date.now();
    for (const garment of garments) {
      const agreement = byGarment.get(garment.id);
      if (garment.status === 'agreed' || garment.status === 'rejected') {
        expect(time(agreement?.deliveryDeadline)).toBeGreaterThan(now);
      }
      if (garment.status === 'in_stock' || garment.status === 'with_remarks') {
        expect(time(agreement?.saleDeadline)).toBeGreaterThan(now);
      }
      if (garment.status === 'awaiting_pickup') {
        expect(time(agreement?.saleDeadline)).toBeLessThanOrEqual(now);
        expect(time(agreement?.pickupDeadline)).toBeGreaterThan(now);
      }
      if (garment.status === 'unclaimed') {
        expect(time(agreement?.pickupDeadline)).toBeLessThanOrEqual(now);
      }
    }
  });

  it('did not touch the unrelated default-seed merchant', async () => {
    const original = await login('contacto@tramaboutique.com');
    const res = await request(app.getHttpServer())
      .get('/api/garments')
      .set(auth(original.body.token))
      .expect(200);
    expect(res.body).toHaveLength(9); // exactly what seedAll() creates for Trama Boutique
  });

  it('populates reports with real numbers', async () => {
    const rotation = await request(app.getHttpServer())
      .get('/api/reports/rotation')
      .set(auth(merchantToken))
      .expect(200);
    expect(
      rotation.body.stockAging.some((b: { count: number }) => b.count > 0),
    ).toBe(true);
    expect(rotation.body.staleCount).toBeGreaterThan(0);
    expect(rotation.body.avgDaysToSale).toEqual(expect.any(Number));

    const byCategory = await request(app.getHttpServer())
      .get('/api/reports/by-category')
      .set(auth(merchantToken))
      .expect(200);
    expect(byCategory.body.length).toBe(7);

    const byPoint = await request(app.getHttpServer())
      .get('/api/reports/by-point')
      .set(auth(merchantToken))
      .expect(200);
    expect(byPoint.body.length).toBe(DEMO_SALES_POINTS.length);

    const discrepancies = await request(app.getHttpServer())
      .get('/api/reports/discrepancies')
      .set(auth(merchantToken))
      .expect(200);
    expect(discrepancies.body.totalReceptions).toBeGreaterThan(0);
    expect(discrepancies.body.withDiscrepancies).toBeGreaterThan(0);

    const expiring = await request(app.getHttpServer())
      .get('/api/reports/expiring?withinDays=365')
      .set(auth(merchantToken))
      .expect(200);
    expect(expiring.body.length).toBeGreaterThan(0);
    // Con la tarea de plazos ya ejecutada (test anterior), una prenda con la venta vencida deja de
    // estar en stock (pasa a Por retirar): no quedan prendas en stock fuera de plazo.
    expect(
      expiring.body.some((item: { overdue: boolean }) => item.overdue),
    ).toBe(false);

    const payouts = await request(app.getHttpServer())
      .get('/api/payouts/monthly')
      .set(auth(merchantToken))
      .expect(200);
    expect(
      payouts.body.some((group: { status: string }) => group.status === 'paid'),
    ).toBe(true);
    expect(
      payouts.body.some(
        (group: { status: string }) => group.status === 'overdue',
      ),
    ).toBe(true);
  });
});
