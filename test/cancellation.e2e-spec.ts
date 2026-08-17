import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { SeedService } from './../src/seed/seed.service';

describe('Garment cancellation (e2e)', () => {
  let app: INestApplication<App>;
  let mongo: MongoMemoryServer;
  let consignorToken: string;
  let merchantToken: string;
  let merchantId: string;

  const login = (email: string) =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'trama1234' });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const createGarment = async (): Promise<string> => {
    const created = await request(app.getHttpServer())
      .post('/api/garments')
      .set(auth(consignorToken))
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
      .set(auth(consignorToken))
      .send({ garmentId, requestedConsignorPrice: 7000 });
    return garmentId;
  };

  const inStockGarment = async (): Promise<string> => {
    const garmentId = await createGarment();
    await request(app.getHttpServer())
      .post(`/api/proposals/${garmentId}/accept`)
      .set(auth(merchantToken));
    await request(app.getHttpServer())
      .post('/api/receptions')
      .set(auth(merchantToken))
      .send({ garmentId, salesPointId: 'sp-nc', result: 'accepted', discrepancies: [], evidence: [] });
    return garmentId;
  };

  const status = async (garmentId: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .get(`/api/garments/${garmentId}`)
      .set(auth(merchantToken));
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

  it('cancels a garment under review and drops it from the merchant pending list', async () => {
    const garmentId = await createGarment();

    const beforePending = await request(app.getHttpServer())
      .get('/api/proposals')
      .set(auth(merchantToken))
      .expect(200);
    expect(beforePending.body.some((p: { garmentId: string }) => p.garmentId === garmentId)).toBe(true);

    await request(app.getHttpServer())
      .post(`/api/garments/${garmentId}/actions`)
      .set(auth(consignorToken))
      .send({ action: 'CANCEL' })
      .expect(201);

    expect(await status(garmentId)).toBe('cancelled');

    const afterPending = await request(app.getHttpServer())
      .get('/api/proposals')
      .set(auth(merchantToken))
      .expect(200);
    expect(afterPending.body.some((p: { garmentId: string }) => p.garmentId === garmentId)).toBe(false);
  });

  it('notifies the merchant that the consignor cancelled', async () => {
    const garmentId = await createGarment();
    await request(app.getHttpServer())
      .post(`/api/garments/${garmentId}/actions`)
      .set(auth(consignorToken))
      .send({ action: 'CANCEL' })
      .expect(201);

    const notifications = await request(app.getHttpServer())
      .get('/api/notifications')
      .set(auth(merchantToken))
      .expect(200);
    expect(
      notifications.body.some((n: { text: string }) => n.text.includes('canceló')),
    ).toBe(true);
  });

  it('forbids a merchant from cancelling', async () => {
    const garmentId = await createGarment();
    await request(app.getHttpServer())
      .post(`/api/garments/${garmentId}/actions`)
      .set(auth(merchantToken))
      .send({ action: 'CANCEL' })
      .expect(403);
  });

  it('rejects cancelling a garment already in stock', async () => {
    const garmentId = await inStockGarment();
    expect(await status(garmentId)).toBe('in_stock');
    await request(app.getHttpServer())
      .post(`/api/garments/${garmentId}/actions`)
      .set(auth(consignorToken))
      .send({ action: 'CANCEL' })
      .expect(409);
  });
});
