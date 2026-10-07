import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

const consignorPayload = {
  name: 'Franco Ledesma',
  email: 'franco@example.com',
  phone: '351-4000001',
  password: 'secret123',
  dni: '30.555.666',
  location: { neighborhood: 'Alberdi', city: 'Córdoba' },
};

const merchantPayload = {
  name: 'Paula Reyes',
  email: 'paula@segundavuelta.com',
  phone: '351-4000002',
  password: 'secret123',
  businessName: 'Segunda Vuelta',
  cuit: '30-71234567-9',
  location: { neighborhood: 'Cofico', city: 'Córdoba', lat: -31.39, lng: -64.18 },
  commissionConfig: { consignorPercentage: 40, merchantPercentage: 60 },
  terms: { saleWindowMonths: 3, graceMonths: 1, payoutDay: 10 },
  salesPoint: {
    name: 'Segunda Vuelta Cofico',
    address: 'Jujuy 1200',
    phone: '351-4000002',
    geo: { lat: -31.39, lng: -64.18 },
    receptionSchedule: {
      days: 'Lun a Vie',
      hours: '10 a 18 h',
      instructions: 'Timbre principal.',
    },
  },
};

describe('Auth registration (e2e)', () => {
  let app: INestApplication<App>;
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongo.getUri();
    // Keep the suite off real SMTP regardless of a local .env: run the mailer in mock mode.
    process.env.MAIL_USER = '';
    process.env.MAIL_PASS = '';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  }, 120000);

  afterAll(async () => {
    await app.close();
    await mongo.stop();
  });

  it('registers a consignor, returns a session token, and lets them log in', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register/consignor')
      .send(consignorPayload)
      .expect(201);

    expect(typeof res.body.token).toBe('string');
    expect(res.body.user).toEqual({
      id: expect.any(String),
      name: 'Franco Ledesma',
      role: 'consignor',
    });

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: consignorPayload.email, password: consignorPayload.password })
      .expect(201);
  });

  it('registers a merchant with its first sales point, terms, and cuit', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register/merchant')
      .send(merchantPayload)
      .expect(201);

    expect(res.body.user.role).toBe('merchant');

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: merchantPayload.email, password: merchantPayload.password })
      .expect(201);

    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.token}`)
      .expect(200);

    expect(me.body).toEqual({
      id: login.body.user.id,
      name: 'Paula Reyes',
      role: 'merchant',
    });

    const points = await request(app.getHttpServer())
      .get(`/api/sales-points?merchantId=${login.body.user.id}`)
      .set('Authorization', `Bearer ${login.body.token}`)
      .expect(200);

    expect(points.body).toHaveLength(1);
    expect(points.body[0].name).toBe('Segunda Vuelta Cofico');
  });

  it('rejects a duplicate email with 409', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register/consignor')
      .send(consignorPayload)
      .expect(409);
  });

  it('rejects an invalid payload with 400', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register/consignor')
      .send({ ...consignorPayload, email: 'not-an-email' })
      .expect(400);
  });
});
