import { ForbiddenException } from '@nestjs/common';
import {
  MerchantParty,
  newConsignor,
  newMerchant,
  Party,
  sold,
} from '../../helpers/fixtures';
import { buildWorld, World } from '../../helpers/world';

describe('PayoutsService', () => {
  let w: World;
  let m: MerchantParty;
  let c: Party;

  beforeEach(async () => {
    w = buildWorld();
    m = await newMerchant(w);
    c = await newConsignor(w);
  });

  it('agrupa por cedente y mes, y liquida el pago', async () => {
    const a = await sold(w, c, m, 20000, 'A');
    const b = await sold(w, c, m, 10000, 'B');
    const otro = await newConsignor(w, 'Beto');
    await sold(w, otro, m, 5000, 'C');

    let groups = await w.payouts.monthly('merchant', m.id);
    expect(groups).toHaveLength(2);
    const ana = groups.find((g) => g.counterpartId === c.id)!;
    expect(ana).toMatchObject({
      totalAmount: 18000,
      pendingAmount: 18000,
      status: 'pending',
      counterpartDni: '30111222',
      counterpartBankDetails: 'ana.mp',
    });
    expect(ana.unpaidGarmentIds).toHaveLength(2);

    const paid = await w.payouts.settle(m.session, {
      garmentIds: [a.id],
      paymentMethod: 'cash',
    });
    expect(paid).toHaveLength(1);
    await w.payouts.settle(m.session, {
      garmentIds: [b.id],
      paymentMethod: 'transfer',
      receiptNumber: 'T-99',
    });
    groups = await w.payouts.monthly('merchant', m.id);
    expect(groups.find((g) => g.counterpartId === c.id)).toMatchObject({
      status: 'paid',
      paidAmount: 18000,
    });
    expect((await w.garments.getByIdOrFail(a.id)).status).toBe('paid_out');

    const asConsignor = await w.payouts.monthly('consignor', c.id);
    expect(asConsignor[0]).toMatchObject({
      counterpartName: 'Percha Test',
      counterpartDni: undefined,
    });
    const flat = await w.payouts.flat('consignor', c.id);
    expect(flat[0]).toMatchObject({
      consignorId: c.id,
      merchantId: m.id,
      status: 'paid',
    });
    const flatMerchant = await w.payouts.flat('merchant', m.id);
    expect(flatMerchant.every((p) => p.merchantId === m.id)).toBe(true);
  });

  it('una liquidación impaga con el día de pago vencido queda vencida', async () => {
    const garment = await sold(w, c, m);
    const sale = await w.sales.byGarment(garment.id);
    sale!.soldAt = new Date(2025, 0, 15);
    await sale!.save();
    const [group] = await w.payouts.monthly('merchant', m.id);
    expect(group).toMatchObject({ month: '2025-01', status: 'overdue' });
    expect(group.dueDate).toEqual(new Date(2025, 1, 10));
  });

  it('respeta los filtros y no liquida prendas de otro comercio', async () => {
    const garment = await sold(w, c, m);
    expect(
      await w.payouts.monthly('merchant', m.id, {
        from: new Date(2000, 0, 1),
        to: new Date(2000, 1, 1),
      }),
    ).toEqual([]);
    expect(
      await w.payouts.monthly('merchant', m.id, { consignorId: 'otro' }),
    ).toEqual([]);
    await expect(
      w.payouts.settle(
        { ...m.session, id: 'otro' },
        { garmentIds: [garment.id], paymentMethod: 'cash' },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('usa valores de reemplazo si faltan el comercio o el cedente', async () => {
    await sold(w, c, m);
    await w.models.merchant.deleteMany({});
    await w.models.consignor.deleteMany({});
    const [asMerchant] = await w.payouts.monthly('merchant', m.id);
    expect(asMerchant.counterpartName).toBe('—');
    const [asConsignor] = await w.payouts.monthly('consignor', c.id);
    expect(asConsignor.counterpartName).toBe('—');
  });
});
