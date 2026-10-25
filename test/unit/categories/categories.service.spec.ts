import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MerchantParty, newMerchant } from '../../helpers/fixtures';
import { buildWorld, World } from '../../helpers/world';

describe('CategoriesService', () => {
  let w: World;
  let m: MerchantParty;

  beforeEach(async () => {
    w = buildWorld();
    m = await newMerchant(w);
  });

  it('siembra el catálogo base de forma idempotente', async () => {
    const count = w.models.category.docs().length;
    await w.categories.seedBase();
    expect(w.models.category.docs()).toHaveLength(count);
    expect(count).toBeGreaterThanOrEqual(15);
    const all = await w.categories.forMerchant();
    expect(all.every((c) => c.base)).toBe(true);
  });

  it('categorías propias: alta, validaciones, edición y baja', async () => {
    const own = await w.categories.create(m.id, {
      label: ' Vintage ',
      subcategories: [' Remeras ', ''],
      parentLabel: 'Camperas y abrigos',
    });
    expect(own).toMatchObject({
      label: 'Vintage',
      subcategories: ['Remeras'],
      parentLabel: 'Camperas y abrigos',
      base: false,
    });
    await expect(
      w.categories.create(m.id, { label: 'vintage' }),
    ).rejects.toThrow('Ya existe');
    await expect(
      w.categories.create(m.id, { label: 'Otra', parentLabel: 'Nada' }),
    ).rejects.toThrow(BadRequestException);
    expect(
      (await w.categories.forMerchant(m.id)).some((c) => c.label === 'Vintage'),
    ).toBe(true);
    expect(await w.categories.isValidForMerchant('Vintage', m.id)).toBe(true);
    expect(await w.categories.isValidForMerchant('Vintage')).toBe(false);

    const renamed = await w.categories.update(m.id, own.id, {
      label: 'VINTAGE',
      subcategories: ['Sacos'],
      parentLabel: '',
    });
    expect(renamed).toMatchObject({
      label: 'VINTAGE',
      subcategories: ['Sacos'],
      parentLabel: undefined,
    });
    await w.categories.create(m.id, { label: 'Retro' });
    await expect(
      w.categories.update(m.id, own.id, { label: 'Retro' }),
    ).rejects.toThrow('Ya existe');
    await expect(
      w.categories.update(m.id, own.id, { parentLabel: 'Nada' }),
    ).rejects.toThrow(BadRequestException);
    await w.categories.update(m.id, own.id, {});

    const otro = await newMerchant(w);
    await expect(
      w.categories.update(otro.id, own.id, { label: 'X' }),
    ).rejects.toThrow(ForbiddenException);
    const base = w.models.category.docs().find((c) => c.get('base'))!;
    await expect(w.categories.remove(m.id, String(base._id))).rejects.toThrow(
      ForbiddenException,
    );
    await w.categories.remove(m.id, own.id);
    await expect(w.categories.remove(m.id, own.id)).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      w.categories.remove(m.id, '000000000000000000000000'),
    ).rejects.toThrow(NotFoundException);
  });

  it('ocultar categorías base: solo las existentes y solo para ese comercio', async () => {
    const hidden = await w.categories.setHidden(m.id, [
      'Camperas y abrigos',
      ' Camperas y abrigos ',
      'Inventada',
    ]);
    expect(hidden).toEqual(['Camperas y abrigos']);
    expect(
      (await w.categories.forMerchant(m.id)).some(
        (c) => c.label === 'Camperas y abrigos',
      ),
    ).toBe(false);
    expect(
      await w.categories.isValidForMerchant('Camperas y abrigos', m.id),
    ).toBe(false);
    const otro = await newMerchant(w);
    expect(
      await w.categories.isValidForMerchant('Camperas y abrigos', otro.id),
    ).toBe(true);
    expect(await w.categories.isValidForMerchant('Inventada', otro.id)).toBe(
      false,
    );
    await expect(
      w.categories.setHidden('000000000000000000000000', []),
    ).rejects.toThrow('Comercio no encontrado');
  });
});
