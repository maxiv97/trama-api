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
  proposed,
} from '../../helpers/fixtures';
import {
  buildWorld,
  labels,
  sentMail,
  sentMails,
  World,
} from '../../helpers/world';

describe('ProposalsService', () => {
  let w: World;
  let m: MerchantParty;
  let c: Party;

  beforeEach(async () => {
    w = buildWorld();
    m = await newMerchant(w);
    c = await newConsignor(w);
  });

  it('crea la propuesta con el precio de venta según la comisión del comercio', async () => {
    const garment = await proposed(w, c, m, 6000);
    const proposal = await w.proposals.byGarment(garment.id);
    expect(proposal).toMatchObject({
      status: 'under_review',
      requestedConsignorPrice: 6000,
      calculatedSalePrice: 10000,
    });
    expect(garment.status).toBe('under_review');
    // El comercio recibe el aviso de la nueva propuesta.
    expect(
      w.models.notification
        .docs()
        .some((n) => n.get('userId') === m.id && n.get('type') === 'proposal'),
    ).toBe(true);
  });

  it('no deja proponer una prenda ajena ni de una prenda sin comercio', async () => {
    const garment = await proposed(w, c, m);
    const other = await newConsignor(w, 'Otra');
    await expect(
      w.proposals.create(other.id, {
        garmentId: garment.id,
        requestedConsignorPrice: 1,
      }),
    ).rejects.toThrow(ForbiddenException);
    garment.merchantId = undefined;
    await garment.save();
    await expect(
      w.proposals.create(c.id, {
        garmentId: garment.id,
        requestedConsignorPrice: 1,
      }),
    ).rejects.toThrow(NotFoundException);
    garment.merchantId = 'inexistente';
    await garment.save();
    await expect(
      w.proposals.create(c.id, {
        garmentId: garment.id,
        requestedConsignorPrice: 1,
      }),
    ).rejects.toThrow('Comercio no encontrado');
  });

  it('acepta: congela el acuerdo con los plazos del comercio y avisa con dónde entregar', async () => {
    const garment = await proposed(w, c, m, 6000);
    await w.proposals.accept(garment.id, m.id);
    await flush();
    const agreement = await w.agreements.byGarment(garment.id);
    expect(agreement).toMatchObject({
      agreedConsignorPrice: 6000,
      agreedSalePrice: 10000,
      appliedCommission: 40,
      deliveryDays: 7,
      pickupDays: 15,
    });
    const days = Math.round(
      ((agreement?.deliveryDeadline?.getTime() ?? 0) -
        agreement!.agreedAt.getTime()) /
        86400000,
    );
    expect(days).toBe(7);
    expect((await w.garments.getByIdOrFail(garment.id)).status).toBe('agreed');
    const mailCall = sentMail(w, 'agreement');
    expect(labels(mailCall)).toEqual(
      expect.arrayContaining([
        'Vas a cobrar',
        'Dónde entregar',
        'Recepción',
        'Entregala antes del',
      ]),
    );
  });

  it('acepta aunque no pueda resolver el punto de venta', async () => {
    const garment = await proposed(w, c, m);
    garment.salesPointId = '000000000000000000000000';
    await garment.save();
    await expect(w.proposals.accept(garment.id, m.id)).resolves.toMatchObject({
      status: 'agreed',
    });
  });

  it('solo el comercio de la prenda puede aceptar o contraofertar, y en el estado correcto', async () => {
    const garment = await proposed(w, c, m);
    const otro = await newMerchant(w);
    await expect(w.proposals.accept(garment.id, otro.id)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      w.proposals.counteroffer(garment.id, otro.id, 5000),
    ).rejects.toThrow(ForbiddenException);
    await w.proposals.accept(garment.id, m.id);
    await expect(w.proposals.accept(garment.id, m.id)).rejects.toThrow(
      ConflictException,
    );
    await expect(
      w.proposals.counteroffer(garment.id, m.id, 5000),
    ).rejects.toThrow(ConflictException);
  });

  it('contraoferta y aceptación del cedente', async () => {
    const garment = await proposed(w, c, m, 9000);
    const counter = await w.proposals.counteroffer(garment.id, m.id, 6000);
    expect(counter.counteroffer).toMatchObject({
      consignorPrice: 6000,
      salePrice: 10000,
    });
    expect(counter.status).toBe('counteroffer');
    await expect(
      w.proposals.acceptCounteroffer(garment.id, 'otro'),
    ).rejects.toThrow(ForbiddenException);
    const done = await w.proposals.acceptCounteroffer(garment.id, c.id);
    expect(done.status).toBe('agreed');
    const agreement = await w.agreements.byGarment(garment.id);
    expect(agreement?.agreedConsignorPrice).toBe(6000);
    await flush();
    const mailCall = sentMails(w).find(
      (mail) =>
        mail.type === 'agreement' && labels(mail).includes('Plazo de entrega'),
    );
    expect(mailCall).toBeDefined();
  });

  it('acepta la contraoferta aunque falte el punto de venta, y exige que exista una', async () => {
    const garment = await proposed(w, c, m, 9000);
    await expect(
      w.proposals.acceptCounteroffer(garment.id, c.id),
    ).rejects.toThrow('No hay contraoferta');
    await w.proposals.counteroffer(garment.id, m.id, 6000);
    garment.salesPointId = undefined;
    await garment.save();
    await expect(
      w.proposals.acceptCounteroffer(garment.id, c.id),
    ).resolves.toMatchObject({ status: 'agreed' });
  });

  it('el punto de venta inexistente no frena la contraoferta aceptada', async () => {
    const garment = await proposed(w, c, m, 9000);
    await w.proposals.counteroffer(garment.id, m.id, 6000);
    garment.salesPointId = '000000000000000000000000';
    await garment.save();
    await expect(
      w.proposals.acceptCounteroffer(garment.id, c.id),
    ).resolves.toMatchObject({ status: 'agreed' });
  });

  it('rechazo de cualquiera de las partes deja la propuesta sin acuerdo', async () => {
    const garment = await proposed(w, c, m);
    const rejected = await w.proposals.reject(
      garment.id,
      'merchant',
      'No recibimos esa marca',
    );
    expect(rejected.status).toBe('no_agreement');
    expect((await w.garments.getByIdOrFail(garment.id)).status).toBe(
      'no_agreement',
    );
    await expect(
      w.proposals.reject('000000000000000000000000', 'consignor'),
    ).rejects.toThrow(NotFoundException);
  });

  it('edición en revisión: actualiza la prenda y recalcula el precio', async () => {
    const garment = await proposed(w, c, m, 6000);
    const updated = await w.proposals.updateDraft(garment.id, c.id, {
      name: 'Campera nueva',
      category: 'Camperas y abrigos',
      brand: 'Zara',
      size: 'L',
      color: 'Negro',
      season: 'Invierno',
      condition: 'good',
      photos: ['data:image/jpeg;base64,CCC'],
      requestedConsignorPrice: 12000,
    });
    expect(updated).toMatchObject({
      requestedConsignorPrice: 12000,
      calculatedSalePrice: 20000,
    });
    const g = await w.garments.getByIdOrFail(garment.id);
    expect(g).toMatchObject({
      name: 'Campera nueva',
      brand: 'Zara',
      description: '',
    });
  });

  it('consultas por usuario: solo las partes de la prenda', async () => {
    const garment = await proposed(w, c, m);
    const proposal = await w.proposals.byGarment(garment.id);
    await expect(
      w.proposals.byGarmentForUser(garment.id, c.id, 'consignor'),
    ).resolves.toBeTruthy();
    await expect(
      w.proposals.getByIdForUser(proposal!.id, m.id, 'merchant'),
    ).resolves.toBeTruthy();
    await expect(
      w.proposals.getByIdForUser(proposal!.id, 'otro', 'merchant'),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      w.proposals.getByIdOrFail('000000000000000000000000'),
    ).rejects.toThrow(NotFoundException);
  });

  it('pendientes del comercio: solo las que están en revisión', async () => {
    await proposed(w, c, m, 1000, 'A');
    await agreed(w, c, m, 1000, 'B');
    const pending = await w.proposals.pendingForMerchant(m.id);
    expect(pending).toHaveLength(1);
  });
});
