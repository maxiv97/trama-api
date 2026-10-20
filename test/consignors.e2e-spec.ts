import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { SeedService } from './../src/seed/seed.service';

interface ConsignorBody {
  id: string;
  name: string;
  dni: string;
  role: string;
}

describe('Consignors (e2e)', () => {
  let app: INestApplication<App>;
  let mongo: MongoMemoryServer;
  let consignorToken: string;
  let merchantToken: string;
  let merchantId: string;
  let anaId: string;

  const login = (email: string) =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'trama1234' });

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

    const ana = await login('ana@example.com');
    consignorToken = ana.body.token;
    anaId = ana.body.user.id;
    const merchant = await login('contacto@tramaboutique.com');
    merchantToken = merchant.body.token;
    merchantId = merchant.body.user.id;
  }, 120000);

  afterAll(async () => {
    await app.close();
    await mongo.stop();
  });

  it('rejects a consignor accessing the consignors list (DEF-02)', async () => {
    await request(app.getHttpServer())
      .get('/api/consignors')
      .set('Authorization', `Bearer ${consignorToken}`)
      .expect(403);
  });

  it('returns only the consignors that operate with the merchant', async () => {
    // Sin prendas todavía, el comercio no tiene cedentes vinculados.
    const empty = await request(app.getHttpServer())
      .get('/api/consignors')
      .set('Authorization', `Bearer ${merchantToken}`)
      .expect(200);
    expect(empty.body).toHaveLength(0);

    await request(app.getHttpServer())
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

    const res = await request(app.getHttpServer())
      .get('/api/consignors')
      .set('Authorization', `Bearer ${merchantToken}`)
      .expect(200);
    const names = (res.body as ConsignorBody[]).map((c) => c.name);
    expect(names).toEqual(['Ana Gómez']);
    const ana = (res.body as ConsignorBody[])[0];
    expect(ana.dni).toBe('32.111.222');
  });

  it('getById: a consignor cannot read, a merchant only its own consignors (DEF-03)', async () => {
    // Un cedente no puede leer los datos de ningún cedente.
    await request(app.getHttpServer())
      .get(`/api/consignors/${anaId}`)
      .set('Authorization', `Bearer ${consignorToken}`)
      .expect(403);

    // El comercio sí puede leer a Ana, que ya opera con él (prenda del test anterior).
    await request(app.getHttpServer())
      .get(`/api/consignors/${anaId}`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .expect(200);

    // Pero no a Luis, que no le consignó nada.
    const luis = await login('luis@example.com');
    await request(app.getHttpServer())
      .get(`/api/consignors/${luis.body.user.id}`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .expect(403);

    // Id inexistente → 404.
    await request(app.getHttpServer())
      .get('/api/consignors/64b000000000000000000000')
      .set('Authorization', `Bearer ${merchantToken}`)
      .expect(404);
  });
});
