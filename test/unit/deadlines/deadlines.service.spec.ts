import { addDays } from '../../../src/shared/domain/terms';
import {
  agreed,
  flush,
  MerchantParty,
  newConsignor,
  newMerchant,
  Party,
  received,
} from '../../helpers/fixtures';
import { buildWorld, labels, sentMails, World } from '../../helpers/world';

describe('DeadlinesService', () => {
  let w: World;
  let m: MerchantParty;
  let c: Party;

  beforeEach(async () => {
    w = buildWorld();
    m = await newMerchant(w);
    c = await newConsignor(w);
  });

  const texts = (userId: string) =>
    w.models.notification
      .docs()
      .filter((n) => n.get('userId') === userId)
      .map((n) => n.get('text') as string);

  const agreement = async (garmentId: string) =>
    (await w.agreements.byGarment(garmentId))!;
  const status = async (garmentId: string) =>
    (await w.garments.getByIdOrFail(garmentId)).status;

  it('entrega: recordatorio previo y vencimiento con aviso a ambas partes, una sola vez', async () => {
    const garment = await agreed(w, c, m, 1000, 'Pollera');
    const deadline = (await agreement(garment.id)).deliveryDeadline!;
    let result = await w.deadlines.run(addDays(deadline, -1));
    expect(result).toMatchObject({ deliveryExpired: 0, notifications: 1 });
    expect(
      texts(c.id).some((t) =>
        t.startsWith('Recordá entregar "Pollera" en Local Centro'),
      ),
    ).toBe(true);
    result = await w.deadlines.run(addDays(deadline, 0.1));
    expect(result).toMatchObject({ deliveryExpired: 1, notifications: 2 });
    expect(await status(garment.id)).toBe('delivery_expired');
    expect(texts(m.id).some((t) => t.includes('no entregó "Pollera"'))).toBe(
      true,
    );
    expect(await w.deadlines.run(addDays(deadline, 0.2))).toEqual({
      deliveryExpired: 0,
      saleExpired: 0,
      unclaimed: 0,
      notifications: 0,
    });
  });

  it('venta: pasa a Por retirar con el plazo para retirar y agrupa los avisos del mismo día', async () => {
    const a = await received(w, c, m, 'accepted', 'Remera');
    const b = await received(w, c, m, 'with_remarks', 'Short');
    const deadline = (await agreement(a.id)).saleDeadline;
    for (const g of [b]) {
      const ag = await agreement(g.id);
      ag.saleDeadline = deadline;
      await ag.save();
    }
    await w.deadlines.run(addDays(deadline, -3));
    expect(
      texts(c.id).some((t) =>
        t.startsWith('2 prendas terminan su período de venta el'),
      ),
    ).toBe(true);
    const result = await w.deadlines.run(addDays(deadline, 0.5));
    expect(result.saleExpired).toBe(2);
    expect(await status(a.id)).toBe('awaiting_pickup');
    const after = await agreement(a.id);
    expect(
      Math.round(
        (after.pickupDeadline!.getTime() - deadline.getTime()) / 86400000,
      ),
    ).toBe(15);
    expect(
      texts(c.id).some((t) =>
        t.startsWith('2 prendas no se vendieron. Retiralas en Local Centro'),
      ),
    ).toBe(true);
    expect(
      texts(m.id).some((t) =>
        t.startsWith('2 prendas de Ana Prueba terminaron su período de venta'),
      ),
    ).toBe(true);
    await flush();
    const mail = sentMails(w).find((sent) =>
      sent.text.startsWith('2 prendas no se vendieron'),
    );
    expect(labels(mail)).toEqual([
      'Prendas',
      'Dónde',
      'Horario',
      'Retirala antes del',
      'Llevá',
    ]);
    expect(mail?.url).toBe('http://localhost:4200/c');
  });

  it('retiro: recordatorio y no retirada', async () => {
    const garment = await received(w, c, m, 'accepted', 'Saco');
    const sale = (await agreement(garment.id)).saleDeadline;
    await w.deadlines.run(addDays(sale, 0.1));
    const pickup = (await agreement(garment.id)).pickupDeadline!;
    await w.deadlines.run(addDays(pickup, -2));
    expect(
      texts(c.id).some((t) =>
        t.startsWith('Te quedan pocos días para retirar "Saco"'),
      ),
    ).toBe(true);
    const result = await w.deadlines.run(addDays(pickup, 0.1));
    expect(result.unclaimed).toBe(1);
    expect(await status(garment.id)).toBe('unclaimed');
    expect(
      texts(c.id).some((t) =>
        t.startsWith('Venció el plazo para retirar "Saco"'),
      ),
    ).toBe(true);
    expect(
      texts(m.id).some((t) => t.includes('no retiró "Saco" a tiempo')),
    ).toBe(true);
  });

  it('vencimientos viejos: se aplican sin avisar y el retiro corre desde hoy', async () => {
    const garment = await received(w, c, m, 'accepted', 'Viejo');
    const ag = await agreement(garment.id);
    const now = addDays(ag.saleDeadline, 10);
    const before = w.models.notification.docs().length;
    const result = await w.deadlines.run(now);
    expect(result).toMatchObject({ saleExpired: 1, notifications: 0 });
    expect(w.models.notification.docs()).toHaveLength(before);
    const after = await agreement(garment.id);
    expect(
      Math.round((after.pickupDeadline!.getTime() - now.getTime()) / 86400000),
    ).toBe(15);
  });

  it('acuerdos sin plazo de entrega reciben el plazo completo desde hoy', async () => {
    const pending = await agreed(w, c, m, 1000, 'Legado');
    const done = await received(w, c, m, 'accepted', 'Recibida');
    for (const id of [pending.id, done.id]) {
      const ag = await agreement(id);
      ag.set('deliveryDeadline', undefined);
      ag.set('deliveryDays', undefined);
      await ag.save();
    }
    const orphan = await agreed(w, c, m, 1000, 'Huérfana');
    const orphanAg = await agreement(orphan.id);
    orphanAg.set('deliveryDeadline', undefined);
    orphanAg.garmentId = '000000000000000000000000';
    await orphanAg.save();
    const now = new Date();
    await w.deadlines.run(now);
    const after = await agreement(pending.id);
    expect(after.deliveryDays).toBe(7);
    expect(
      Math.round(
        (after.deliveryDeadline!.getTime() - now.getTime()) / 86400000,
      ),
    ).toBe(7);
    expect((await agreement(done.id)).deliveryDeadline).toBeUndefined();
  });

  it('prendas sin comercio, sin punto de venta o con datos faltantes', async () => {
    const garment = await received(w, c, m, 'accepted', 'Suelta');
    const ag = await agreement(garment.id);
    ag.set('pickupDays', undefined);
    await ag.save();
    const doc = await w.garments.getByIdOrFail(garment.id);
    doc.salesPointId = '000000000000000000000000';
    await doc.save();
    await w.models.consignor.deleteMany({});
    const result = await w.deadlines.run(addDays(ag.saleDeadline, 0.1));
    expect(result.saleExpired).toBe(1);
    expect((await agreement(garment.id)).pickupDays).toBe(15);
    expect(
      texts(m.id).some((t) =>
        t.startsWith(
          '"Suelta" terminó su período de venta sin venderse: sacala de exhibición. El cedente',
        ),
      ),
    ).toBe(true);
    expect(
      texts(c.id).some((t) =>
        t.startsWith('"Suelta" no se vendió. Retirala antes del'),
      ),
    ).toBe(true);

    const lonely = await received(w, c, m, 'accepted', 'Sin comercio');
    const lonelyDoc = await w.garments.getByIdOrFail(lonely.id);
    lonelyDoc.merchantId = undefined;
    lonelyDoc.salesPointId = undefined;
    await lonelyDoc.save();
    const lonelyAg = await agreement(lonely.id);
    lonelyAg.set('pickupDays', undefined);
    await lonelyAg.save();
    await w.deadlines.run(addDays(lonelyAg.saleDeadline, 0.1));
    expect((await agreement(lonely.id)).pickupDays).toBe(15);
  });

  it('varias prendas: textos en plural para cada aviso', async () => {
    const a = await agreed(w, c, m, 1000, 'A');
    const b = await agreed(w, c, m, 1000, 'B');
    const deadline = (await agreement(a.id)).deliveryDeadline!;
    const bAg = await agreement(b.id);
    bAg.deliveryDeadline = deadline;
    await bAg.save();
    await w.deadlines.run(addDays(deadline, -1));
    expect(
      texts(c.id).some((t) => t.startsWith('Recordá entregar 2 prendas')),
    ).toBe(true);
    await w.deadlines.run(addDays(deadline, 0.1));
    expect(texts(m.id).some((t) => t.includes('no entregó 2 prendas'))).toBe(
      true,
    );

    const x = await received(w, c, m, 'accepted', 'X');
    const y = await received(w, c, m, 'accepted', 'Y');
    const sale = (await agreement(x.id)).saleDeadline;
    const yAg = await agreement(y.id);
    yAg.saleDeadline = sale;
    await yAg.save();
    await w.deadlines.run(addDays(sale, 0.1));
    const pickup = (await agreement(x.id)).pickupDeadline!;
    await w.deadlines.run(addDays(pickup, -1));
    expect(
      texts(c.id).some((t) =>
        t.startsWith('Te quedan pocos días para retirar 2 prendas'),
      ),
    ).toBe(true);
    await w.deadlines.run(addDays(pickup, 0.1));
    expect(
      texts(c.id).some((t) => t.includes('dispondrá de las prendas')),
    ).toBe(true);
  });

  it('la tarea programada registra el resultado y no se cae ante un error', async () => {
    const spy = jest.spyOn(w.deadlines, 'run');
    await w.deadlines.scheduledRun();
    expect(spy).toHaveBeenCalled();
    spy.mockRejectedValueOnce(new Error('base caída'));
    await expect(w.deadlines.scheduledRun()).resolves.toBeUndefined();
  });
});
