import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { addDays, DAY_MS } from '../shared/domain/terms';
import { DeadlinesService } from './deadlines.service';

/**
 * Ejecuta en el momento la tarea diaria de plazos (la misma que corre a las 3:00), para probar
 * en local los vencimientos y los avisos sin esperar al horario programado.
 *
 *   npm run deadlines:run                       procesa los plazos a la fecha de hoy
 *   npm run deadlines:run -- --days 7           simula los próximos 7 días, uno por uno
 *   npm run deadlines:run -- --until 2026-11-15 simula día por día hasta esa fecha
 *
 * Al simular varios días, la tarea se ejecuta una vez por cada día, como en producción: así cada
 * vencimiento cae en "su" día y emite su aviso (un vencimiento de más de dos días se aplica sin
 * avisar). La fecha simulada solo decide qué plazos vencen: los eventos y los avisos quedan
 * registrados con la fecha real. La tarea es idempotente; para volver al punto de partida,
 * `npm run seed:demo` regenera el lote de demostración.
 */
function daysToSimulate(args: string[], today: Date): number {
  const value = (flag: string): string | undefined => {
    const i = args.findIndex((a) => a === flag || a.startsWith(`${flag}=`));
    if (i === -1) return undefined;
    return args[i].includes('=') ? args[i].split('=')[1] : args[i + 1];
  };
  const days = value('--days');
  const until = value('--until');
  if (days !== undefined) {
    const n = Number(days);
    if (!Number.isInteger(n) || n < 0 || n > 400) {
      throw new Error('--days debe ser un entero entre 0 y 400');
    }
    return n;
  }
  if (until !== undefined) {
    const target = new Date(`${until}T12:00:00-03:00`);
    if (Number.isNaN(target.getTime())) {
      throw new Error('--until debe tener el formato AAAA-MM-DD');
    }
    const n = Math.ceil((target.getTime() - today.getTime()) / DAY_MS);
    if (n < 0 || n > 400) {
      throw new Error(
        '--until debe ser una fecha entre hoy y los próximos 400 días',
      );
    }
    return n;
  }
  return 0;
}

async function run() {
  const today = new Date();
  const days = daysToSimulate(process.argv.slice(2), today);
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  try {
    const deadlines = app.get(DeadlinesService);
    const total = {
      deliveryExpired: 0,
      saleExpired: 0,
      unclaimed: 0,
      notifications: 0,
    };
    for (let day = 0; day <= days; day += 1) {
      const now = addDays(today, day);
      const result = await deadlines.run(now);
      for (const key of Object.keys(total) as (keyof typeof total)[])
        total[key] += result[key];
      const changes = [
        result.deliveryExpired &&
          `${result.deliveryExpired} entrega(s) vencida(s)`,
        result.saleExpired && `${result.saleExpired} venta(s) terminada(s)`,
        result.unclaimed && `${result.unclaimed} no retirada(s)`,
        result.notifications && `${result.notifications} aviso(s)`,
      ].filter(Boolean);
      console.log(
        `${now.toLocaleDateString('es-AR')}: ${changes.length ? changes.join(' · ') : 'sin novedades'}`,
      );
    }
    if (days > 0) {
      console.log(
        `Total: ${total.deliveryExpired} entregas vencidas · ${total.saleExpired} ventas terminadas (pasan a Por retirar) · ${total.unclaimed} no retiradas · ${total.notifications} avisos`,
      );
    }
  } finally {
    await app.close();
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
