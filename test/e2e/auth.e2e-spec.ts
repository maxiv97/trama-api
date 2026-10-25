import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { SeedService } from '../../src/seed/seed.service';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongo.getUri();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    await app.get(SeedService).seedUsers();
  }, 120000);

  afterAll(async () => {
    await app.close();
    await mongo.stop();
  });

  it('logs in a seeded consignor and returns a session user', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'ana@example.com', password: 'trama1234' })
      .expect(201);

    expect(typeof res.body.token).toBe('string');
    expect(res.body.user).toEqual({
      id: expect.any(String),
      name: 'Ana Gómez',
      role: 'consignor',
    });
  });

  it('rejects a wrong password with 401', () => {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'ana@example.com', password: 'wrong' })
      .expect(401);
  });

  it('returns the current user for a valid token', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'contacto@tramaboutique.com', password: 'trama1234' });

    const res = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.token}`)
      .expect(200);

    expect(res.body).toEqual({
      id: expect.any(String),
      name: 'María López',
      role: 'merchant',
      email: 'contacto@tramaboutique.com',
    });
  });

  it('rejects /me without a token', () => {
    return request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });

  it('keeps the health check public', () => {
    return request(app.getHttpServer()).get('/api/health').expect(200);
  });

  it('rejects a token whose user no longer exists with 401', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'ana@example.com', password: 'trama1234' });
    const staleToken = login.body.token;

    // Re-seeding regenerates user ids, leaving the just-issued token pointing at a deleted user.
    await app.get(SeedService).seedUsers();

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${staleToken}`)
      .expect(401);
  });
});
