import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  agreed,
  flush,
  MerchantParty,
  newConsignor,
  newMerchant,
  Party,
  received,
} from '../../helpers/fixtures';
import { buildWorld, sentMail, World } from '../../helpers/world';

describe('SalesService', () => {
  let w: World;
  let m: MerchantParty;
  let c: Party;

  beforeEach(async () => {
    w = buildWorld();
    m = await newMerchant(w);
    c = await newConsignor(w);
  });

  it('registra la venta con el reparto según la comisión congelada', async () => {
    const garment = await received(w, c, m);
    const sale = await w.sales.create(m.session, {
      garmentId: garment.id,
      actualSalePrice: 18000,
      soldAt: '2026-10-20T12:00:00.000Z',
    });
    expect(sale).toMatchObject({
      consignorAmount: 10800,
      merchantCommission: 7200,
    });
    expect((await w.garments.getByIdOrFail(garment.id)).status).toBe('sold');
    await flush();
    const call = sentMail(w, 'sale');
    expect(call?.details).toEqual(
      expect.arrayContaining([
        { label: 'Lo cobrás', value: 'el día 10 de cada mes' },
      ]),
    );
    expect(await w.sales.byGarment(garment.id)).toBeTruthy();
    expect(await w.sales.byMerchant(m.id)).toHaveLength(1);
  });

  it('valida comercio, estado y acuerdo', async () => {
    const garment = await agreed(w, c, m);
    const dto = {
      garmentId: garment.id,
      actualSalePrice: 1000,
      soldAt: new Date().toISOString(),
    };
    await expect(
      w.sales.create({ id: 'otro', name: 'X', role: 'merchant' }, dto),
    ).rejects.toThrow(ForbiddenException);
    await expect(w.sales.create(m.session, dto)).rejects.toThrow(
      ConflictException,
    );
    const inStock = await received(w, c, m, 'accepted', 'Otra');
    await w.models.agreement.deleteMany({ garmentId: inStock.id });
    await expect(
      w.sales.create(m.session, { ...dto, garmentId: inStock.id }),
    ).rejects.toThrow(NotFoundException);
  });

  it('venta masiva: vende cada prenda a su precio acordado e informa las que fallan', async () => {
    const a = await received(w, c, m, 'accepted', 'A');
    const b = await received(w, c, m, 'with_remarks', 'B');
    const sinAcuerdo = await received(w, c, m, 'accepted', 'C');
    await w.models.agreement.deleteMany({ garmentId: sinAcuerdo.id });
    const result = await w.sales.bulkCreate(m.session, {
      garmentIds: [a.id, b.id, sinAcuerdo.id, '000000000000000000000000'],
      soldAt: new Date().toISOString(),
    });
    expect(result.sold).toEqual([a.id, b.id]);
    expect(result.failed.map((f) => f.garmentId)).toEqual([
      sinAcuerdo.id,
      '000000000000000000000000',
    ]);
    const sale = await w.sales.byGarment(a.id);
    expect(sale?.actualSalePrice).toBe(16667);
  });

  it('la venta no se frena si el comercio ya no existe', async () => {
    const garment = await received(w, c, m);
    await w.models.merchant.deleteMany({});
    await expect(
      w.sales.create(m.session, {
        garmentId: garment.id,
        actualSalePrice: 1000,
        soldAt: new Date().toISOString(),
      }),
    ).resolves.toBeTruthy();
  });

  it('marca el pago de una venta', async () => {
    const garment = await received(w, c, m);
    await w.sales.create(m.session, {
      garmentId: garment.id,
      actualSalePrice: 1000,
      soldAt: new Date().toISOString(),
    });
    const paid = await w.sales.markPaid(garment.id, {
      paymentMethod: 'transfer',
      receiptNumber: 'T-1',
    });
    expect(paid.paidAt).toBeInstanceOf(Date);
    await expect(
      w.sales.markPaid('nada', { paymentMethod: 'cash' }),
    ).rejects.toThrow(NotFoundException);
  });
});
