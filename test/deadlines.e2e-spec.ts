import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { App } from 'supertest/types';
import { Agreement } from './../src/agreements/schemas/agreement.schema';
import { AppModule } from './../src/app.module';
import { DeadlinesService } from './../src/deadlines/deadlines.service';
import { SeedService } from './../src/seed/seed.service';

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

interface AgreementBody {
  agreedAt: string;
  saleDeadline: string;
  saleWindowMonths: number;
  deliveryDays: number;
  deliveryDeadline: string;
  pickupDays: number;
  pickupDeadline?: string;
}

interface NotificationBody {
  type: string;
  text: string;
  target: string;
}

// Plazos de la consignación: entrega, venta y retiro. La tarea diaria se invoca directamente con
// una fecha simulada (DeadlinesService.run(now)) en lugar de esperar al cron.
describe('Deadlines and returns (e2e)', () => {
  let app: INestApplication<App>;
  let mongo: MongoMemoryServer;
  let deadlines: DeadlinesService;
  let consignorToken: string;
  let merchantToken: string;
  let merchantId: string;

  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const login = (email: string) =>
    http().post('/api/auth/login').send({ email, password: 'trama1234' });

  // Cada test usa su propia cedente: los avisos se agrupan por cedente, y así los de un test no
  // se mezclan con los de otro.
  let consignorSeq = 0;
  const useNewConsignor = async (): Promise<void> => {
    consignorSeq += 1;
    const res = await http()
      .post('/api/auth/register/consignor')
      .send({
        firstName: 'Cedente',
        lastName: `Plazos ${consignorSeq}`,
        email: `plazos${consignorSeq}@example.com`,
        phone: '351-4000001',
        password: 'secret123',
        dni: `40.000.00${consignorSeq}`,
        bankDetails: 'cedente.plazos.mp',
        location: {
          street: 'Caseros',
          number: '450',
          neighborhood: 'Alberdi',
          city: 'Córdoba',
        },
      })
      .expect(201);
    consignorToken = res.body.token as string;
  };

  const agreedGarment = async (name: string): Promise<string> => {
    const created = await http()
      .post('/api/garments')
      .set(bearer(consignorToken))
      .send({
        name,
        category: 'Camperas y abrigos',
        brand: 'Levis',
        size: 'M',
        color: 'Azul',
        season: 'Invierno',
        condition: 'very_good',
        photos: ['data:image/png;base64,AAAA'],
        merchantId,
      })
      .expect(201);
    const garmentId = created.body.id as string;
    await http()
      .post('/api/proposals')
      .set(bearer(consignorToken))
      .send({ garmentId, requestedConsignorPrice: 7000 })
      .expect(201);
    await http()
      .post(`/api/proposals/${garmentId}/accept`)
      .set(bearer(merchantToken))
      .expect(201);
    return garmentId;
  };

  const receive = (garmentId: string, result: 'accepted' | 'rejected') =>
    http()
      .post('/api/receptions')
      .set(bearer(merchantToken))
      .send({
        garmentId,
        salesPointId: 'sp-nc',
        result,
        discrepancies: result === 'rejected' ? ['damage'] : [],
        detail: result === 'rejected' ? 'Rotura' : undefined,
        evidence: [],
      })
      .expect(201);

  const agreementOf = async (garmentId: string): Promise<AgreementBody> =>
    (
      await http()
        .get(`/api/garments/${garmentId}/agreement`)
        .set(bearer(merchantToken))
        .expect(200)
    ).body as AgreementBody;

  const statusOf = async (garmentId: string): Promise<string> =>
    (
      await http()
        .get(`/api/garments/${garmentId}`)
        .set(bearer(merchantToken))
        .expect(200)
    ).body.status as string;

  const notificationsAbout = async (
    token: string,
    name: string,
  ): Promise<NotificationBody[]> =>
    (
      (await http().get('/api/notifications').set(bearer(token)).expect(200))
        .body as NotificationBody[]
    ).filter((n) => n.text.includes(name));

  // Prenda recibida cuya venta ya venció: queda Por retirar.
  const awaitingPickup = async (
    name: string,
  ): Promise<{ id: string; agreement: AgreementBody }> => {
    const id = await agreedGarment(name);
    await receive(id, 'accepted');
    const agreement = await agreementOf(id);
    await deadlines.run(
      new Date(new Date(agreement.saleDeadline).getTime() + HOUR),
    );
    return { id, agreement: await agreementOf(id) };
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
    deadlines = app.get(DeadlinesService);
    const merchant = await login('contacto@tramaboutique.com');
    merchantToken = merchant.body.token;
    merchantId = merchant.body.user.id;
  }, 120000);

  beforeEach(() => useNewConsignor());

  afterAll(async () => {
    await app.close();
    await mongo.stop();
  });

  it('congela los tres plazos del comercio al cerrar el acuerdo', async () => {
    const id = await agreedGarment('Saco plazos');
    const agreement = await agreementOf(id);
    expect(agreement.deliveryDays).toBe(7);
    expect(agreement.pickupDays).toBe(15);
    expect(agreement.saleWindowMonths).toBe(3);
    const delivery = new Date(agreement.deliveryDeadline).getTime();
    expect(delivery - new Date(agreement.agreedAt).getTime()).toBe(7 * DAY);
  });

  it('recuerda la entrega al cedente y la vence al pasar el plazo, sin duplicar avisos', async () => {
    const id = await agreedGarment('Blazer entrega');
    const deadline = new Date(
      (await agreementOf(id)).deliveryDeadline,
    ).getTime();

    await deadlines.run(new Date(deadline - DAY));
    await deadlines.run(new Date(deadline - DAY)); // misma fecha: idempotente
    let consignorNotices = await notificationsAbout(
      consignorToken,
      'Blazer entrega',
    );
    expect(consignorNotices.filter((n) => n.type === 'delivery')).toHaveLength(
      1,
    );
    expect(await statusOf(id)).toBe('agreed');

    await deadlines.run(new Date(deadline + HOUR));
    expect(await statusOf(id)).toBe('delivery_expired');
    consignorNotices = await notificationsAbout(
      consignorToken,
      'Blazer entrega',
    );
    expect(consignorNotices.filter((n) => n.type === 'delivery')).toHaveLength(
      2,
    );
    const merchantNotices = await notificationsAbout(
      merchantToken,
      'Blazer entrega',
    );
    expect(merchantNotices.some((n) => n.type === 'delivery')).toBe(true);
  });

  it('da un nuevo plazo de entrega desde el rechazo, que la nueva entrega no reinicia', async () => {
    const id = await agreedGarment('Chaleco rechazo');
    const before = Date.now();
    await receive(id, 'rejected');
    const afterRejection = new Date(
      (await agreementOf(id)).deliveryDeadline,
    ).getTime();
    expect(afterRejection).toBeGreaterThanOrEqual(before + 7 * DAY - 5000);

    await http()
      .post(`/api/garments/${id}/actions`)
      .set(bearer(consignorToken))
      .send({ action: 'REDELIVER' })
      .expect(201);
    expect(new Date((await agreementOf(id)).deliveryDeadline).getTime()).toBe(
      afterRejection,
    );
  });

  it('cuenta la venta desde la recepción y la pasa a Por retirar al vencer', async () => {
    const id = await agreedGarment('Campera venta');
    const before = new Date();
    await receive(id, 'accepted');
    const agreement = await agreementOf(id);
    const expected = new Date(before);
    expected.setMonth(expected.getMonth() + 3);
    expect(
      Math.abs(new Date(agreement.saleDeadline).getTime() - expected.getTime()),
    ).toBeLessThan(60_000);
    const sale = new Date(agreement.saleDeadline).getTime();
    expect(new Date(agreement.pickupDeadline as string).getTime() - sale).toBe(
      15 * DAY,
    );

    await deadlines.run(new Date(sale - 3 * DAY));
    expect(
      (await notificationsAbout(consignorToken, 'Campera venta')).filter(
        (n) => n.type === 'expiry',
      ),
    ).toHaveLength(1);

    await deadlines.run(new Date(sale + HOUR));
    expect(await statusOf(id)).toBe('awaiting_pickup');
    const consignorNotices = await notificationsAbout(
      consignorToken,
      'Campera venta',
    );
    expect(
      consignorNotices.some(
        (n) => n.type === 'expiry' && n.text.includes('Retirala'),
      ),
    ).toBe(true);
    const dashboard = await http()
      .get('/api/reports/dashboard')
      .set(bearer(merchantToken))
      .expect(200);
    expect(dashboard.body.awaitingPickupCount).toBeGreaterThanOrEqual(1);
    const merchantNotices = await notificationsAbout(
      merchantToken,
      'Campera venta',
    );
    expect(
      merchantNotices.some((n) => n.text.includes('sacala de exhibición')),
    ).toBe(true);

    await http()
      .post('/api/sales')
      .set(bearer(merchantToken))
      .send({ garmentId: id, actualSalePrice: 20000, soldAt: '2026-07-01' })
      .expect(409);
  });

  it('registra la devolución solo para el comercio y con el DNI verificado', async () => {
    const { id } = await awaitingPickup('Tapado devolución');

    await http()
      .post('/api/returns')
      .set(bearer(merchantToken))
      .send({ garmentId: id, identityChecked: false })
      .expect(400);
    await http()
      .post('/api/returns')
      .set(bearer(consignorToken))
      .send({ garmentId: id, identityChecked: true })
      .expect(403);

    const res = await http()
      .post('/api/returns')
      .set(bearer(merchantToken))
      .send({
        garmentId: id,
        identityChecked: true,
        notes: 'Retiró la titular',
      })
      .expect(201);
    expect(res.body.receiptNumber).toMatch(/^DEV-/);
    expect(await statusOf(id)).toBe('returned');

    const asConsignor = await http()
      .get(`/api/garments/${id}/return`)
      .set(bearer(consignorToken))
      .expect(200);
    expect(asConsignor.body.receiptNumber).toBe(res.body.receiptNumber);
    expect(
      (await notificationsAbout(consignorToken, 'Tapado devolución')).some(
        (n) => n.type === 'pickup',
      ),
    ).toBe(true);

    await http()
      .post('/api/returns')
      .set(bearer(merchantToken))
      .send({ garmentId: id, identityChecked: true })
      .expect(409);
  });

  it('marca No retirada al vencer el retiro y registra el destino una sola vez', async () => {
    const { id, agreement } = await awaitingPickup('Sweater no retirado');
    await deadlines.run(
      new Date(new Date(agreement.pickupDeadline as string).getTime() + HOUR),
    );
    expect(await statusOf(id)).toBe('unclaimed');
    expect(
      (await notificationsAbout(merchantToken, 'Sweater no retirado')).some(
        (n) => n.text.includes('Registrá el destino'),
      ),
    ).toBe(true);

    await http()
      .post(`/api/garments/${id}/disposition`)
      .set(bearer(merchantToken))
      .send({ disposition: 'other' })
      .expect(400);
    const before = await http()
      .get('/api/reports/dashboard')
      .set(bearer(merchantToken))
      .expect(200);
    await http()
      .post(`/api/garments/${id}/disposition`)
      .set(bearer(merchantToken))
      .send({ disposition: 'donated' })
      .expect(201);
    await http()
      .post(`/api/garments/${id}/disposition`)
      .set(bearer(merchantToken))
      .send({ disposition: 'kept' })
      .expect(409);
    const garment = await http()
      .get(`/api/garments/${id}`)
      .set(bearer(merchantToken))
      .expect(200);
    expect(garment.body.unclaimedDisposition.disposition).toBe('donated');
    const after = await http()
      .get('/api/reports/dashboard')
      .set(bearer(merchantToken))
      .expect(200);
    expect(after.body.unclaimedPendingCount).toBe(
      (before.body.unclaimedPendingCount as number) - 1,
    );
  });

  it('aplica sin avisar los vencimientos viejos', async () => {
    const id = await agreedGarment('Pollera vieja');
    const deadline = new Date(
      (await agreementOf(id)).deliveryDeadline,
    ).getTime();
    await deadlines.run(new Date(deadline + 10 * DAY));
    expect(await statusOf(id)).toBe('delivery_expired');
    const notices = await notificationsAbout(consignorToken, 'Pollera vieja');
    expect(notices.filter((n) => n.type === 'delivery')).toHaveLength(0);
  });

  it('agrupa en un solo aviso las prendas del mismo cedente que vencen el mismo día', async () => {
    const first = await agreedGarment('Remera grupo A');
    await agreedGarment('Remera grupo B');
    const deadline = new Date(
      (await agreementOf(first)).deliveryDeadline,
    ).getTime();
    await deadlines.run(new Date(deadline + HOUR));
    const notices = (
      (
        await http()
          .get('/api/notifications')
          .set(bearer(consignorToken))
          .expect(200)
      ).body as NotificationBody[]
    ).filter((n) => n.type === 'delivery' && n.text.includes('2 prendas'));
    expect(notices).toHaveLength(1);
    expect(notices[0].target).toBe('/c');
  });

  it('da plazo de entrega desde hoy a los acuerdos anteriores a esta funcionalidad', async () => {
    const id = await agreedGarment('Gorro legado');
    const agreements = app.get<Model<Agreement>>(getModelToken(Agreement.name));
    await agreements.updateOne(
      { garmentId: id },
      { $unset: { deliveryDeadline: 1, deliveryDays: 1 } },
    );
    const now = new Date(Date.now() + 30 * DAY);
    await deadlines.run(now);
    expect(await statusOf(id)).toBe('agreed');
    const agreement = await agreementOf(id);
    expect(new Date(agreement.deliveryDeadline).getTime()).toBe(
      now.getTime() + 7 * DAY,
    );
  });

  it('no acepta acciones de vencimiento desde el endpoint genérico', async () => {
    const id = await agreedGarment('Camisa sistema');
    await http()
      .post(`/api/garments/${id}/actions`)
      .set(bearer(merchantToken))
      .send({ action: 'EXPIRE_DELIVERY' })
      .expect(400);
  });
});
