import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { SeedService } from './../src/seed/seed.service';

describe('Payouts (e2e)', () => {
  let app: INestApplication<App>;
  let mongo: MongoMemoryServer;
  let consignorToken: string;
  let merchantToken: string;
  let merchantId: string;

  const login = (email: string) =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'trama1234' });

  const soldGarment = async (): Promise<string> => {
    const created = await request(app.getHttpServer())
      .post('/api/garments')
      .set('Authorization', `Bearer ${consignorToken}`)
      .send({
        name: 'Campera de jean',
        category: 'Camperas y abrigos',
        brand: 'Levis',
        size: 'M',
        color: 'Azul',
        season: 'Invierno',
        condition: 'very_good',
        description: 'Poco uso',
        photos: ['data:image/png;base64,AAAA'],
        merchantId,
      });
    const garmentId = created.body.id;
    await request(app.getHttpServer())
      .post('/api/proposals')
      .set('Authorization', `Bearer ${consignorToken}`)
      .send({ garmentId, requestedConsignorPrice: 7000 });
    await request(app.getHttpServer())
      .post(`/api/proposals/${garmentId}/accept`)
      .set('Authorization', `Bearer ${merchantToken}`);
    await request(app.getHttpServer())
      .post('/api/receptions')
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({ garmentId, salesPointId: 'sp-nc', result: 'accepted', discrepancies: [], evidence: [] });
    await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({ garmentId, actualSalePrice: 23333, soldAt: '2026-07-15' });
    return garmentId;
  };

  const garmentStatus = async (garmentId: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .get(`/api/garments/${garmentId}`)
      .set('Authorization', `Bearer ${merchantToken}`);
    return res.body.status;
  };

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

    await app.get(SeedService).seedUsers();

    consignorToken = (await login('ana@example.com')).body.token;
    const merchant = await login('contacto@tramaboutique.com');
    merchantToken = merchant.body.token;
    merchantId = merchant.body.user.id;
  }, 120000);

  afterAll(async () => {
    await app.close();
    await mongo.stop();
  });

  it('builds the monthly payout from a sale (merchant perspective)', async () => {
    await soldGarment();
    const res = await request(app.getHttpServer())
      .get('/api/payouts/monthly')
      .set('Authorization', `Bearer ${merchantToken}`)
      .expect(200);

    const group = res.body.find((g: { month: string }) => g.month === '2026-07');
    expect(group).toBeDefined();
    expect(group.counterpartName).toBe('Ana Gómez');
    expect(group.counterpartDni).toBe('32.111.222');
    expect(group.totalAmount).toBe(7000);
    expect(group.status).toBe('pending');
  });

  it('exposes the flat payout list for the panels', async () => {
    await soldGarment();
    const res = await request(app.getHttpServer())
      .get('/api/payouts')
      .set('Authorization', `Bearer ${merchantToken}`)
      .expect(200);
    expect(res.body.some((p: { totalAmount: number }) => p.totalAmount > 0)).toBe(true);
  });

  it('shows the merchant business name in the consignor perspective', async () => {
    await soldGarment();
    const res = await request(app.getHttpServer())
      .get('/api/payouts/monthly')
      .set('Authorization', `Bearer ${consignorToken}`)
      .expect(200);
    expect(res.body.some((g: { counterpartName: string }) => g.counterpartName === 'Trama Boutique')).toBe(true);
  });

  it('settles a payout and marks the sale paid', async () => {
    const garmentId = await soldGarment();
    await request(app.getHttpServer())
      .post('/api/payouts/settle')
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({ garmentIds: [garmentId], paymentMethod: 'transfer', receiptNumber: 'R-1' })
      .expect(201);

    expect(await garmentStatus(garmentId)).toBe('paid_out');

    const sale = await request(app.getHttpServer())
      .get(`/api/garments/${garmentId}/sale`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .expect(200);
    expect(sale.body.paidAt).toEqual(expect.any(String));
    expect(sale.body.paymentMethod).toBe('transfer');
  });

  it('forbids a consignor from settling', async () => {
    const garmentId = await soldGarment();
    await request(app.getHttpServer())
      .post('/api/payouts/settle')
      .set('Authorization', `Bearer ${consignorToken}`)
      .send({ garmentIds: [garmentId], paymentMethod: 'cash' })
      .expect(403);
  });
});
