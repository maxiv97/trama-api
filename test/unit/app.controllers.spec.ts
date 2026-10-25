import { ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AgreementsController } from '../../src/agreements/agreements.controller';
import { AppController } from '../../src/app.controller';
import { AppService } from '../../src/app.service';
import { AuthController } from '../../src/auth/auth.controller';
import type { SessionUser } from '../../src/auth/session-user';
import { CategoriesController } from '../../src/categories/categories.controller';
import { ConsignorsController } from '../../src/consignors/consignors.controller';
import { GarmentsController } from '../../src/garments/garments.controller';
import { MerchantsController } from '../../src/merchants/merchants.controller';
import { NotificationsController } from '../../src/notifications/notifications.controller';
import { PayoutsController } from '../../src/payouts/payouts.controller';
import { PlatformConfigController } from '../../src/platform-config/platform-config.controller';
import { ProposalsController } from '../../src/proposals/proposals.controller';
import { ReceptionsController } from '../../src/receptions/receptions.controller';
import { ReportsController } from '../../src/reports/reports.controller';
import { ReturnsController } from '../../src/returns/returns.controller';
import { SalesPointsController } from '../../src/sales-points/sales-points.controller';
import { SalesController } from '../../src/sales/sales.controller';
import { SupportController } from '../../src/support/support.controller';
import { config } from '../helpers/world';

/* eslint-disable @typescript-eslint/no-floating-promises --
   Los servicios simulados devuelven valores en el momento: no hay promesas que esperar. */

// Servicio simulado: cada método devuelve su propio nombre, para comprobar a cuál delega el controlador.
type Mocked = Record<string, jest.Mock>;
function service(overrides: Record<string, unknown> = {}): Mocked {
  return new Proxy(overrides as Mocked, {
    get(target, key: string) {
      target[key] ??= jest.fn((...args: unknown[]) => ({ method: key, args }));
      return target[key];
    },
  });
}

const merchant: SessionUser = { id: 'm1', name: 'Laura', role: 'merchant' };
const consignor: SessionUser = { id: 'c1', name: 'Ana', role: 'consignor' };

describe('Controladores (delegación en los servicios)', () => {
  it('health, configuración pública y autenticación', () => {
    expect(new AppController(new AppService()).health()).toEqual(
      expect.objectContaining({ status: 'ok' }),
    );
    expect(
      new PlatformConfigController(
        config({ MONETIZATION_ENABLED: 'true' }),
      ).get(),
    ).toEqual({ monetization: true });
    expect(new PlatformConfigController(config()).get()).toEqual({
      monetization: false,
    });
    const auth = service();
    const c = new AuthController(auth as never);
    c.login({ email: 'a@a', password: 'x' });
    c.registerConsignor({} as never);
    c.registerMerchant({} as never);
    c.verifyEmail(consignor, { code: '123456' });
    c.resendCode(consignor);
    void c.me(consignor);
    expect(auth.login).toHaveBeenCalledWith('a@a', 'x');
    expect(auth.verifyEmail).toHaveBeenCalledWith('c1', '123456');
    expect(auth.me).toHaveBeenCalledWith(consignor);
  });

  it('prendas: listado por rol (con y sin fotos), dueño y acciones', async () => {
    const garment = { merchantId: 'm1', consignorId: 'c1' };
    const s = service({
      getByIdOrFail: jest.fn(() => Promise.resolve(garment)),
      firstPhotoForUser: jest.fn(() => Promise.resolve('foto')),
    });
    const c = new GarmentsController(s as never);
    c.create(consignor, {} as never);
    c.list(merchant, '1');
    c.list(merchant);
    c.list(consignor, 'true');
    c.list(consignor);
    expect(s.metaByMerchant).toHaveBeenCalled();
    expect(s.byMerchant).toHaveBeenCalled();
    expect(s.metaByConsignor).toHaveBeenCalled();
    expect(s.byConsignor).toHaveBeenCalled();
    await expect(c.photo(consignor, 'g1')).resolves.toEqual({ photo: 'foto' });
    await expect(c.getById(consignor, 'g1')).resolves.toBe(garment);
    await expect(c.getById({ ...merchant, id: 'otro' }, 'g1')).rejects.toThrow(
      ForbiddenException,
    );
    await c.applyAction(consignor, 'g1', { action: 'CANCEL' });
    await expect(
      c.applyAction(merchant, 'g1', { action: 'CANCEL' }),
    ).rejects.toThrow('Solo el cedente');
    await c.applyAction(merchant, 'g1', {
      action: 'REGISTER_SALE',
      note: 'n',
    } as never);
    expect(s.applyAction).toHaveBeenCalledWith(
      'g1',
      'REGISTER_SALE',
      'merchant',
      'n',
    );
  });

  it('propuestas, recepciones, ventas, devoluciones y acuerdos', () => {
    const p = service();
    const pc = new ProposalsController(p as never);
    pc.create(consignor, {} as never);
    pc.byGarment(consignor, 'g');
    pc.updateDraft(consignor, 'g', {} as never);
    pc.pending(merchant);
    pc.getById(merchant, 'p');
    pc.accept(merchant, 'g');
    pc.counteroffer(merchant, 'g', { consignorPrice: 5 });
    pc.acceptCounteroffer(consignor, 'g');
    pc.reject(merchant, 'g');
    expect(p.counteroffer).toHaveBeenCalledWith('g', 'm1', 5);
    expect(p.reject).toHaveBeenCalledWith('g', 'merchant');

    const r = service();
    const rc = new ReceptionsController(r as never);
    rc.create(merchant, {} as never);
    rc.byGarment('g');
    const s = service();
    const sc = new SalesController(s as never);
    sc.create(merchant, {} as never);
    sc.bulkCreate(merchant, {} as never);
    sc.byGarment('g');
    sc.list(merchant);
    const d = service();
    const dc = new ReturnsController(d as never);
    dc.create(merchant, {} as never);
    dc.byGarment(consignor, 'g');
    dc.registerDisposition(merchant, 'g', {} as never);
    const a = service();
    const ac = new AgreementsController(a as never);
    ac.byGarment('g');
    ac.list(merchant);
    expect(a.listForUser).toHaveBeenCalledWith('merchant', 'm1');
    expect(r.byGarment).toHaveBeenCalledWith('g');
    expect(s.byMerchant).toHaveBeenCalledWith('m1');
    expect(d.registerDisposition).toHaveBeenCalledWith('g', merchant, {});
  });

  it('comercios, cedentes, puntos de venta, categorías y avisos', () => {
    const m = service();
    const mc = new MerchantsController(m as never);
    mc.list();
    mc.getById('m1');
    mc.update(merchant, 'm1', {} as never);
    expect(() => mc.update(merchant, 'otro', {} as never)).toThrow(
      ForbiddenException,
    );
    const co = service();
    const cc = new ConsignorsController(co as never);
    cc.list(merchant);
    cc.getById(merchant, 'c1');
    expect(co.getForMerchantOrFail).toHaveBeenCalledWith('c1', 'm1');
    const sp = service();
    const spc = new SalesPointsController(sp as never);
    spc.list('m1');
    spc.list();
    spc.getById('sp');
    spc.create(merchant, {} as never);
    spc.update(merchant, 'sp', {} as never);
    expect(sp.byMerchant).toHaveBeenCalledWith('m1');
    expect(sp.list).toHaveBeenCalled();
    const cat = service();
    const catc = new CategoriesController(cat as never);
    catc.list('m1');
    catc.create(merchant, {} as never);
    catc.setHidden(merchant, { labels: ['A'] });
    catc.update(merchant, 'id', {});
    catc.remove(merchant, 'id');
    expect(cat.setHidden).toHaveBeenCalledWith('m1', ['A']);
    const n = service();
    const nc = new NotificationsController(n as never);
    nc.byUser(consignor);
    nc.unreadCount(consignor);
    nc.markAllRead(consignor);
    nc.markRead(consignor, 'n1');
    expect(n.markRead).toHaveBeenCalledWith('n1', 'c1');
  });

  it('liquidaciones y reportes, con los filtros convertidos a fechas', () => {
    const p = service();
    const pc = new PayoutsController(p as never);
    pc.monthly(merchant, { from: '2026-10-01', to: '2026-10-31' });
    pc.flat(consignor, {});
    pc.settle(merchant, {} as never);
    const [, , filters] = p.monthly.mock.calls[0] as [
      string,
      string,
      { from: Date; to: Date },
    ];
    expect(filters.from.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(filters.to.toISOString()).toBe('2026-10-31T23:59:59.999Z');

    const r = service();
    const rc = new ReportsController(r as never);
    rc.dashboard(merchant);
    rc.expiring(merchant, {}, '90');
    rc.expiring(merchant, {});
    rc.byCategory(merchant, {});
    rc.consignors(merchant, {});
    rc.discrepancies(merchant, {});
    rc.discrepanciesDetail(merchant, {});
    rc.byPoint(merchant, {});
    rc.rotation(merchant, {});
    rc.summary(merchant, {});
    rc.weekly(merchant, {});
    expect(
      (r.expiringConsignments.mock.calls as unknown[][]).map((c) => c[1]),
    ).toEqual([90, 30]);
  });

  it('soporte: asocia el ticket al usuario solo con un token válido', () => {
    const jwt = new JwtService({ secret: 's' });
    const s = service();
    const c = new SupportController(s as never, jwt);
    const token = jwt.sign({ sub: 'u1' });
    c.create({} as never, `Bearer ${token}`);
    c.create({} as never, 'Bearer invalido');
    c.create({} as never);
    expect((s.create.mock.calls as unknown[][]).map((x) => x[1])).toEqual([
      'u1',
      undefined,
      undefined,
    ]);
  });
});
