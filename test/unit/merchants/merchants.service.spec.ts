import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  agreed,
  MerchantParty,
  newConsignor,
  newMerchant,
  Party,
} from '../../helpers/fixtures';
import { buildWorld, World } from '../../helpers/world';

const POINT = {
  name: 'Sucursal Güemes',
  address: 'Belgrano 800',
  phone: '351-4444444',
  geo: { lat: -31.43, lng: -64.19 },
  receptionSchedule: {
    days: 'Sáb',
    hours: '10 a 14',
    instructions: 'Por la puerta lateral',
  },
};

describe('Comercios, puntos de venta, cedentes y acuerdos', () => {
  let w: World;
  let m: MerchantParty;
  let c: Party;

  beforeEach(async () => {
    w = buildWorld();
    m = await newMerchant(w);
    c = await newConsignor(w);
  });

  it('MerchantsService: lista, consulta y actualiza conservando los plazos no enviados', async () => {
    expect(await w.merchants.list()).toHaveLength(1);
    await expect(
      w.merchants.getByIdOrFail('000000000000000000000000'),
    ).rejects.toThrow(NotFoundException);
    const dto = {
      businessName: 'Percha Nueva',
      email: 'nuevo@test.com',
      phone: '1',
      location: { neighborhood: 'Güemes', city: 'Córdoba' },
      commissionConfig: { consignorPercentage: 70, merchantPercentage: 30 },
      terms: { saleWindowMonths: 4, payoutDay: 5 },
    };
    let updated = await w.merchants.update(m.id, dto);
    expect(updated.terms).toMatchObject({
      saleWindowMonths: 4,
      deliveryDays: 7,
      pickupDays: 15,
      payoutDay: 5,
    });
    updated = await w.merchants.update(m.id, {
      ...dto,
      terms: { ...dto.terms, deliveryDays: 3, pickupDays: 30 },
    });
    expect(updated.terms).toMatchObject({ deliveryDays: 3, pickupDays: 30 });
    expect(updated.get('email')).toBe('nuevo@test.com');
  });

  it('SalesPointsService: alta, edición y consultas', async () => {
    const created = await w.salesPoints.create(m.id, POINT);
    expect(created).toMatchObject({
      name: 'Sucursal Güemes',
      merchantId: m.id,
    });
    const id = String((created as unknown as { _id: unknown })._id);
    expect(await w.salesPoints.byMerchant(m.id)).toHaveLength(2);
    expect(await w.salesPoints.list()).toHaveLength(2);
    expect((await w.salesPoints.getById(id)).name).toBe('Sucursal Güemes');
    const updated = await w.salesPoints.update(m.id, id, {
      ...POINT,
      name: 'Güemes',
    });
    expect(updated.name).toBe('Güemes');
    await expect(
      w.salesPoints.update(m.id, '000000000000000000000000', POINT),
    ).rejects.toThrow(NotFoundException);
    await expect(
      w.salesPoints.getById('000000000000000000000000'),
    ).rejects.toThrow(NotFoundException);
    await expect(
      w.salesPoints.byMerchant('000000000000000000000000'),
    ).rejects.toThrow('Comercio no encontrado');
  });

  it('ConsignorsService: el comercio solo ve a sus cedentes', async () => {
    await agreed(w, c, m);
    const otro = await newConsignor(w, 'Beto');
    expect(await w.consignors.list()).toHaveLength(2);
    expect((await w.consignors.byMerchant(m.id)).map((x) => x.id)).toEqual([
      c.id,
    ]);
    await expect(
      w.consignors.getForMerchantOrFail(c.id, m.id),
    ).resolves.toBeTruthy();
    await expect(
      w.consignors.getForMerchantOrFail(otro.id, m.id),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      w.consignors.getByIdOrFail('000000000000000000000000'),
    ).rejects.toThrow(NotFoundException);
  });

  it('AgreementsService: acuerdos por usuario, por prenda y por plazo', async () => {
    const garment = await agreed(w, c, m);
    expect(await w.agreements.listForUser('merchant', m.id)).toHaveLength(1);
    expect(await w.agreements.listForUser('consignor', c.id)).toHaveLength(1);
    expect(await w.agreements.byGarmentIds([garment.id])).toHaveLength(1);
    expect(await w.agreements.withoutDeliveryDeadline()).toHaveLength(0);
    expect(
      await w.agreements.dueBy(
        'deliveryDeadline',
        new Date(Date.now() + 30 * 86400000),
      ),
    ).toHaveLength(1);
    expect(
      await w.agreements.startSaleWindow('nada', new Date(), {
        saleWindowMonths: 3,
        pickupDays: 15,
      }),
    ).toBeNull();
    expect(
      await w.agreements.restartDelivery('nada', new Date(), 7),
    ).toBeNull();
    const ag = await w.agreements.byGarment(garment.id);
    ag!.set('deliveryDays', undefined);
    await ag!.save();
    const restarted = await w.agreements.restartDelivery(
      garment.id,
      new Date(),
      5,
    );
    expect(restarted?.deliveryDays).toBe(5);
  });
});
