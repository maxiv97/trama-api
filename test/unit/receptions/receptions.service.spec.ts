import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
  agreed,
  flush,
  MerchantParty,
  newConsignor,
  newMerchant,
  Party,
} from '../../helpers/fixtures';
import {
  buildWorld,
  labels,
  sentMail,
  sentMails,
  World,
} from '../../helpers/world';

const DAY = 86400000;

describe('ReceptionsService', () => {
  let w: World;
  let m: MerchantParty;
  let c: Party;

  beforeEach(async () => {
    w = buildWorld();
    m = await newMerchant(w);
    c = await newConsignor(w);
  });

  const receive = (
    garmentId: string,
    result: 'accepted' | 'with_remarks' | 'rejected',
    salesPointId = m.salesPointId,
  ) =>
    w.receptions.create(m.session, {
      garmentId,
      salesPointId,
      result,
      discrepancies: result === 'accepted' ? [] : ['damage', 'hygiene'],
      evidence: [],
    });

  it('conforme: pone la prenda en stock, inicia la ventana de venta y el plazo de retiro', async () => {
    const garment = await agreed(w, c, m);
    const reception = await receive(garment.id, 'accepted');
    expect(reception.receiptNumber).toMatch(/^REC-/);
    expect((await w.garments.getByIdOrFail(garment.id)).status).toBe(
      'in_stock',
    );
    const agreement = await w.agreements.byGarment(garment.id);
    const pickup =
      (agreement!.pickupDeadline!.getTime() -
        agreement!.saleDeadline.getTime()) /
      DAY;
    expect(Math.round(pickup)).toBe(15);
    await flush();
    const call = sentMail(w, 'reception');
    expect(labels(call)).toEqual(
      expect.arrayContaining([
        'Precio de exhibición',
        'En venta hasta',
        'Si no se vende',
      ]),
    );
  });

  it('con observaciones: detalla las observaciones en el aviso', async () => {
    const garment = await agreed(w, c, m);
    await receive(garment.id, 'with_remarks');
    expect((await w.garments.getByIdOrFail(garment.id)).status).toBe(
      'with_remarks',
    );
    await flush();
    const call = sentMail(w, 'reception');
    expect(call?.details).toEqual(
      expect.arrayContaining([
        { label: 'Observaciones', value: 'Daño, Higiene' },
      ]),
    );
    expect(await w.receptions.byGarment(garment.id)).toBeTruthy();
    expect(await w.receptions.byGarmentIds([garment.id])).toHaveLength(1);
  });

  it('rechazada: corre un nuevo plazo de entrega desde el rechazo y avisa dónde retirarla', async () => {
    const garment = await agreed(w, c, m);
    const agreement = await w.agreements.byGarment(garment.id);
    agreement!.notices = ['delivery_reminder'];
    await agreement!.save();
    const reception = await receive(garment.id, 'rejected');
    const after = await w.agreements.byGarment(garment.id);
    expect(
      Math.round(
        (after!.deliveryDeadline!.getTime() - reception.receivedAt.getTime()) /
          DAY,
      ),
    ).toBe(7);
    expect(after!.notices).toEqual([]);
    await flush();
    const call = sentMail(w, 'reception');
    expect(labels(call)).toEqual([
      'Motivo',
      'Retiralo en',
      'Nueva entrega antes del',
    ]);
  });

  it('rechazada en un punto inexistente: el aviso conserva el motivo', async () => {
    const garment = await agreed(w, c, m);
    await receive(garment.id, 'rejected', '000000000000000000000000');
    await flush();
    const call = sentMail(w, 'reception');
    expect(labels(call)).toEqual(['Motivo', 'Nueva entrega antes del']);
  });

  it('acuerdos anteriores a los plazos: toma la configuración del comercio o los valores por defecto', async () => {
    const garment = await agreed(w, c, m);
    const agreement = await w.agreements.byGarment(garment.id);
    agreement!.set('saleWindowMonths', undefined);
    agreement!.set('pickupDays', undefined);
    await agreement!.save();
    // Un comercio que ya no existe: usa 3 meses y 15 días.
    const merchant = await w.users.findMerchantById(m.id);
    await w.receptions.create(
      { ...m.session },
      {
        garmentId: garment.id,
        salesPointId: m.salesPointId,
        result: 'accepted',
        discrepancies: [],
        evidence: [],
      },
    );
    const after = await w.agreements.byGarment(garment.id);
    expect(after).toMatchObject({
      saleWindowMonths: merchant!.terms.saleWindowMonths,
      pickupDays: 15,
    });
  });

  it('valida el comercio y la transición', async () => {
    const garment = await agreed(w, c, m);
    await expect(
      w.receptions.create(
        { id: 'otro', name: 'X', role: 'merchant' },
        {
          garmentId: garment.id,
          salesPointId: m.salesPointId,
          result: 'accepted',
          discrepancies: [],
          evidence: [],
        },
      ),
    ).rejects.toThrow(ForbiddenException);
    await receive(garment.id, 'accepted');
    await expect(receive(garment.id, 'accepted')).rejects.toThrow(
      ConflictException,
    );
  });
  it('sin la configuración del comercio usa los plazos por defecto', async () => {
    const a = await agreed(w, c, m, 1000, 'A');
    const b = await agreed(w, c, m, 1000, 'B');
    for (const id of [a.id, b.id]) {
      const ag = await w.agreements.byGarment(id);
      ag!.set('saleWindowMonths', undefined);
      ag!.set('pickupDays', undefined);
      ag!.set('deliveryDays', undefined);
      await ag!.save();
    }
    await w.models.merchant.deleteMany({});
    await receive(a.id, 'accepted');
    expect(await w.agreements.byGarment(a.id)).toMatchObject({
      saleWindowMonths: 3,
      pickupDays: 15,
    });
    await receive(b.id, 'rejected');
    expect((await w.agreements.byGarment(b.id))?.deliveryDays).toBe(7);
  });

  it('el aviso no depende del acuerdo: sin acuerdo no informa precio ni plazos', async () => {
    const a = await agreed(w, c, m, 1000, 'A');
    const ag = await w.agreements.byGarment(a.id);
    ag!.set('pickupDays', 0);
    await ag!.save();
    await w.receptions.create(m.session, {
      garmentId: a.id,
      salesPointId: m.salesPointId,
      result: 'with_remarks',
      discrepancies: [],
      evidence: [],
    });
    const b = await agreed(w, c, m, 1000, 'B');
    await w.models.agreement.deleteMany({ garmentId: b.id });
    await receive(b.id, 'rejected');
    const d = await agreed(w, c, m, 1000, 'D');
    await w.models.agreement.deleteMany({ garmentId: d.id });
    await receive(d.id, 'accepted');
    // El acuerdo se lee bien para iniciar la ventana de venta y falla al armar el aviso.
    const e = await agreed(w, c, m, 1000, 'E');
    const real = w.agreements.byGarment.bind(w.agreements);
    jest
      .spyOn(w.agreements, 'byGarment')
      .mockImplementationOnce(real)
      .mockRejectedValue(new Error('base caída'));
    await expect(receive(e.id, 'accepted')).resolves.toBeTruthy();
    await flush();
    const all = sentMails(w)
      .filter((mail) => mail.type === 'reception')
      .map(labels);
    expect(all[0]).toEqual(['Precio de exhibición', 'En venta hasta']);
    expect(all[1]).toEqual(['Motivo', 'Retiralo en']);
    expect(all[2]).toEqual([]);
  });
});
