import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { SeedService } from './../src/seed/seed.service';

interface GarmentBody {
  id: string;
  name: string;
  status: string;
  merchantId: string;
  salesPointId: string;
}

describe('Seed graph (e2e)', () => {
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
    const merchant = await login('contacto@tramaboutique.com');
    merchantToken = merchant.body.token;
    merchantId = merchant.body.user.id;
  }, 120000);

  afterAll(async () => {
    await app.close();
    await mongo.stop();
  });

  const garmentsOf = async (token: string): Promise<GarmentBody[]> => {
    const res = await request(app.getHttpServer())
      .get('/api/garments')
      .set(auth(token))
      .expect(200);
    return res.body as GarmentBody[];
  };

  it('wires garments to real merchant and sales-point ids', async () => {
    const anaGarments = await garmentsOf(consignorToken);
    expect(anaGarments).toHaveLength(6);
    const merchantGarments = await garmentsOf(merchantToken);
    expect(merchantGarments).toHaveLength(9);

    const salesPoints = await request(app.getHttpServer())
      .get(`/api/sales-points?merchantId=${merchantId}`)
      .set(auth(merchantToken))
      .expect(200);
    const salesPointIds = (salesPoints.body as { id: string }[]).map((p) => p.id);

    for (const garment of anaGarments) {
      expect(garment.merchantId).toBe(merchantId);
      expect(salesPointIds).toContain(garment.salesPointId);
    }
  });

  it('resolves the agreement and paid sale of the paid_out garment', async () => {
    const anaGarments = await garmentsOf(consignorToken);
    const paidOut = anaGarments.find((g) => g.status === 'paid_out') as GarmentBody;
    expect(paidOut.name).toBe('Cartera de cuero');

    const agreement = await request(app.getHttpServer())
      .get(`/api/garments/${paidOut.id}/agreement`)
      .set(auth(merchantToken))
      .expect(200);
    expect(agreement.body.agreedSalePrice).toBe(20000);

    const sale = await request(app.getHttpServer())
      .get(`/api/garments/${paidOut.id}/sale`)
      .set(auth(merchantToken))
      .expect(200);
    expect(sale.body.paymentMethod).toBe('transfer');
    expect(sale.body.paidAt).toEqual(expect.any(String));
  });

  it('exposes the pending proposals and the counteroffer', async () => {
    const pending = await request(app.getHttpServer())
      .get('/api/proposals')
      .set(auth(merchantToken))
      .expect(200);
    expect(pending.body).toHaveLength(2);

    const merchantGarments = await garmentsOf(merchantToken);
    const blusa = merchantGarments.find((g) => g.name === 'Blusa de seda') as GarmentBody;
    const proposal = await request(app.getHttpServer())
      .get(`/api/garments/${blusa.id}/proposal`)
      .set(auth(merchantToken))
      .expect(200);
    expect(proposal.body.status).toBe('counteroffer');
    expect(proposal.body.counteroffer.salePrice).toBe(20000);
  });

  it('derives monthly payouts including a paid group', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/payouts/monthly')
      .set(auth(merchantToken))
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.some((group: { status: string }) => group.status === 'paid')).toBe(true);
  });

  it('seeds notifications with targets pointing at real garment ids', async () => {
    const anaGarments = await garmentsOf(consignorToken);
    const vestido = anaGarments.find((g) => g.name === 'Vestido de fiesta') as GarmentBody;

    const notifications = await request(app.getHttpServer())
      .get('/api/notifications')
      .set(auth(consignorToken))
      .expect(200);
    const proposalNote = (notifications.body as { type: string; target: string }[]).find(
      (n) => n.type === 'proposal',
    );
    expect(proposalNote?.target).toBe(`/c/garment/${vestido.id}`);
  });
});
