import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { SeedService } from './../src/seed/seed.service';

describe('Reception discrepancies report (e2e)', () => {
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

  const received = async (result: string, discrepancies: string[]): Promise<void> => {
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
    await request(app.getHttpServer())
      .post(`/api/proposals/${garmentId}/accept`)
      .set(auth(merchantToken));
    await request(app.getHttpServer())
      .post('/api/receptions')
      .set(auth(merchantToken))
      .send({ garmentId, salesPointId: 'sp-nc', result, discrepancies, evidence: [] });
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

    await received('accepted', []);
    await received('with_remarks', ['condition', 'damage']);
  }, 120000);

  afterAll(async () => {
    await app.close();
    await mongo.stop();
  });

  it('aggregates the discrepancy rate and types across receptions', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/reports/discrepancies')
      .set(auth(merchantToken))
      .expect(200);

    expect(res.body.totalReceptions).toBe(2);
    expect(res.body.withDiscrepancies).toBe(1);
    expect(res.body.rate).toBe(50);
    const types = (res.body.byType as { discrepancy: string; count: number }[]).map((t) => t.discrepancy);
    expect(types).toEqual(expect.arrayContaining(['condition', 'damage']));
  });

  it('lists the per-garment detail of receptions with observations', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/reports/discrepancies/detail')
      .set(auth(merchantToken))
      .expect(200);

    const rows = res.body as {
      garmentName: string;
      category: string;
      consignorName: string;
      daysInStock: number;
      discrepancies: string[];
    }[];
    // Only the with_remarks reception has observations.
    expect(rows).toHaveLength(1);
    expect(rows[0].garmentName).toBe('Campera de jean');
    expect(rows[0].category).toBe('Camperas y abrigos');
    expect(rows[0].consignorName).toBe('Ana Gómez');
    expect(rows[0].discrepancies).toEqual(expect.arrayContaining(['condition', 'damage']));
    expect(typeof rows[0].daysInStock).toBe('number');
  });

  it('forbids a consignor from the discrepancies report', () => {
    return request(app.getHttpServer())
      .get('/api/reports/discrepancies')
      .set(auth(consignorToken))
      .expect(403);
  });

  it('filters the discrepancies report by category', async () => {
    const camperas = await request(app.getHttpServer())
      .get('/api/reports/discrepancies')
      .query({ category: 'Camperas y abrigos' })
      .set(auth(merchantToken))
      .expect(200);
    expect(camperas.body.totalReceptions).toBe(2);

    const calzado = await request(app.getHttpServer())
      .get('/api/reports/discrepancies')
      .query({ category: 'Calzado' })
      .set(auth(merchantToken))
      .expect(200);
    expect(calzado.body.totalReceptions).toBe(0);
    expect(calzado.body.rate).toBeNull();
  });

  it('scopes the discrepancies report to a date range', async () => {
    // Both receptions were stamped just now, so a window that ends in the past is empty.
    const past = await request(app.getHttpServer())
      .get('/api/reports/discrepancies')
      .query({ to: '2000-12-31' })
      .set(auth(merchantToken))
      .expect(200);
    expect(past.body.totalReceptions).toBe(0);

    const wide = await request(app.getHttpServer())
      .get('/api/reports/discrepancies')
      .query({ from: '2000-01-01' })
      .set(auth(merchantToken))
      .expect(200);
    expect(wide.body.totalReceptions).toBe(2);
  });
});
