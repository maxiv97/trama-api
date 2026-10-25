import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
  flush,
  MerchantParty,
  newConsignor,
  newMerchant,
  Party,
  received,
} from '../../helpers/fixtures';
import { buildWorld, labels, sentMail, World } from '../../helpers/world';

describe('ReturnsService', () => {
  let w: World;
  let m: MerchantParty;
  let c: Party;

  beforeEach(async () => {
    w = buildWorld();
    m = await newMerchant(w);
    c = await newConsignor(w);
  });

  const awaitingPickup = async () => {
    const garment = await received(w, c, m);
    await w.garments.applyAction(garment.id, 'EXPIRE_SALE', 'system');
    return garment;
  };

  it('registra la devolución con comprobante y avisa al cedente', async () => {
    const garment = await awaitingPickup();
    const returned = await w.returns.create(m.session, {
      garmentId: garment.id,
      identityChecked: true,
      notes: 'Retiró la hermana',
    });
    expect(returned.receiptNumber).toMatch(/^DEV-/);
    expect((await w.garments.getByIdOrFail(garment.id)).status).toBe(
      'returned',
    );
    await flush();
    const call = sentMail(w, 'pickup');
    expect(labels(call)).toEqual(['Comprobante', 'Fecha', 'Punto de venta']);
    await expect(
      w.returns.byGarment(garment.id, c.session),
    ).resolves.toBeTruthy();
    await expect(
      w.returns.byGarment(garment.id, m.session),
    ).resolves.toBeTruthy();
    await expect(
      w.returns.byGarment(garment.id, { ...c.session, id: 'otro' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('el comprobante no depende de resolver el punto de venta', async () => {
    const garment = await awaitingPickup();
    garment.salesPointId = '000000000000000000000000';
    await garment.save();
    await w.returns.create(m.session, {
      garmentId: garment.id,
      identityChecked: true,
    });
    garment.salesPointId = undefined;
    const other = await awaitingPickup();
    other.salesPointId = undefined;
    await other.save();
    await expect(
      w.returns.create(m.session, {
        garmentId: other.id,
        identityChecked: true,
      }),
    ).resolves.toBeTruthy();
  });

  it('valida comercio y estado', async () => {
    const garment = await received(w, c, m);
    await expect(
      w.returns.create(
        { ...m.session, id: 'otro' },
        { garmentId: garment.id, identityChecked: true },
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      w.returns.create(m.session, {
        garmentId: garment.id,
        identityChecked: true,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('registra el destino de una prenda no retirada, con o sin nota', async () => {
    const a = await awaitingPickup();
    await w.garments.applyAction(a.id, 'MARK_UNCLAIMED', 'system');
    const done = await w.returns.registerDisposition(a.id, m.session, {
      disposition: 'kept',
    });
    expect(done.timeline.at(-1)?.note).toBe('Destino: Quedó para el comercio');
    const b = await awaitingPickup();
    await w.garments.applyAction(b.id, 'MARK_UNCLAIMED', 'system');
    const other = await w.returns.registerDisposition(b.id, m.session, {
      disposition: 'other',
      note: 'Reciclaje',
    });
    expect(other.timeline.at(-1)?.note).toBe(
      'Destino: Otro destino. Reciclaje',
    );
    await expect(
      w.returns.registerDisposition(
        b.id,
        { ...m.session, id: 'otro' },
        { disposition: 'donated' },
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
