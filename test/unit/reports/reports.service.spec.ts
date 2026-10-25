import { buildWorld, World } from '../../helpers/world';
import { DEMO_MERCHANT_EMAIL } from '../../../src/seed/demo-data';
import { newMerchant } from '../../helpers/fixtures';
import type { ReportFilters } from '../../../src/shared/report-filters';

describe('ReportsService (lote de demostración)', () => {
  let w: World;
  let merchantId: string;
  let filters: ReportFilters[];

  beforeAll(async () => {
    w = buildWorld();
    await w.seed.seedDemoMerchant();
    const merchant = await w.users.findByEmailWithPassword(DEMO_MERCHANT_EMAIL);
    merchantId = String(merchant!._id);
    const doc = await w.users.findMerchantById(merchantId);
    const garment = w.models.garment
      .docs()
      .find((g) => g.get('status') === 'sold')!;
    const now = new Date();
    filters = [
      {},
      {
        salesPointId: String(
          (doc!.salesPoints[0] as unknown as { _id: unknown })._id,
        ),
      },
      { category: garment.get('category') as string },
      { consignorId: garment.get('consignorId') as string },
      { from: new Date(now.getTime() - 60 * 86400000), to: now },
    ];
  });

  it('resumen y semanas: cifras coherentes entre sí', async () => {
    const summary = await w.reports.summary(merchantId);
    expect(summary.current.soldCount).toBeGreaterThan(0);
    for (const f of filters) {
      const s = await w.reports.summary(merchantId, f);
      expect(s.current.revenue).toBeGreaterThanOrEqual(s.current.profit);
      const weeks = await w.reports.weekly(merchantId, f);
      expect(weeks).toHaveLength(6);
    }
    const all = await w.reports.summary(merchantId, {
      from: new Date(2000, 0, 1),
      to: new Date(),
    });
    expect(all.current.soldCount).toBeGreaterThanOrEqual(
      summary.current.soldCount,
    );
  });

  it('rotación, categorías, puntos de venta y cedentes', async () => {
    for (const f of filters) {
      const rotation = await w.reports.rotation(merchantId, f);
      expect(rotation.stockAging.length).toBe(7);
      const categories = await w.reports.salesByCategory(merchantId, f);
      expect(Array.isArray(categories)).toBe(true);
      const points = await w.reports.salesByPoint(merchantId, f);
      expect(Array.isArray(points)).toBe(true);
      const consignors = await w.reports.consignorPerformance(merchantId, f);
      for (const c of consignors)
        expect(c.receivedCount).toBeGreaterThanOrEqual(0);
    }
    const rotation = await w.reports.rotation(merchantId);
    expect(rotation.staleCount).toBeGreaterThan(0);
    expect(rotation.avgDaysToSale).toEqual(expect.any(Number));
  });

  it('resultado de los vencimientos: cifras coherentes con cada filtro', async () => {
    for (const f of filters) {
      const r = await w.reports.expiryOutcomes(merchantId, f);
      expect(r.returnedCount + r.unclaimedCount + r.awaitingPickupCount).toBe(
        r.expiredCount,
      );
      expect(r.donatedCount + r.keptCount + r.otherCount).toBeLessThanOrEqual(
        r.unclaimedCount,
      );
    }
    expect((await w.reports.expiryOutcomes(merchantId)).expiredCount).toBe(
      (await w.reports.expiryOutcomes(merchantId, {})).expiredCount,
    );
  });

  it('discrepancias de recepción y su detalle', async () => {
    for (const f of filters) {
      const report = await w.reports.receptionDiscrepancies(merchantId, f);
      expect(report.withDiscrepancies).toBeLessThanOrEqual(
        report.totalReceptions,
      );
      const detail = await w.reports.receptionDiscrepancyDetail(merchantId, f);
      expect(Array.isArray(detail)).toBe(true);
    }
    expect(
      (await w.reports.receptionDiscrepancies(merchantId)).withDiscrepancies,
    ).toBeGreaterThan(0);
    expect(
      (await w.reports.receptionDiscrepancyDetail(merchantId)).length,
    ).toBeGreaterThan(0);
  });

  it('plazos por vencer y panel', async () => {
    const expiring = await w.reports.expiringConsignments(merchantId, 365);
    expect(expiring.length).toBeGreaterThan(0);
    for (const f of filters)
      await w.reports.expiringConsignments(merchantId, 30, f);
    const dashboard = await w.reports.dashboard(merchantId);
    expect(dashboard.displayName).toBe('Segunda Vuelta');
    expect(dashboard.awaitingPickupCount).toBeGreaterThan(0);
    expect(dashboard.unclaimedPendingCount).toBeGreaterThan(0);
    expect(dashboard.weekly).toHaveLength(6);
  });

  it('un comercio sin datos devuelve reportes vacíos', async () => {
    const m = await newMerchant(w);
    expect((await w.reports.summary(m.id)).current.soldCount).toBe(0);
    expect((await w.reports.rotation(m.id)).avgDaysToSale).toBeNull();
    expect(await w.reports.salesByCategory(m.id)).toEqual([]);
    expect(await w.reports.consignorPerformance(m.id)).toEqual([]);
    expect((await w.reports.receptionDiscrepancies(m.id)).totalReceptions).toBe(
      0,
    );
    expect(await w.reports.expiringConsignments(m.id)).toEqual([]);
    expect((await w.reports.dashboard(m.id)).pendingCount).toBe(0);
    const anon = await w.reports.dashboard('000000000000000000000000');
    expect(typeof anon.displayName).toBe('string');
  });
});
