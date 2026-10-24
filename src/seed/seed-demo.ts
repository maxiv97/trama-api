import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import {
  DEMO_CONSIGNORS,
  DEMO_DEADLINE_SCENARIOS,
  DEMO_DEADLINES_CONSIGNOR_KEY,
  DEMO_MERCHANT_EMAIL,
} from './demo-data';
import { SeedService } from './seed.service';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);
  await app.get(SeedService).seedDemoMerchant();
  await app.close();

  const consignor = DEMO_CONSIGNORS.find(
    (c) => c.key === DEMO_DEADLINES_CONSIGNOR_KEY,
  );
  console.log(`
Lote de demostración listo (contraseña de todas las cuentas: trama1234).
  Comercio: ${DEMO_MERCHANT_EMAIL}
  Cedente del recorrido de plazos: ${consignor?.email} (${consignor?.name})

Prendas de ${consignor?.name} con plazos sin procesar:
${DEMO_DEADLINE_SCENARIOS.map((s) => `  · ${s.label}`).join('\n')}

Para procesarlas como lo haría la tarea de las 3:00:
  npm run deadlines:run
Para simular que pasan los días (por ejemplo, una semana):
  npm run deadlines:run -- --days 7
`);
}

void run();
