import { Injectable } from '@nestjs/common';
import { AgreementsService } from '../agreements/agreements.service';
import { ConsignorsService } from '../consignors/consignors.service';
import { GarmentsService } from '../garments/garments.service';
import { GarmentDocument } from '../garments/schemas/garment.schema';
import { Sale } from '../sales/schemas/sale.schema';
import { ReceptionsService } from '../receptions/receptions.service';
import { DashboardReport } from './dashboard';
import {
  GarmentStatus,
  ReceptionDiscrepancy,
  UnclaimedDisposition,
} from '../shared/domain/enums';
import { SalesService } from '../sales/sales.service';
import { UsersService } from '../users/users.service';
import { CategorySales } from './category-sales';
import { ConsignorPerformance } from './consignor-performance';
import { ExpiryOutcomes } from './expiry-outcomes';
import { DiscrepancyDetailRow } from './discrepancy-detail';
import { ExpiringConsignment } from './expiring-consignment';
import { PointSales } from './point-sales';
import { ReceptionDiscrepancyReport } from './reception-discrepancies';
import { garmentInScope, ReportFilters, dateInRange } from '../shared/report-filters';
import { RotationReport } from './rotation';
import { SummaryKpis, SummaryReport, WeeklyPoint } from './summary';

const DAY_MS = 24 * 60 * 60 * 1000;

function uniqueIds(ids: (string | undefined)[]): string[] {
  return [...new Set(ids.filter((id): id is string => !!id))];
}

const ACCEPTED_STATUSES: GarmentStatus[] = [
  'agreed',
  'in_stock',
  'with_remarks',
  'rejected',
  'sold',
  'paid_out',
  'delivery_expired',
  'awaiting_pickup',
  'returned',
  'unclaimed',
];

// Physically taken into the shop (whether still in stock or already sold); the base for conversion.
const RECEIVED_STATUSES: GarmentStatus[] = [
  'in_stock',
  'with_remarks',
  'sold',
  'paid_out',
  'awaiting_pickup',
  'returned',
  'unclaimed',
];

// El cedente entregó la prenda acordada (llegó al comercio al menos una vez); el resto de las
// acordadas es incumplimiento de entrega. "rejected" cuenta como entregada: la trajo, aunque la
// recepción la haya rechazado.
const DELIVERED_STATUSES: GarmentStatus[] = [
  'in_stock',
  'with_remarks',
  'rejected',
  'sold',
  'paid_out',
  'awaiting_pickup',
  'returned',
  'unclaimed',
];

// Terminaron la ventana de venta sin venderse (pasaron por Por retirar).
const EXPIRED_STATUSES: GarmentStatus[] = ['awaiting_pickup', 'returned', 'unclaimed'];

@Injectable()
export class ReportsService {
  constructor(
    private readonly garments: GarmentsService,
    private readonly agreements: AgreementsService,
    private readonly sales: SalesService,
    private readonly receptions: ReceptionsService,
    private readonly consignors: ConsignorsService,
    private readonly users: UsersService,
  ) {}

  async receptionDiscrepancies(
    merchantId: string,
    filters: ReportFilters = {},
  ): Promise<ReceptionDiscrepancyReport> {
    const garments = (await this.garments.metaByMerchant(merchantId)).filter((g) =>
      garmentInScope(g, filters),
    );
    const receptions = (await this.receptions.byGarmentIds(garments.map((g) => g.id))).filter((r) =>
      dateInRange(r.receivedAt, filters),
    );

    const counts = new Map<ReceptionDiscrepancy, number>();
    let withDiscrepancies = 0;
    for (const reception of receptions) {
      if (reception.discrepancies.length > 0) withDiscrepancies += 1;
      for (const discrepancy of reception.discrepancies) {
        counts.set(discrepancy, (counts.get(discrepancy) ?? 0) + 1);
      }
    }
    const byType = [...counts.entries()]
      .map(([discrepancy, count]) => ({ discrepancy, count }))
      .sort((a, b) => b.count - a.count);

    return {
      totalReceptions: receptions.length,
      withDiscrepancies,
      rate: receptions.length ? Math.round((withDiscrepancies / receptions.length) * 100) : null,
      byType,
    };
  }

  async receptionDiscrepancyDetail(
    merchantId: string,
    filters: ReportFilters = {},
  ): Promise<DiscrepancyDetailRow[]> {
    const garments = (await this.garments.metaByMerchant(merchantId)).filter((g) =>
      garmentInScope(g, filters),
    );
    const garmentById = new Map(garments.map((g) => [g.id, g]));
    const receptions = (await this.receptions.byGarmentIds([...garmentById.keys()])).filter(
      (r) => r.discrepancies.length > 0 && dateInRange(r.receivedAt, filters),
    );
    const consignors = await this.users.consignorSummaries(
      uniqueIds(receptions.map((r) => garmentById.get(r.garmentId)?.consignorId)),
    );
    const consignorName = new Map(consignors.map((c) => [c.id, c.name]));
    const now = Date.now();

    return receptions
      .map((reception): DiscrepancyDetailRow => {
        const garment = garmentById.get(reception.garmentId);
        return {
          garmentName: garment?.name ?? '—',
          category: garment?.category ?? '—',
          consignorName: garment ? (consignorName.get(garment.consignorId) ?? '—') : '—',
          receivedAt: reception.receivedAt,
          daysInStock: garment
            ? Math.floor((now - garment.createdAt.getTime()) / DAY_MS)
            : 0,
          discrepancies: reception.discrepancies,
        };
      })
      .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
  }

  async salesByPoint(merchantId: string, filters: ReportFilters = {}): Promise<PointSales[]> {
    const merchant = await this.users.findMerchantById(merchantId);
    const nameById = new Map<string, string>();
    for (const sp of merchant?.salesPoints ?? []) {
      nameById.set((sp as unknown as { id: string }).id, sp.name);
    }
    const garments = (await this.garments.metaByMerchant(merchantId)).filter((g) =>
      garmentInScope(g, filters),
    );
    const pointByGarment = new Map(garments.map((g) => [g.id, g.salesPointId]));
    const sales = (await this.sales.byGarmentIds(garments.map((g) => g.id))).filter((s) =>
      dateInRange(s.soldAt, filters),
    );

    const byPoint = new Map<string, PointSales>();
    for (const sale of sales) {
      const salesPointId = pointByGarment.get(sale.garmentId);
      if (!salesPointId) continue;
      let entry = byPoint.get(salesPointId);
      if (!entry) {
        entry = {
          salesPointId,
          name: nameById.get(salesPointId) ?? '—',
          soldCount: 0,
          revenue: 0,
          merchantProfit: 0,
        };
        byPoint.set(salesPointId, entry);
      }
      entry.soldCount += 1;
      entry.revenue += sale.actualSalePrice;
      entry.merchantProfit += sale.merchantCommission;
    }
    return [...byPoint.values()].sort((a, b) => b.merchantProfit - a.merchantProfit);
  }

  async rotation(merchantId: string, filters: ReportFilters = {}): Promise<RotationReport> {
    const now = Date.now();
    const garments = (await this.garments.metaByMerchant(merchantId)).filter((g) =>
      garmentInScope(g, filters),
    );
    const garmentById = new Map(garments.map((g) => [g.id, g]));
    const sales = (await this.sales.byGarmentIds([...garmentById.keys()])).filter((s) =>
      dateInRange(s.soldAt, filters),
    );

    const bounds = [15, 30, 45, 60, 90, 120, Infinity];
    const labels = ['0-15', '16-30', '31-45', '46-60', '61-90', '91-120', '+120'];
    const stockAging = labels.map((bucket) => ({ bucket, count: 0 }));
    let staleCount = 0;
    for (const garment of garments) {
      if (garment.status !== 'in_stock' && garment.status !== 'with_remarks') continue;
      const days = Math.floor((now - garment.createdAt.getTime()) / DAY_MS);
      stockAging[bounds.findIndex((max) => days <= max)].count += 1;
      if (days > 90) staleCount += 1;
    }

    let daysTotal = 0;
    let soldCount = 0;
    for (const sale of sales) {
      const garment = garmentById.get(sale.garmentId);
      if (!garment) continue;
      daysTotal += (sale.soldAt.getTime() - garment.createdAt.getTime()) / DAY_MS;
      soldCount += 1;
    }

    return {
      stockAging,
      staleCount,
      avgDaysToSale: soldCount ? Math.round(daysTotal / soldCount) : null,
    };
  }

  async consignorPerformance(
    merchantId: string,
    filters: ReportFilters = {},
  ): Promise<ConsignorPerformance[]> {
    const consignors = (await this.consignors.byMerchant(merchantId)).filter(
      (c) => !filters.consignorId || c.id === filters.consignorId,
    );
    const garments = (await this.garments.metaByMerchant(merchantId)).filter((g) =>
      garmentInScope(g, filters),
    );
    const sales = (await this.sales.byGarmentIds(garments.map((garment) => garment.id))).filter(
      (s) => dateInRange(s.soldAt, filters),
    );
    const saleByGarment = new Map(sales.map((sale) => [sale.garmentId, sale]));

    const garmentsByConsignor = new Map<string, typeof garments>();
    for (const garment of garments) {
      const list = garmentsByConsignor.get(garment.consignorId) ?? [];
      list.push(garment);
      garmentsByConsignor.set(garment.consignorId, list);
    }

    const rows = consignors.map((consignor): ConsignorPerformance => {
      const owned = garmentsByConsignor.get(consignor.id) ?? [];
      const accepted = owned.filter((g) => ACCEPTED_STATUSES.includes(g.status)).length;
      const notAccepted = owned.filter((g) => g.status === 'no_agreement').length;
      const decided = accepted + notAccepted;
      const inStockCount = owned.filter(
        (g) => g.status === 'in_stock' || g.status === 'with_remarks',
      ).length;
      // Sell-through = of everything physically received, how much sold. Same "received"
      // base as the by-category conversion, so the two reports stay comparable.
      const receivedCount = owned.filter((g) => RECEIVED_STATUSES.includes(g.status)).length;

      // Cumplimiento: entrega (acordó y trajo la prenda) y retiro (se venció la venta y la fue a
      // buscar). Las tasas sólo miran las decididas, no las que siguen en curso.
      const deliveredCount = owned.filter((g) => DELIVERED_STATUSES.includes(g.status)).length;
      const deliveryExpiredCount = owned.filter((g) => g.status === 'delivery_expired').length;
      const deliveryDecided = deliveredCount + deliveryExpiredCount;
      const expiredCount = owned.filter((g) => EXPIRED_STATUSES.includes(g.status)).length;
      const returnedCount = owned.filter((g) => g.status === 'returned').length;
      const unclaimedCount = owned.filter((g) => g.status === 'unclaimed').length;
      const awaitingPickupCount = owned.filter((g) => g.status === 'awaiting_pickup').length;
      const pickupDecided = returnedCount + unclaimedCount;

      let liquidatedAmount = 0;
      let pendingAmount = 0;
      let merchantProfit = 0;
      let soldCount = 0;
      let payoutDaysTotal = 0;
      let paidCount = 0;
      for (const garment of owned) {
        const sale = saleByGarment.get(garment.id);
        if (!sale) continue;
        soldCount += 1;
        merchantProfit += sale.merchantCommission;
        if (sale.paidAt) {
          liquidatedAmount += sale.consignorAmount;
          payoutDaysTotal += (sale.paidAt.getTime() - sale.soldAt.getTime()) / DAY_MS;
          paidCount += 1;
        } else {
          pendingAmount += sale.consignorAmount;
        }
      }

      return {
        consignorId: consignor.id,
        name: consignor.get('name') as string,
        dni: consignor.dni,
        email: consignor.get('email') as string,
        phone: consignor.get('phone') as string,
        verified: consignor.get('verified') as boolean,
        acceptanceRate: decided ? Math.round((accepted / decided) * 100) : null,
        accepted,
        decided,
        inStockCount,
        receivedCount,
        sellThroughRate: receivedCount ? Math.round((soldCount / receivedCount) * 100) : null,
        soldCount,
        liquidatedAmount,
        pendingAmount,
        merchantProfit,
        paidCount,
        avgPayoutDays: paidCount ? Math.round(payoutDaysTotal / paidCount) : null,
        deliveredCount,
        deliveryExpiredCount,
        deliveryRate: deliveryDecided
          ? Math.round((deliveredCount / deliveryDecided) * 100)
          : null,
        expiredCount,
        returnedCount,
        unclaimedCount,
        awaitingPickupCount,
        pickupRate: pickupDecided
          ? Math.round((returnedCount / pickupDecided) * 100)
          : null,
      };
    });

    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Stock y vencimientos del comercio: de las prendas que terminaron la ventana sin venderse,
  // cuántas retiró el cedente y cuántas no, y qué destino se les dio a las no retiradas. Privado
  // del comercio: sólo cuenta sus propias prendas (metaByMerchant).
  async expiryOutcomes(
    merchantId: string,
    filters: ReportFilters = {},
  ): Promise<ExpiryOutcomes> {
    const garments = (await this.garments.metaByMerchant(merchantId)).filter((g) =>
      garmentInScope(g, filters),
    );
    const expired = garments.filter((g) => EXPIRED_STATUSES.includes(g.status));
    const returnedCount = expired.filter((g) => g.status === 'returned').length;
    const unclaimed = expired.filter((g) => g.status === 'unclaimed');
    const unclaimedCount = unclaimed.length;
    const awaitingPickupCount = expired.filter((g) => g.status === 'awaiting_pickup').length;
    const pickupDecided = returnedCount + unclaimedCount;
    const byDisposition = (disposition: UnclaimedDisposition): number =>
      unclaimed.filter((g) => g.unclaimedDisposition?.disposition === disposition).length;
    return {
      expiredCount: expired.length,
      awaitingPickupCount,
      returnedCount,
      unclaimedCount,
      pickupRate: pickupDecided ? Math.round((returnedCount / pickupDecided) * 100) : null,
      donatedCount: byDisposition('donated'),
      keptCount: byDisposition('kept'),
      otherCount: byDisposition('other'),
      unclaimedPendingCount: unclaimed.filter((g) => !g.unclaimedDisposition).length,
    };
  }

  async salesByCategory(merchantId: string, filters: ReportFilters = {}): Promise<CategorySales[]> {
    const garments = (await this.garments.metaByMerchant(merchantId)).filter((g) =>
      garmentInScope(g, filters),
    );
    const garmentById = new Map(garments.map((garment) => [garment.id, garment]));
    const sales = (await this.sales.byGarmentIds([...garmentById.keys()])).filter((s) =>
      dateInRange(s.soldAt, filters),
    );
    return this.categoriesFromData(garments, garmentById, sales);
  }

  private categoriesFromData(
    garments: GarmentDocument[],
    garmentById: Map<string, GarmentDocument>,
    sales: Sale[],
  ): CategorySales[] {
    const byCategory = new Map<string, CategorySales>();
    // Received count (conversion base) and total days-to-sale, kept aside so the running
    // averages don't leak into the returned rows until we resolve them at the end.
    const receivedByCategory = new Map<string, number>();
    const daysToSaleByCategory = new Map<string, number>();
    const bucket = (category: string): CategorySales => {
      let entry = byCategory.get(category);
      if (!entry) {
        entry = {
          category,
          soldCount: 0,
          soldRevenue: 0,
          merchantProfit: 0,
          inStockCount: 0,
          conversion: null,
          avgDaysToSale: null,
        };
        byCategory.set(category, entry);
      }
      return entry;
    };

    for (const garment of garments) {
      if (garment.status === 'in_stock' || garment.status === 'with_remarks') {
        bucket(garment.category).inStockCount += 1;
      }
      if (RECEIVED_STATUSES.includes(garment.status)) {
        bucket(garment.category); // ensure a row exists even if the category has no sales yet
        receivedByCategory.set(
          garment.category,
          (receivedByCategory.get(garment.category) ?? 0) + 1,
        );
      }
    }
    for (const sale of sales) {
      const garment = garmentById.get(sale.garmentId);
      if (!garment) continue;
      const entry = bucket(garment.category);
      entry.soldCount += 1;
      entry.soldRevenue += sale.actualSalePrice;
      entry.merchantProfit += sale.merchantCommission;
      daysToSaleByCategory.set(
        garment.category,
        (daysToSaleByCategory.get(garment.category) ?? 0) +
          (sale.soldAt.getTime() - garment.createdAt.getTime()) / DAY_MS,
      );
    }

    for (const entry of byCategory.values()) {
      const received = receivedByCategory.get(entry.category) ?? 0;
      entry.conversion = received ? Math.round((entry.soldCount / received) * 100) : null;
      entry.avgDaysToSale = entry.soldCount
        ? Math.round((daysToSaleByCategory.get(entry.category) ?? 0) / entry.soldCount)
        : null;
    }

    return [...byCategory.values()].sort((a, b) => b.merchantProfit - a.merchantProfit);
  }

  async expiringConsignments(
    merchantId: string,
    withinDays = 30,
    filters: ReportFilters = {},
  ): Promise<ExpiringConsignment[]> {
    // Desde el 23/10/2026 el período de gracia dejó de extender la venta (pasó a ser el plazo para
    // retirar): el plazo efectivo de una prenda en stock es la fecha límite de venta del acuerdo.
    const inStock = (await this.garments.metaByMerchant(merchantId)).filter(
      (garment) =>
        (garment.status === 'in_stock' || garment.status === 'with_remarks') &&
        garmentInScope(garment, filters),
    );
    const agreements = await this.agreements.listForUser('merchant', merchantId);
    const agreementByGarment = new Map(agreements.map((a) => [a.garmentId, a]));
    const consignors = await this.users.consignorSummaries(
      uniqueIds(inStock.map((garment) => garment.consignorId)),
    );
    const consignorById = new Map(consignors.map((c) => [c.id, c]));

    const now = new Date();
    const threshold = this.addDays(now, withinDays);

    const items: ExpiringConsignment[] = [];
    for (const garment of inStock) {
      const agreement = agreementByGarment.get(garment.id);
      if (!agreement) continue;
      const effectiveDeadline = agreement.saleDeadline;
      if (effectiveDeadline > threshold) continue;
      const daysLeft = Math.ceil((effectiveDeadline.getTime() - now.getTime()) / DAY_MS);
      items.push({
        garmentId: garment.id,
        name: garment.name,
        consignorId: garment.consignorId,
        consignorName: consignorById.get(garment.consignorId)?.name ?? '—',
        salesPointId: garment.salesPointId,
        saleDeadline: agreement.saleDeadline,
        effectiveDeadline,
        daysLeft,
        overdue: daysLeft < 0,
      });
    }
    return items.sort((a, b) => a.daysLeft - b.daysLeft);
  }

  async summary(merchantId: string, filters: ReportFilters = {}): Promise<SummaryReport> {
    const garments = (await this.garments.metaByMerchant(merchantId)).filter((g) =>
      garmentInScope(g, filters),
    );
    const sales = await this.sales.byGarmentIds(garments.map((g) => g.id));
    return this.summaryFromSales(sales, filters);
  }

  private summaryFromSales(sales: Sale[], filters: ReportFilters): SummaryReport {
    const { current, previous } = this.periods(filters);
    const kpis = (from: Date, to: Date): SummaryKpis => {
      let profit = 0;
      let revenue = 0;
      let soldCount = 0;
      let pendingPayout = 0;
      for (const sale of sales) {
        if (sale.soldAt < from || sale.soldAt > to) continue;
        soldCount += 1;
        profit += sale.merchantCommission;
        revenue += sale.actualSalePrice;
        if (!sale.paidAt) pendingPayout += sale.consignorAmount;
      }
      return { profit, revenue, soldCount, avgTicket: soldCount ? Math.round(revenue / soldCount) : 0, pendingPayout };
    };

    return { current: kpis(current.from, current.to), previous: kpis(previous.from, previous.to) };
  }

  async weekly(merchantId: string, filters: ReportFilters = {}, weeks = 6): Promise<WeeklyPoint[]> {
    const garments = (await this.garments.metaByMerchant(merchantId)).filter((g) =>
      garmentInScope(g, filters),
    );
    const sales = await this.sales.byGarmentIds(garments.map((g) => g.id));
    return this.weeklyFromSales(sales, weeks);
  }

  // A fixed trailing window: the last `weeks` 7-day buckets ending today. Ignores from/to.
  private weeklyFromSales(sales: Sale[], weeks: number): WeeklyPoint[] {
    const now = new Date();
    const endOfToday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999),
    );
    const points: WeeklyPoint[] = [];
    for (let i = weeks - 1; i >= 0; i -= 1) {
      const to = new Date(endOfToday.getTime() - i * 7 * DAY_MS);
      const from = new Date(to.getTime() - 7 * DAY_MS + 1);
      let profit = 0;
      let soldCount = 0;
      for (const sale of sales) {
        if (sale.soldAt < from || sale.soldAt > to) continue;
        profit += sale.merchantCommission;
        soldCount += 1;
      }
      points.push({ weekStart: from.toISOString().slice(0, 10), profit, soldCount });
    }
    return points;
  }

  // Un solo dataset para todo el Panel del comercio: evita las 6-7 llamadas que
  // recargaban y recalculaban las mismas prendas una y otra vez.
  async dashboard(merchantId: string, expiryDays = 30): Promise<DashboardReport> {
    const merchant = await this.users.findMerchantById(merchantId);
    const garments = await this.garments.metaByMerchant(merchantId);
    const garmentById = new Map(garments.map((g) => [g.id, g]));
    const sales = await this.sales.byGarmentIds([...garmentById.keys()]);
    const agreements = await this.agreements.listForUser('merchant', merchantId);
    const agreementByGarment = new Map(agreements.map((a) => [a.garmentId, a]));

    const threshold = this.addDays(new Date(), expiryDays);
    let expiringCount = 0;
    for (const garment of garments) {
      if (garment.status !== 'in_stock' && garment.status !== 'with_remarks') continue;
      const agreement = agreementByGarment.get(garment.id);
      if (!agreement) continue;
      if (agreement.saleDeadline <= threshold) expiringCount += 1;
    }

    return {
      displayName: merchant?.businessName ?? '',
      summary: this.summaryFromSales(sales, {}),
      categories: this.categoriesFromData(garments, garmentById, sales),
      weekly: this.weeklyFromSales(sales, 6),
      pendingCount: garments.filter((g) => g.status === 'under_review').length,
      expiringCount,
      awaitingPickupCount: garments.filter((g) => g.status === 'awaiting_pickup').length,
      unclaimedPendingCount: garments.filter(
        (g) => g.status === 'unclaimed' && !g.unclaimedDisposition,
      ).length,
    };
  }

  // Current period from the filter (or the current month by default) and the equal-length
  // window right before it, for period-over-period deltas.
  private periods(filters: ReportFilters): {
    current: { from: Date; to: Date };
    previous: { from: Date; to: Date };
  } {
    const now = new Date();
    const from =
      filters.from ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const to =
      filters.to ??
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    const duration = to.getTime() - from.getTime();
    const prevTo = new Date(from.getTime() - 1);
    const prevFrom = new Date(prevTo.getTime() - duration);
    return { current: { from, to }, previous: { from: prevFrom, to: prevTo } };
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }
}
