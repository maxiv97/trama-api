import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { User } from './../src/users/schemas/user.schema';

const consignorPayload = {
  firstName: 'Franco',
  lastName: 'Ledesma',
  email: 'franco.verify@example.com',
  phone: '351-4000001',
  password: 'secret123',
  dni: '30.555.666',
  location: { street: 'Caseros', number: '450', neighborhood: 'Alberdi', city: 'Córdoba' },
};

describe('Auth email verification (e2e)', () => {
  let app: INestApplication<App>;
  let mongo: MongoMemoryServer;
  let userModel: Model<User>;

  const codeFor = (email: string) =>
    userModel
      .findOne({ email })
      .select('+verificationCode')
      .lean()
      .exec()
      .then((u) => (u as unknown as { verificationCode?: string } | null)?.verificationCode);

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongo.getUri();
    // Keep the suite off real email regardless of a local .env: run the mailer in mock mode.
    process.env.BREVO_API_KEY = '';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    userModel = app.get<Model<User>>(getModelToken(User.name));
  }, 120000);

  afterAll(async () => {
    await app.close();
    await mongo.stop();
  });

  it('issues a verification code on registration and verifies it', async () => {
    const register = await request(app.getHttpServer())
      .post('/api/auth/register/consignor')
      .send(consignorPayload)
      .expect(201);

    const token = register.body.token as string;

    const code = await codeFor(consignorPayload.email);
    expect(code).toMatch(/^\d{6}$/);

    await request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .set('Authorization', `Bearer ${token}`)
      .send({ code })
      .expect(201)
      .expect((res) => expect(res.body).toEqual({ verified: true }));

    const user = await userModel.findOne({ email: consignorPayload.email }).exec();
    expect(user?.verified).toBe(true);

    // The code is cleared once used.
    expect(await codeFor(consignorPayload.email)).toBeUndefined();
  });

  it('rejects a wrong code with 400', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: consignorPayload.email, password: consignorPayload.password });

    await request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ code: '000000' })
      .expect(400);
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .send({ code: '123456' })
      .expect(401);
  });

  it('resends a fresh code', async () => {
    const payload = { ...consignorPayload, email: 'resend.verify@example.com', dni: '28.111.222' };
    const register = await request(app.getHttpServer())
      .post('/api/auth/register/consignor')
      .send(payload)
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/auth/resend-code')
      .set('Authorization', `Bearer ${register.body.token}`)
      .expect(201)
      .expect((res) => expect(res.body).toEqual({ sent: true }));

    const code = await codeFor(payload.email);
    expect(code).toMatch(/^\d{6}$/);

    await request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .set('Authorization', `Bearer ${register.body.token}`)
      .send({ code })
      .expect(201);
  });
});
