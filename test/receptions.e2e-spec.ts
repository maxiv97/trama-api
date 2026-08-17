import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { SeedService } from './../src/seed/seed.service';

describe('Receptions (e2e)', () => {
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

  const agreedGarment = async (): Promise<string> => {
    const garmentId = await createGarment();
    await request(app.getHttpServer())
      .post('/api/proposals')
      .set('Authorization', `Bearer ${consignorToken}`)
      .send({ garmentId, requestedConsignorPrice: 7000 });
    await request(app.getHttpServer())
      .post(`/api/proposals/${garmentId}/accept`)
      .set('Authorization', `Bearer ${merchantToken}`);
    return garmentId;
  };

  const registerReception = (garmentId: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/api/receptions')
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({ garmentId, salesPointId: 'sp-nc', discrepancies: [], evidence: [], ...body });

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

  it('registers an accepted reception and moves the garment to in_stock', async () => {
    const garmentId = await agreedGarment();
    const res = await registerReception(garmentId, { result: 'accepted' }).expect(201);
    expect(res.body.receiptNumber).toMatch(/^REC-/);
    expect(res.body.handledBy).toBe('María López');

    expect(await garmentStatus(garmentId)).toBe('in_stock');

    await request(app.getHttpServer())
      .get(`/api/garments/${garmentId}/reception`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .expect(200);
  });

  it('registers a reception with remarks', async () => {
    const garmentId = await agreedGarment();
    await registerReception(garmentId, {
      result: 'with_remarks',
      discrepancies: ['condition'],
      detail: 'Pequeña mancha',
    }).expect(201);
    expect(await garmentStatus(garmentId)).toBe('with_remarks');
  });

  it('rejects a reception', async () => {
    const garmentId = await agreedGarment();
    await registerReception(garmentId, {
      result: 'rejected',
      discrepancies: ['damage'],
      detail: 'Rotura no declarada',
    }).expect(201);
    expect(await garmentStatus(garmentId)).toBe('rejected');
  });

  it('409s a reception on a garment that is not agreed', async () => {
    const garmentId = await createGarment();
    await registerReception(garmentId, { result: 'accepted' }).expect(409);
  });

  it('forbids a consignor from registering a reception', async () => {
    const garmentId = await agreedGarment();
    await request(app.getHttpServer())
      .post('/api/receptions')
      .set('Authorization', `Bearer ${consignorToken}`)
      .send({ garmentId, salesPointId: 'sp-nc', result: 'accepted', discrepancies: [], evidence: [] })
      .expect(403);
  });
});
