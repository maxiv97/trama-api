import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  flush,
  MerchantParty,
  newConsignor,
  newMerchant,
  Party,
  proposed,
  received,
} from '../../helpers/fixtures';
import { buildWorld, World } from '../../helpers/world';

describe('GarmentsService', () => {
  let w: World;
  let m: MerchantParty;
  let c: Party;

  beforeEach(async () => {
    w = buildWorld();
    m = await newMerchant(w);
    c = await newConsignor(w);
  });

  it('asigna códigos correlativos y deja la prenda en revisión con su historial', async () => {
    const a = await proposed(w, c, m, 1000, 'A');
    const b = await proposed(w, c, m, 1000, 'B');
    expect(a.code).toBe('TRA-00001');
    expect(b.code).toBe('TRA-00002');
    expect(a.timeline.map((e) => e.status)).toEqual([
      'submitted',
      'under_review',
    ]);
  });

  it('rechaza una categoría que el comercio no ofrece', async () => {
    await expect(
      w.garments.create(c.id, {
        name: 'X',
        category: 'Inexistente',
        brand: 'B',
        size: 'S',
        color: 'Rojo',
        season: 'Verano',
        condition: 'new',
        photos: [],
        merchantId: m.id,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('una prenda sin comercio no notifica a nadie', async () => {
    await w.categories.seedBase();
    const before = w.models.notification.docs().length;
    const garment = await w.garments.create(c.id, {
      name: 'Sin comercio',
      category: 'Camperas y abrigos',
      brand: 'B',
      size: 'S',
      color: 'Rojo',
      season: 'Verano',
      condition: 'new',
      photos: [],
      merchantId: '',
    });
    expect(garment.status).toBe('under_review');
    expect(w.models.notification.docs()).toHaveLength(before);
  });

  it('edición: solo el cedente, solo en revisión y con una categoría válida', async () => {
    const garment = await proposed(w, c, m);
    const fields = {
      name: 'N',
      category: 'Camperas y abrigos',
      brand: 'B',
      size: 'S',
      color: 'C',
      season: 'S',
      condition: 'good' as const,
      description: 'Con capucha',
      photos: ['x'],
      video: 'v.mp4',
    };
    await expect(
      w.garments.editDraft(garment.id, 'otro', fields),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      w.garments.editDraft(garment.id, c.id, { ...fields, category: 'Nada' }),
    ).rejects.toThrow('no está disponible');
    const edited = await w.garments.editDraft(garment.id, c.id, fields);
    expect(edited).toMatchObject({
      description: 'Con capucha',
      video: 'v.mp4',
    });
    await w.proposals.accept(garment.id, m.id);
    await expect(
      w.garments.editDraft(garment.id, c.id, fields),
    ).rejects.toThrow(BadRequestException);
  });

  it('listados por cedente y por comercio, con y sin fotos', async () => {
    const garment = await proposed(w, c, m);
    expect(await w.garments.byConsignor(c.id)).toHaveLength(1);
    expect(await w.garments.byMerchant(m.id)).toHaveLength(1);
    expect(await w.garments.metaByConsignor(c.id)).toHaveLength(1);
    expect(await w.garments.metaByMerchant(m.id)).toHaveLength(1);
    expect(await w.garments.metaByIds([garment.id])).toHaveLength(1);
    expect(await w.garments.metaByIds([])).toEqual([]);
    expect(await w.garments.consignorIdsByMerchant(m.id)).toEqual([c.id]);
    expect(await w.garments.merchantHasConsignor(m.id, c.id)).toBe(true);
    expect(await w.garments.merchantHasConsignor(m.id, 'otro')).toBe(false);
  });

  it('primera foto: solo para las partes de la prenda', async () => {
    const garment = await proposed(w, c, m);
    await expect(
      w.garments.firstPhotoForUser(garment.id, c.id, 'consignor'),
    ).resolves.toBe('data:image/jpeg;base64,AAA');
    await expect(
      w.garments.firstPhotoForUser(garment.id, m.id, 'merchant'),
    ).resolves.toBeTruthy();
    await expect(
      w.garments.firstPhotoForUser(garment.id, c.id, 'merchant'),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      w.garments.firstPhotoForUser(
        '000000000000000000000000',
        c.id,
        'consignor',
      ),
    ).rejects.toThrow(NotFoundException);
    garment.photos = [];
    await garment.save();
    await expect(
      w.garments.firstPhotoForUser(garment.id, c.id, 'consignor'),
    ).resolves.toBeNull();
  });

  it('aplica acciones válidas, avisa a la contraparte y rechaza las inválidas', async () => {
    const garment = await proposed(w, c, m);
    await expect(
      w.garments.applyAction(garment.id, 'REGISTER_SALE', 'merchant'),
    ).rejects.toThrow(ConflictException);
    const cancelled = await w.garments.applyAction(
      garment.id,
      'CANCEL',
      'consignor',
      'Me arrepentí',
    );
    expect(cancelled.status).toBe('cancelled');
    await flush();
    const toMerchant = w.models.notification
      .docs()
      .filter((n) => n.get('userId') === m.id);
    expect(
      toMerchant.some((n) => String(n.get('text')).includes('canceló')),
    ).toBe(true);
    // Acción sin aviso asociado (por ejemplo, el reingreso tras un rechazo).
    const again = await received(w, c, m, 'rejected');
    const count = w.models.notification.docs().length;
    await w.garments.applyAction(again.id, 'REDELIVER', 'consignor');
    expect(w.models.notification.docs()).toHaveLength(count);
  });

  it('un evento sin destinatario no genera aviso', async () => {
    const garment = await proposed(w, c, m);
    garment.merchantId = undefined;
    await garment.save();
    const count = w.models.notification.docs().length;
    await w.garments.applyAction(garment.id, 'CANCEL', 'consignor');
    expect(w.models.notification.docs()).toHaveLength(count);
  });

  it('destino de una prenda no retirada: una sola vez y solo en ese estado', async () => {
    const garment = await received(w, c, m);
    const record = {
      disposition: 'donated' as const,
      date: new Date(),
      handledBy: 'Laura',
    };
    await expect(
      w.garments.registerDisposition(garment.id, record, 'Destino: Donada'),
    ).rejects.toThrow('Solo se registra');
    await w.garments.applyAction(garment.id, 'EXPIRE_SALE', 'system');
    await w.garments.applyAction(garment.id, 'MARK_UNCLAIMED', 'system');
    const done = await w.garments.registerDisposition(
      garment.id,
      record,
      'Destino: Donada',
    );
    expect(done.unclaimedDisposition?.disposition).toBe('donated');
    expect(done.timeline.at(-1)?.note).toBe('Destino: Donada');
    await expect(
      w.garments.registerDisposition(garment.id, record, 'x'),
    ).rejects.toThrow('ya fue registrado');
  });
});
