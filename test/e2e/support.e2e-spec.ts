import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { MailService } from '../../src/mail/mail.service';
import { SeedService } from '../../src/seed/seed.service';
import { SupportTicket } from '../../src/support/schemas/support-ticket.schema';

describe('Support tickets (e2e)', () => {
  let app: INestApplication<App>;
  let mongo: MongoMemoryServer;
  let tickets: Model<SupportTicket>;
  let toTrama: jest.SpyInstance;
  let confirmation: jest.SpyInstance;

  const base = {
    motivo: 'liquidaciones',
    rol: 'cedente',
    nombre: 'Ana Pérez',
    email: 'ana@example.com',
    mensaje: 'No veo la liquidación de septiembre del comercio Segunda Vuelta.',
    origen: '/ayuda/faq#liquidacion-vencida',
    faqsVistas: ['cuando-cobro', 'liquidacion-vencida'],
  };

  const send = (body: Record<string, unknown>, token?: string) => {
    const req = request(app.getHttpServer()).post('/api/support/tickets');
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.send(body);
  };

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
    tickets = app.get(getModelToken(SupportTicket.name));
    const mail = app.get(MailService);
    toTrama = jest.spyOn(mail, 'sendSupportTicket');
    confirmation = jest.spyOn(mail, 'sendSupportConfirmation');
  }, 120000);

  beforeEach(async () => {
    await tickets.deleteMany({});
    toTrama.mockClear();
    confirmation.mockClear();
  });

  it('crea el ticket sin sesión, devuelve el número y lo manda a Trama', async () => {
    const res = await send(base).expect(201);
    expect(res.body.ticketId).toMatch(/^TR-\d{4}-\d{6}$/);

    const saved = await tickets.findOne({ ticketId: res.body.ticketId }).lean();
    expect(saved).toMatchObject({
      motivo: 'liquidaciones',
      email: 'ana@example.com',
      faqsVistas: base.faqsVistas,
    });
    expect(saved?.userId).toBeUndefined();

    expect(toTrama).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: res.body.ticketId,
        email: 'ana@example.com',
      }),
      undefined,
    );
    expect(confirmation).toHaveBeenCalledWith(
      'ana@example.com',
      'Ana Pérez',
      res.body.ticketId,
      'liquidaciones',
    );
  });

  it('numera los tickets en forma correlativa', async () => {
    const a = await send(base).expect(201);
    const b = await send({ ...base, email: 'otra@example.com' }).expect(201);
    const seq = (id: string) => Number(id.split('-')[2]);
    expect(seq(b.body.ticketId)).toBe(seq(a.body.ticketId) + 1);
  });

  it('asocia el usuario cuando viaja un JWT válido', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'contacto@tramaboutique.com', password: 'trama1234' });
    const res = await send(
      { ...base, rol: 'comercio' },
      login.body.token,
    ).expect(201);
    const saved = await tickets.findOne({ ticketId: res.body.ticketId }).lean();
    expect(saved?.userId).toBe(login.body.user.id);
  });

  it('un token inválido no bloquea el envío', async () => {
    await send(base, 'no-es-un-token').expect(201);
  });

  it('valida los campos', async () => {
    await send({ ...base, motivo: 'inventado' }).expect(400);
    await send({ ...base, rol: 'admin' }).expect(400);
    await send({ ...base, nombre: 'A' }).expect(400);
    await send({ ...base, email: 'no-es-email' }).expect(400);
    await send({ ...base, mensaje: 'muy corto' }).expect(400);
    await send({ ...base, captura: 'data:text/html;base64,PGgxPg==' }).expect(
      400,
    );
  });

  it('adjunta la captura en el email a Trama', async () => {
    const captura = 'data:image/png;base64,iVBORw0KGgo=';
    await send({ ...base, motivo: 'problema', captura }).expect(201);
    expect(toTrama).toHaveBeenCalledWith(expect.anything(), {
      name: 'captura.png',
      content: 'iVBORw0KGgo=',
    });
  });

  it('honeypot: responde 201 pero no guarda ni envía', async () => {
    await send({ ...base, website: 'http://spam.example' }).expect(201);
    expect(await tickets.countDocuments()).toBe(0);
    expect(toTrama).not.toHaveBeenCalled();
  });

  it('limita a 5 tickets por email por hora', async () => {
    for (let i = 0; i < 5; i++)
      await send({ ...base, email: 'Limite@Example.com' }).expect(201);
    await send({ ...base, email: 'limite@example.com' }).expect(429);
    await send({ ...base, email: 'otro@example.com' }).expect(201);
  });

  afterAll(async () => {
    await app.close();
    await mongo.stop();
  });
});
