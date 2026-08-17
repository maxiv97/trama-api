import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { SeedService } from './../src/seed/seed.service';

describe('Sales (e2e)', () => {
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

  const inStockGarment = async (): Promise<string> => {
    const garmentId = await agreedGarment();
    await request(app.getHttpServer())
      .post('/api/receptions')
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({ garmentId, salesPointId: 'sp-nc', result: 'accepted', discrepancies: [], evidence: [] });
    return garmentId;
  };

  const registerSale = (garmentId: string, actualSalePrice = 23333) =>
    request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({ garmentId, actualSalePrice, soldAt: '2026-07-01' });

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

  it('registers a sale with the agreement-based split', async () => {
    const garmentId = await inStockGarment();
    const res = await registerSale(garmentId, 23333).expect(201);
    expect(res.body.consignorAmount).toBe(7000);
    expect(res.body.merchantCommission).toBe(16333);
    expect(await garmentStatus(garmentId)).toBe('sold');
  });

  it('exposes the sale by garment and in the merchant list', async () => {
    const garmentId = await inStockGarment();
    await registerSale(garmentId).expect(201);

    await request(app.getHttpServer())
      .get(`/api/garments/${garmentId}/sale`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .expect(200);

    const list = await request(app.getHttpServer())
      .get('/api/sales')
      .set('Authorization', `Bearer ${merchantToken}`)
      .expect(200);
    expect(list.body.some((s: { garmentId: string }) => s.garmentId === garmentId)).toBe(true);
  });

  it('409s a sale on a garment that is not in stock', async () => {
    const garmentId = await agreedGarment();
    await registerSale(garmentId).expect(409);
  });

  it('forbids a consignor from registering a sale', async () => {
    const garmentId = await inStockGarment();
    await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${consignorToken}`)
      .send({ garmentId, actualSalePrice: 23333, soldAt: '2026-07-01' })
      .expect(403);
  });
});
