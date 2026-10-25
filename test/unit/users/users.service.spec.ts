import { BadRequestException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { LOCATION, newConsignor, newMerchant } from '../../helpers/fixtures';
import { buildWorld, World } from '../../helpers/world';

describe('UsersService y AuthService', () => {
  let w: World;

  beforeEach(() => {
    w = buildWorld();
  });

  it('registra un cedente con la contraseña hasheada y rechaza un email repetido', async () => {
    const session = await w.auth.registerConsignor({
      firstName: 'Ana',
      lastName: 'Pérez',
      email: 'ana@test.com',
      phone: '1',
      password: 'secreto123',
      dni: '1',
      location: LOCATION,
    });
    expect(session.user).toMatchObject({
      name: 'Ana Pérez',
      role: 'consignor',
    });
    expect(w.jwt.verify<{ sub: string }>(session.token).sub).toBe(
      session.user.id,
    );
    const stored = await w.users.findByEmailWithPassword('ana@test.com');
    expect(await bcrypt.compare('secreto123', stored!.get('password'))).toBe(
      true,
    );
    expect(w.mail.sendVerificationCode).toHaveBeenCalledWith(
      'ana@test.com',
      'Ana Pérez',
      expect.stringMatching(/^\d{6}$/),
    );
    await expect(
      w.users.createConsignor({
        firstName: 'A',
        lastName: 'B',
        email: 'ana@test.com',
        phone: '1',
        password: 'x',
        dni: '1',
        location: LOCATION,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('registra un comercio con su primer punto de venta y los plazos por defecto', async () => {
    const session = await w.auth.registerMerchant({
      name: 'Laura',
      email: 'laura@test.com',
      phone: '1',
      password: 'secreto123',
      businessName: 'Percha',
      cuit: '1',
      location: LOCATION,
      commissionConfig: { consignorPercentage: 60, merchantPercentage: 40 },
      terms: { saleWindowMonths: 3, payoutDay: 10 },
      salesPoint: {
        name: 'Centro',
        address: 'Calle 1',
        phone: '1',
        geo: { lat: 1, lng: 2 },
        receptionSchedule: { days: 'Lun', hours: '10', instructions: '-' },
      },
    });
    const merchant = await w.users.findMerchantById(session.user.id);
    expect(merchant?.terms).toMatchObject({ deliveryDays: 7, pickupDays: 15 });
    expect(merchant?.salesPoints[0]).toMatchObject({
      name: 'Centro',
      merchantId: session.user.id,
    });
  });

  it('login: credenciales válidas e inválidas', async () => {
    const m = await newMerchant(w);
    const ok = await w.auth.login(m.email, 'secreto123');
    expect(ok.user).toMatchObject({ id: m.id, role: 'merchant' });
    await expect(w.auth.login(m.email, 'otra')).rejects.toThrow(
      'Credenciales inválidas',
    );
    await expect(w.auth.login('nadie@test.com', 'x')).rejects.toThrow(
      'Credenciales inválidas',
    );
  });

  it('verificación del email: código correcto, incorrecto, vencido y ya verificado', async () => {
    const c = await newConsignor(w);
    const code = await w.users.issueVerificationCode(c.id);
    await expect(
      w.auth.verifyEmail(c.id, '000000' === code ? '111111' : '000000'),
    ).rejects.toThrow('no coincide');
    await expect(w.auth.verifyEmail(c.id, code)).resolves.toEqual({
      verified: true,
    });
    expect((await w.users.findById(c.id))?.verified).toBe(true);
    await expect(w.users.verifyEmail(c.id, code)).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      w.users.verifyEmail('000000000000000000000000', code),
    ).rejects.toThrow('No hay una verificación');

    const d = await newConsignor(w, 'Dani');
    await expect(w.users.verifyEmail(d.id, '123456')).rejects.toThrow('venció');
    const expired = await w.users.issueVerificationCode(d.id);
    const user = await w.models.user.findById(d.id).exec();
    user!.set('verificationCodeExpiresAt', new Date(Date.now() - 1000));
    await user!.save();
    await expect(w.users.verifyEmail(d.id, expired)).rejects.toThrow('venció');
  });

  it('reenvío del código, datos de la sesión y error del correo sin frenar el registro', async () => {
    const c = await newConsignor(w);
    await expect(w.auth.resendCode(c.id)).resolves.toEqual({ sent: true });
    await expect(w.auth.resendCode('000000000000000000000000')).rejects.toThrow(
      'Usuario no encontrado',
    );
    await expect(w.auth.me(c.session)).resolves.toMatchObject({
      email: c.email,
    });
    await expect(
      w.auth.me({ ...c.session, id: '000000000000000000000000' }),
    ).resolves.toMatchObject({ email: undefined });
    w.mail.sendVerificationCode.mockRejectedValueOnce(new Error('SMTP caído'));
    await expect(w.auth.resendCode(c.id)).resolves.toEqual({ sent: true });
  });

  it('resúmenes de comercios y cedentes, completos o por ids', async () => {
    const m = await newMerchant(w);
    const c = await newConsignor(w);
    expect(await w.users.merchantSummaries([])).toEqual([]);
    expect(await w.users.consignorSummaries([])).toEqual([]);
    expect(await w.users.merchantSummaries()).toEqual([
      {
        id: m.id,
        name: 'Laura Comercio',
        businessName: 'Percha Test',
        payoutDay: 10,
      },
    ]);
    expect(await w.users.consignorSummaries([c.id])).toEqual([
      { id: c.id, name: 'Ana Prueba', dni: '30111222', bankDetails: 'ana.mp' },
    ]);
    expect(await w.users.consignorSummaries()).toHaveLength(1);
  });
});
