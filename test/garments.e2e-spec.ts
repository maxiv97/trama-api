import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { SeedService } from './../src/seed/seed.service';

describe('Garments (e2e)', () => {
  let app: INestApplication<App>;
  let mongo: MongoMemoryServer;
  let consignorToken: string;
  let merchantToken: string;
  let merchantId: string;

  const login = (email: string) =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'trama1234' });

  const garmentPayload = () => ({
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

  const createGarment = () =>
    request(app.getHttpServer())
      .post('/api/garments')
      .set('Authorization', `Bearer ${consignorToken}`)
      .send(garmentPayload());

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

    const consignor = await login('ana@example.com');
    consignorToken = consignor.body.token;
    const merchant = await login('contacto@tramaboutique.com');
    merchantToken = merchant.body.token;
    merchantId = merchant.body.user.id;
  }, 120000);

  afterAll(async () => {
    await app.close();
    await mongo.stop();
  });

  it('creates a garment in under_review with a seeded timeline', async () => {
    const res = await createGarment().expect(201);
    expect(res.body.id).toEqual(expect.any(String));
    expect(res.body.status).toBe('under_review');
    expect(res.body.consignorId).toEqual(expect.any(String));
    expect(res.body.timeline).toHaveLength(2);
  });

  it('rejects a garment with a category outside the canonical list', () => {
    return request(app.getHttpServer())
      .post('/api/garments')
      .set('Authorization', `Bearer ${consignorToken}`)
      .send({ ...garmentPayload(), category: 'Abrigos' })
      .expect(400);
  });

  it('lists the consignor own garments', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/garments')
      .set('Authorization', `Bearer ${consignorToken}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('gets a garment by id and 404s an unknown one', async () => {
    const created = await createGarment();
    await request(app.getHttpServer())
      .get(`/api/garments/${created.body.id}`)
      .set('Authorization', `Bearer ${consignorToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/garments/64b000000000000000000000')
      .set('Authorization', `Bearer ${consignorToken}`)
      .expect(404);
  });

  it('rejects an invalid transition with 409', async () => {
    const created = await createGarment();
    await request(app.getHttpServer())
      .post(`/api/garments/${created.body.id}/actions`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({ action: 'REGISTER_SALE' })
      .expect(409);
  });

  it('applies a valid action and advances the status', async () => {
    const created = await createGarment();
    const res = await request(app.getHttpServer())
      .post(`/api/garments/${created.body.id}/actions`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({ action: 'ACCEPT_PROPOSAL' })
      .expect(201);
    expect(res.body.status).toBe('agreed');
    expect(res.body.timeline.length).toBeGreaterThan(2);
  });

  it('requires auth to create a garment', () => {
    return request(app.getHttpServer())
      .post('/api/garments')
      .send(garmentPayload())
      .expect(401);
  });

  it('forbids a merchant from creating a garment', () => {
    return request(app.getHttpServer())
      .post('/api/garments')
      .set('Authorization', `Bearer ${merchantToken}`)
      .send(garmentPayload())
      .expect(403);
  });
});
