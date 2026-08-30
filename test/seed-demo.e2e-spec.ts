import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import {
  DEMO_CONSIGNORS,
  DEMO_MERCHANT_EMAIL,
  DEMO_SALES_POINTS,
} from '../src/seed/demo-data';
import { SeedService } from './../src/seed/seed.service';

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

  it('produces ~100 garments covering every GarmentStatus, each with 2+ photos', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/garments')
      .set(auth(merchantToken))
      .expect(200);
    const garments = res.body as GarmentBody[];

    expect(garments.length).toBeGreaterThanOrEqual(90);
    expect(garments.length).toBeLessThanOrEqual(110);

    const statusesPresent = new Set(garments.map((g) => g.status));
    for (const status of ALL_STATUSES) {
      expect(statusesPresent.has(status)).toBe(true);
    }

    for (const garment of garments) {
      expect(garment.photos.length).toBeGreaterThanOrEqual(2);
      for (const photo of garment.photos) {
        expect(photo).toMatch(/^https:\/\/images\.unsplash\.com\//);
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
    expect(
      expiring.body.some((item: { overdue: boolean }) => item.overdue),
    ).toBe(true);

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
