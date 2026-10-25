import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { SeedService } from '../../src/seed/seed.service';

describe('Read endpoints (e2e)', () => {
  let app: INestApplication<App>;
  let mongo: MongoMemoryServer;
  let consignorToken: string;
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
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    await app.get(SeedService).seedAll();

    consignorToken = (await login('ana@example.com')).body.token;
    merchantToken = (await login('contacto@tramaboutique.com')).body.token;
  }, 120000);

  afterAll(async () => {
    await app.close();
    await mongo.stop();
  });

  it('lists agreements scoped to the merchant', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/agreements')
      .set(auth(merchantToken))
      .expect(200);
    expect(res.body).toHaveLength(6);
    expect(res.body.every((a: { appliedCommission: number }) => a.appliedCommission === 70)).toBe(true);
  });

  it('lists agreements scoped to the consignor', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/agreements')
      .set(auth(consignorToken))
      .expect(200);
    const anaGarments = await request(app.getHttpServer())
      .get('/api/garments')
      .set(auth(consignorToken))
      .expect(200);
    const anaGarmentIds = new Set((anaGarments.body as { id: string }[]).map((g) => g.id));
    expect(res.body.length).toBeGreaterThan(0);
    expect(
      (res.body as { garmentId: string }[]).every((a) => anaGarmentIds.has(a.garmentId)),
    ).toBe(true);
  });

  it('gets a proposal by id and 404s the unknown', async () => {
    const pending = await request(app.getHttpServer())
      .get('/api/proposals')
      .set(auth(merchantToken))
      .expect(200);
    const proposalId = (pending.body as { id: string }[])[0].id;

    const res = await request(app.getHttpServer())
      .get(`/api/proposals/${proposalId}`)
      .set(auth(merchantToken))
      .expect(200);
    expect(res.body.id).toBe(proposalId);
    expect(res.body.status).toBe('under_review');

    await request(app.getHttpServer())
      .get('/api/proposals/64b000000000000000000000')
      .set(auth(merchantToken))
      .expect(404);
  });
});
