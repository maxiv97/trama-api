import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { SeedService } from '../../src/seed/seed.service';

describe('Merchants (e2e)', () => {
  let app: INestApplication<App>;
  let mongo: MongoMemoryServer;
  let consignorToken: string;
  let merchantToken: string;
  let merchantId: string;

  const login = (email: string) =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'trama1234' });

  const editableBody = {
    businessName: 'Trama Boutique',
    email: 'contacto@tramaboutique.com',
    phone: '351-3000001',
    location: { neighborhood: 'Nueva Córdoba', city: 'Córdoba', lat: -31.4281, lng: -64.1888 },
    commissionConfig: { consignorPercentage: 35, merchantPercentage: 65 },
    terms: { saleWindowMonths: 4, deliveryDays: 10, pickupDays: 20, payoutDay: 25 },
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

  it('lists every merchant with the full object', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/merchants')
      .set('Authorization', `Bearer ${merchantToken}`)
      .expect(200);
    expect(res.body).toHaveLength(2);
    const names = res.body.map((m: { businessName: string }) => m.businessName);
    expect(names).toEqual(expect.arrayContaining(['Trama Boutique', 'Vintage Córdoba']));
    const trama = res.body.find((m: { businessName: string }) => m.businessName === 'Trama Boutique');
    expect(trama.role).toBe('merchant');
    expect(trama.salesPoints).toHaveLength(2);
    expect(trama.commissionConfig).toBeDefined();
    expect(trama.terms).toBeDefined();
    expect(trama.password).toBeUndefined();
  });

  it('gets a merchant by id and 404s the unknown', async () => {
    await request(app.getHttpServer())
      .get(`/api/merchants/${merchantId}`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/merchants/64b000000000000000000000')
      .set('Authorization', `Bearer ${merchantToken}`)
      .expect(404);
  });

  it('updates the own merchant settings', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/merchants/${merchantId}`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .send(editableBody)
      .expect(200);
    expect(res.body.commissionConfig.consignorPercentage).toBe(35);
    expect(res.body.terms.payoutDay).toBe(25);

    const after = await request(app.getHttpServer())
      .get(`/api/merchants/${merchantId}`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .expect(200);
    expect(after.body.terms.payoutDay).toBe(25);
    expect(after.body.terms.deliveryDays).toBe(10);
    expect(after.body.terms.pickupDays).toBe(20);
    expect(after.body.salesPoints).toHaveLength(2);
  });

  it('rejects an out-of-range configuration (DEF-04)', async () => {
    await request(app.getHttpServer())
      .patch(`/api/merchants/${merchantId}`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({
        ...editableBody,
        commissionConfig: { consignorPercentage: 150, merchantPercentage: -50 },
        terms: { saleWindowMonths: 4, deliveryDays: 10, pickupDays: 20, payoutDay: 35 },
      })
      .expect(400);
  });

  it('rejects delivery and pickup days out of range', async () => {
    for (const terms of [
      { saleWindowMonths: 4, deliveryDays: 0, pickupDays: 20, payoutDay: 10 },
      { saleWindowMonths: 4, deliveryDays: 10, pickupDays: 61, payoutDay: 10 },
    ]) {
      await request(app.getHttpServer())
        .patch(`/api/merchants/${merchantId}`)
        .set('Authorization', `Bearer ${merchantToken}`)
        .send({ ...editableBody, terms })
        .expect(400);
    }
  });

  it('keeps the current delivery and pickup days when the client does not send them', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/merchants/${merchantId}`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({ ...editableBody, terms: { saleWindowMonths: 4, payoutDay: 25 } })
      .expect(200);
    expect(res.body.terms.deliveryDays).toBe(10);
    expect(res.body.terms.pickupDays).toBe(20);
  });

  it('forbids editing another merchant', async () => {
    const vintage = await login('hola@vintagecba.com');
    await request(app.getHttpServer())
      .patch(`/api/merchants/${vintage.body.user.id}`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .send(editableBody)
      .expect(403);
  });

  it('forbids a consignor from updating a merchant', async () => {
    await request(app.getHttpServer())
      .patch(`/api/merchants/${merchantId}`)
      .set('Authorization', `Bearer ${consignorToken}`)
      .send(editableBody)
      .expect(403);
  });
});
