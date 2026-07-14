import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { SeedService } from './../src/seed/seed.service';

interface SalesPointBody {
  id: string;
  merchantId: string;
  name: string;
  address: string;
  phone: string;
  geo: { lat: number; lng: number };
  receptionSchedule: { days: string; hours: string; instructions: string };
}

describe('SalesPoints (e2e)', () => {
  let app: INestApplication<App>;
  let mongo: MongoMemoryServer;
  let consignorToken: string;
  let merchantToken: string;
  let merchantId: string;

  const login = (email: string) =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'trama1234' });

  const newPoint = {
    name: 'Trama Alta Córdoba',
    address: 'Jujuy 1200',
    phone: '351-3000009',
    geo: { lat: -31.39, lng: -64.18 },
    receptionSchedule: { days: 'Lun a Vie', hours: '9 a 17 h', instructions: 'Timbre A.' },
  };

  const byMerchant = async (id: string): Promise<SalesPointBody[]> => {
    const res = await request(app.getHttpServer())
      .get(`/api/sales-points?merchantId=${id}`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .expect(200);
    return res.body as SalesPointBody[];
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

  it('lists the merchant seeded sales points', async () => {
    const points = await byMerchant(merchantId);
    expect(points).toHaveLength(2);
    const names = points.map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(['Trama Nueva Córdoba', 'Trama Cerro']));
    for (const point of points) {
      expect(point.id).toEqual(expect.any(String));
      expect(point.merchantId).toBe(merchantId);
      expect(point.geo).toBeDefined();
      expect(point.receptionSchedule).toBeDefined();
    }
  });

  it('gets a sales point by id', async () => {
    const [first] = await byMerchant(merchantId);
    const res = await request(app.getHttpServer())
      .get(`/api/sales-points/${first.id}`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .expect(200);
    expect(res.body.id).toBe(first.id);
    expect(res.body.name).toBe(first.name);
  });

  it('returns 404 for an unknown sales point', async () => {
    await request(app.getHttpServer())
      .get('/api/sales-points/64b000000000000000000000')
      .set('Authorization', `Bearer ${merchantToken}`)
      .expect(404);
  });

  it('creates a sales point owned by the merchant', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/sales-points')
      .set('Authorization', `Bearer ${merchantToken}`)
      .send(newPoint)
      .expect(201);
    expect(res.body.id).toEqual(expect.any(String));
    expect(res.body.merchantId).toBe(merchantId);
    expect(res.body.name).toBe('Trama Alta Córdoba');

    expect(await byMerchant(merchantId)).toHaveLength(3);
  });

  it('updates an existing sales point', async () => {
    const points = await byMerchant(merchantId);
    const target = points.find((p) => p.name === 'Trama Alta Córdoba') as SalesPointBody;
    const res = await request(app.getHttpServer())
      .patch(`/api/sales-points/${target.id}`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({ ...newPoint, name: 'Trama Alta (renombrado)' })
      .expect(200);
    expect(res.body.id).toBe(target.id);
    expect(res.body.name).toBe('Trama Alta (renombrado)');
  });

  it('lists every sales point across merchants without a query', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/sales-points')
      .set('Authorization', `Bearer ${merchantToken}`)
      .expect(200);
    expect(res.body.length).toBe(4);
  });

  it('forbids a consignor from creating or updating', async () => {
    await request(app.getHttpServer())
      .post('/api/sales-points')
      .set('Authorization', `Bearer ${consignorToken}`)
      .send(newPoint)
      .expect(403);
  });

  it('returns 404 when updating a sales point of another merchant', async () => {
    const vintage = await login('hola@vintagecba.com');
    const vintagePoints = await request(app.getHttpServer())
      .get(`/api/sales-points?merchantId=${vintage.body.user.id}`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .expect(200);
    const foreignId = (vintagePoints.body as SalesPointBody[])[0].id;

    await request(app.getHttpServer())
      .patch(`/api/sales-points/${foreignId}`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({ ...newPoint, name: 'No permitido' })
      .expect(404);
  });
});
