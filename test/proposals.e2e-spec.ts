import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { SeedService } from './../src/seed/seed.service';

describe('Proposals (e2e)', () => {
  let app: INestApplication<App>;
  let mongo: MongoMemoryServer;
  let consignorToken: string;
  let merchantToken: string;
  let merchantId: string;

  const login = (email: string) =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'trama1234' });

  const createGarment = async (): Promise<string> => {
    const res = await request(app.getHttpServer())
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
    return res.body.id;
  };

  const submitProposal = (garmentId: string, price = 7000) =>
    request(app.getHttpServer())
      .post('/api/proposals')
      .set('Authorization', `Bearer ${consignorToken}`)
      .send({ garmentId, requestedConsignorPrice: price });

  const garmentWithProposal = async (price = 7000): Promise<string> => {
    const garmentId = await createGarment();
    await submitProposal(garmentId, price);
    return garmentId;
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

  it('submits a proposal with a server-computed sale price', async () => {
    const garmentId = await createGarment();
    const res = await submitProposal(garmentId, 7000).expect(201);
    expect(res.body.status).toBe('under_review');
    expect(res.body.calculatedSalePrice).toBe(23333);

    await request(app.getHttpServer())
      .get(`/api/garments/${garmentId}/proposal`)
      .set('Authorization', `Bearer ${consignorToken}`)
      .expect(200);

    const pending = await request(app.getHttpServer())
      .get('/api/proposals')
      .set('Authorization', `Bearer ${merchantToken}`)
      .expect(200);
    expect(pending.body.some((p: { garmentId: string }) => p.garmentId === garmentId)).toBe(true);
  });

  it('accepts a proposal and freezes an agreement', async () => {
    const garmentId = await garmentWithProposal(7000);
    await request(app.getHttpServer())
      .post(`/api/proposals/${garmentId}/accept`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .expect(201);

    const garment = await request(app.getHttpServer())
      .get(`/api/garments/${garmentId}`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .expect(200);
    expect(garment.body.status).toBe('agreed');

    const agreement = await request(app.getHttpServer())
      .get(`/api/garments/${garmentId}/agreement`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .expect(200);
    expect(agreement.body).toMatchObject({
      agreedConsignorPrice: 7000,
      agreedSalePrice: 23333,
      appliedCommission: 70,
    });
    expect(agreement.body.saleDeadline).toEqual(expect.any(String));
  });

  it('counteroffers and lets the consignor accept it', async () => {
    const garmentId = await garmentWithProposal(7000);

    const counter = await request(app.getHttpServer())
      .post(`/api/proposals/${garmentId}/counteroffer`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({ consignorPrice: 8000 })
      .expect(201);
    expect(counter.body.status).toBe('counteroffer');
    expect(counter.body.counteroffer.salePrice).toBe(26667);

    await request(app.getHttpServer())
      .post(`/api/proposals/${garmentId}/accept-counteroffer`)
      .set('Authorization', `Bearer ${consignorToken}`)
      .expect(201);

    const agreement = await request(app.getHttpServer())
      .get(`/api/garments/${garmentId}/agreement`)
      .set('Authorization', `Bearer ${consignorToken}`)
      .expect(200);
    expect(agreement.body).toMatchObject({ agreedConsignorPrice: 8000, agreedSalePrice: 26667 });
  });

  it('rejects a proposal', async () => {
    const garmentId = await garmentWithProposal(7000);
    const res = await request(app.getHttpServer())
      .post(`/api/proposals/${garmentId}/reject`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .expect(201);
    expect(res.body.status).toBe('no_agreement');
  });

  it('enforces role and state guards', async () => {
    const garmentId = await garmentWithProposal(7000);

    await request(app.getHttpServer())
      .post('/api/proposals')
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({ garmentId, requestedConsignorPrice: 1000 })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/api/proposals/${garmentId}/accept`)
      .set('Authorization', `Bearer ${consignorToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .post(`/api/proposals/${garmentId}/accept`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/proposals/${garmentId}/accept`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .expect(409);
  });
});
