import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { DeadlinesService } from './../src/deadlines/deadlines.service';
import { SeedService } from './../src/seed/seed.service';

const HOUR = 60 * 60 * 1000;

interface AgreementBody {
  saleDeadline: string;
  deliveryDeadline: string;
  pickupDeadline?: string;
}

interface ConsignorRow {
  name: string;
  deliveredCount: number;
  deliveryExpiredCount: number;
  deliveryRate: number | null;
  expiredCount: number;
  returnedCount: number;
  unclaimedCount: number;
  awaitingPickupCount: number;
  pickupRate: number | null;
}

interface ExpiryOutcomes {
  expiredCount: number;
  awaitingPickupCount: number;
  returnedCount: number;
  unclaimedCount: number;
  pickupRate: number | null;
  donatedCount: number;
  keptCount: number;
  otherCount: number;
  unclaimedPendingCount: number;
}

// Reportes de cumplimiento del cedente (entrega y retiro) y resultados de los vencimientos de
// stock. La tarea de plazos se invoca directamente con una fecha simulada, igual que en los
// plazos: el orden de las corridas evita pisar las prendas que deben quedar en curso.
describe('Compliance reports (e2e)', () => {
  let app: INestApplication<App>;
  let mongo: MongoMemoryServer;
  let deadlines: DeadlinesService;
  let consignorToken: string;
  let merchantToken: string;

  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const login = (email: string) =>
    http().post('/api/auth/login').send({ email, password: 'trama1234' });

  let merchantId: string;

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

  const receiveAccepted = (garmentId: string) =>
    http()
      .post('/api/receptions')
      .set(bearer(merchantToken))
      .send({
        garmentId,
        salesPointId: 'sp-nc',
        result: 'accepted',
        discrepancies: [],
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

  // Deja la prenda Por retirar: la recibe y vence su ventana de venta.
  const toAwaitingPickup = async (name: string): Promise<string> => {
    const id = await agreedGarment(name);
    await receiveAccepted(id);
    const agreement = await agreementOf(id);
    await deadlines.run(new Date(new Date(agreement.saleDeadline).getTime() + HOUR));
    return id;
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
    deadlines = app.get(DeadlinesService);

    const merchant = await login('contacto@tramaboutique.com');
    merchantToken = merchant.body.token;
    merchantId = merchant.body.user.id;

    const consignor = await http()
      .post('/api/auth/register/consignor')
      .send({
        firstName: 'Cedente',
        lastName: 'Cumplimiento',
        email: 'cumplimiento@example.com',
        phone: '351-4000001',
        password: 'secret123',
        dni: '40.100.200',
        bankDetails: 'cedente.cumplimiento.mp',
        location: {
          street: 'Caseros',
          number: '450',
          neighborhood: 'Alberdi',
          city: 'Córdoba',
        },
      })
      .expect(201);
    consignorToken = consignor.body.token as string;

    // Las prendas que deben quedar en curso (Por retirar y En stock) se construyen al final y sin
    // correr la tarea después, para que ninguna corrida posterior las venza.

    // 1 · No entregada: se acuerda y vence el plazo de entrega.
    const notDelivered = await agreedGarment('No entregada');
    const delivery = new Date((await agreementOf(notDelivered)).deliveryDeadline).getTime();
    await deadlines.run(new Date(delivery + HOUR));

    // 2 · Retirada: Por retirar y el comercio registra la devolución.
    const returned = await toAwaitingPickup('Retirada');
    await http()
      .post('/api/returns')
      .set(bearer(merchantToken))
      .send({ garmentId: returned, identityChecked: true, notes: 'Retiró la titular' })
      .expect(201);

    // 3 · No retirada: Por retirar, vence el retiro y el comercio registra el destino (donada).
    const unclaimed = await toAwaitingPickup('No retirada');
    const pickup = new Date((await agreementOf(unclaimed)).pickupDeadline as string).getTime();
    await deadlines.run(new Date(pickup + HOUR));
    await http()
      .post(`/api/garments/${unclaimed}/disposition`)
      .set(bearer(merchantToken))
      .send({ disposition: 'donated' })
      .expect(201);

    // 4 · Por retirar (en curso): última corrida de la tarea.
    await toAwaitingPickup('Por retirar');

    // 5 · En stock (entregada, en curso): sin corrida posterior.
    const inStock = await agreedGarment('En stock');
    await receiveAccepted(inStock);

    // Estados finales esperados.
    expect(await statusOf(notDelivered)).toBe('delivery_expired');
    expect(await statusOf(returned)).toBe('returned');
    expect(await statusOf(unclaimed)).toBe('unclaimed');
    expect(await statusOf(inStock)).toBe('in_stock');
  }, 120000);

  afterAll(async () => {
    await app.close();
    await mongo.stop();
  });

  it('reporta la tasa de entrega y de retiro de cada cedente', async () => {
    const rows = (
      await http().get('/api/reports/consignors').set(bearer(merchantToken)).expect(200)
    ).body as ConsignorRow[];
    const c = rows.find((r) => r.name === 'Cedente Cumplimiento')!;

    // Entregó 4 de 5 acordadas (en stock, retirada, no retirada, por retirar); 1 no entregada.
    expect(c.deliveredCount).toBe(4);
    expect(c.deliveryExpiredCount).toBe(1);
    expect(c.deliveryRate).toBe(80);

    // 3 terminaron la ventana sin venderse; de las decididas, retiró 1 de 2.
    expect(c.expiredCount).toBe(3);
    expect(c.returnedCount).toBe(1);
    expect(c.unclaimedCount).toBe(1);
    expect(c.awaitingPickupCount).toBe(1);
    expect(c.pickupRate).toBe(50);
  });

  it('reporta los resultados de los vencimientos de stock del comercio', async () => {
    const outcomes = (
      await http().get('/api/reports/expiry-outcomes').set(bearer(merchantToken)).expect(200)
    ).body as ExpiryOutcomes;

    expect(outcomes.expiredCount).toBe(3);
    expect(outcomes.returnedCount).toBe(1);
    expect(outcomes.unclaimedCount).toBe(1);
    expect(outcomes.awaitingPickupCount).toBe(1);
    expect(outcomes.pickupRate).toBe(50);
    expect(outcomes.donatedCount).toBe(1);
    expect(outcomes.keptCount).toBe(0);
    expect(outcomes.unclaimedPendingCount).toBe(0);
  });

  it('le prohíbe al cedente el reporte de vencimientos', () => {
    return http()
      .get('/api/reports/expiry-outcomes')
      .set(bearer(consignorToken))
      .expect(403);
  });
});
