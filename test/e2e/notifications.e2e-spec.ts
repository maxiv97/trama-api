import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { SeedService } from '../../src/seed/seed.service';

interface NotificationBody {
  id: string;
  type: string;
  text: string;
  target: string;
  read: boolean;
}

describe('Notifications (e2e)', () => {
  let app: INestApplication<App>;
  let mongo: MongoMemoryServer;
  let consignorToken: string;
  let merchantToken: string;
  let merchantId: string;

  const login = (email: string) =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'trama1234' });

  const soldGarment = async (): Promise<string> => {
    const created = await request(app.getHttpServer())
      .post('/api/garments')
      .set('Authorization', `Bearer ${consignorToken}`)
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
      .set('Authorization', `Bearer ${consignorToken}`)
      .send({ garmentId, requestedConsignorPrice: 7000 });
    await request(app.getHttpServer())
      .post(`/api/proposals/${garmentId}/accept`)
      .set('Authorization', `Bearer ${merchantToken}`);
    await request(app.getHttpServer())
      .post('/api/receptions')
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({ garmentId, salesPointId: 'sp-nc', result: 'accepted', discrepancies: [], evidence: [] });
    await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({ garmentId, actualSalePrice: 23333, soldAt: '2026-07-15' });
    return garmentId;
  };

  const notificationsOf = async (token: string): Promise<NotificationBody[]> => {
    const res = await request(app.getHttpServer())
      .get('/api/notifications')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body as NotificationBody[];
  };

  const unreadCount = async (token: string): Promise<number> => {
    const res = await request(app.getHttpServer())
      .get('/api/notifications/unread-count')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body.count as number;
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

  it('notifies the merchant of a new proposal on garment creation', async () => {
    await request(app.getHttpServer())
      .post('/api/garments')
      .set('Authorization', `Bearer ${consignorToken}`)
      .send({
        name: 'Vestido de fiesta',
        category: 'Vestidos',
        brand: 'Zara',
        size: 'S',
        color: 'Negro',
        season: 'Verano',
        condition: 'new',
        description: 'Sin uso',
        photos: ['data:image/png;base64,AAAA'],
        merchantId,
      });

    const merchantNotifications = await notificationsOf(merchantToken);
    const proposal = merchantNotifications.find((n) => n.type === 'proposal');
    expect(proposal).toBeDefined();
    expect(proposal?.text).toContain('para revisar.');
    expect(proposal?.target).toMatch(/^\/m\/garment\//);
  });

  it('notifies the consignor across the sale lifecycle', async () => {
    await soldGarment();

    const consignorNotifications = await notificationsOf(consignorToken);
    const types = consignorNotifications.map((n) => n.type);
    expect(types).toEqual(expect.arrayContaining(['agreement', 'sale']));

    const agreement = consignorNotifications.find((n) => n.type === 'agreement');
    expect(agreement?.text).toContain('aceptó tu propuesta');
    expect(agreement?.target).toMatch(/^\/c\/garment\//);

    const sale = consignorNotifications.find((n) => n.type === 'sale');
    expect(sale?.text).toContain('Vendimos');
  });

  it('notifies the consignor when the payout is settled', async () => {
    const garmentId = await soldGarment();
    await request(app.getHttpServer())
      .post('/api/payouts/settle')
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({ garmentIds: [garmentId], paymentMethod: 'transfer', receiptNumber: 'R-1' })
      .expect(201);

    const consignorNotifications = await notificationsOf(consignorToken);
    const payout = consignorNotifications.find((n) => n.type === 'payout');
    expect(payout).toBeDefined();
    expect(payout?.text).toContain('Liquidamos el pago');
  });

  it('returns only the requesting user notifications, newest first', async () => {
    const consignorNotifications = await notificationsOf(consignorToken);
    const dates = consignorNotifications.map((n) => new Date((n as unknown as { date: string }).date).getTime());
    const sortedDesc = [...dates].sort((a, b) => b - a);
    expect(dates).toEqual(sortedDesc);
  });

  it('marks one notification read and decrements the unread count', async () => {
    const before = await unreadCount(consignorToken);
    expect(before).toBeGreaterThan(0);

    const [first] = await notificationsOf(consignorToken);
    await request(app.getHttpServer())
      .patch(`/api/notifications/${first.id}/read`)
      .set('Authorization', `Bearer ${consignorToken}`)
      .expect(200);

    expect(await unreadCount(consignorToken)).toBe(before - 1);
  });

  it('marks all notifications read', async () => {
    await request(app.getHttpServer())
      .patch('/api/notifications/read-all')
      .set('Authorization', `Bearer ${consignorToken}`)
      .expect(200);
    expect(await unreadCount(consignorToken)).toBe(0);
  });

  it('forbids marking a notification that belongs to another user', async () => {
    const [consignorNotification] = await notificationsOf(consignorToken);
    await request(app.getHttpServer())
      .patch(`/api/notifications/${consignorNotification.id}/read`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .expect(404);
  });
});
