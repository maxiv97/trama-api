import { Injectable } from '@nestjs/common';
import { AgreementsService } from '../agreements/agreements.service';
import { ConsignorsService } from '../consignors/consignors.service';
import { GarmentsService } from '../garments/garments.service';
import { ReceptionsService } from '../receptions/receptions.service';
import { GarmentStatus, ReceptionDiscrepancy } from '../shared/domain/enums';
import { SalesService } from '../sales/sales.service';
import { UsersService } from '../users/users.service';
import { CategorySales } from './category-sales';
import { ConsignorPerformance } from './consignor-performance';
import { ExpiringConsignment } from './expiring-consignment';
import { PointSales } from './point-sales';
import { ReceptionDiscrepancyReport } from './reception-discrepancies';
import { garmentInScope, ReportFilters, saleInRange } from '../shared/report-filters';
import { RotationReport } from './rotation';

const DAY_MS = 24 * 60 * 60 * 1000;

const ACCEPTED_STATUSES: GarmentStatus[] = [
  'agreed',
  'in_stock',
  'with_remarks',
  'rejected',
  'sold',
  'paid_out',
];

// Physically taken into the shop (whether still in stock or already sold); the base for conversion.
const RECEIVED_STATUSES: GarmentStatus[] = ['in_stock', 'with_remarks', 'sold', 'paid_out'];

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

  async receptionDiscrepancies(merchantId: string): Promise<ReceptionDiscrepancyReport> {
    const garments = await this.garments.byMerchant(merchantId);
    const receptions = await this.receptions.byGarmentIds(garments.map((g) => g.id));

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

  async salesByPoint(merchantId: string, filters: ReportFilters = {}): Promise<PointSales[]> {
    const merchant = await this.users.findMerchantById(merchantId);
    const nameById = new Map<string, string>();
    for (const sp of merchant?.salesPoints ?? []) {
      nameById.set((sp as unknown as { id: string }).id, sp.name);
    }
    const garments = (await this.garments.byMerchant(merchantId)).filter((g) =>
      garmentInScope(g, filters),
    );
    const pointByGarment = new Map(garments.map((g) => [g.id, g.salesPointId]));
    const sales = (await this.sales.byGarmentIds(garments.map((g) => g.id))).filter((s) =>
      saleInRange(s.soldAt, filters),
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
    const garments = (await this.garments.byMerchant(merchantId)).filter((g) =>
      garmentInScope(g, filters),
    );
    const garmentById = new Map(garments.map((g) => [g.id, g]));
    const sales = (await this.sales.byGarmentIds([...garmentById.keys()])).filter((s) =>
      saleInRange(s.soldAt, filters),
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
    const garments = (await this.garments.byMerchant(merchantId)).filter((g) =>
      garmentInScope(g, filters),
    );
    const sales = (await this.sales.byGarmentIds(garments.map((garment) => garment.id))).filter(
      (s) => saleInRange(s.soldAt, filters),
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
        avgPayoutDays: paidCount ? Math.round(payoutDaysTotal / paidCount) : null,
      };
    });

    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }

  async salesByCategory(merchantId: string, filters: ReportFilters = {}): Promise<CategorySales[]> {
    const garments = (await this.garments.byMerchant(merchantId)).filter((g) =>
      garmentInScope(g, filters),
    );
    const garmentById = new Map(garments.map((garment) => [garment.id, garment]));
    const sales = (await this.sales.byGarmentIds([...garmentById.keys()])).filter((s) =>
      saleInRange(s.soldAt, filters),
    );

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
    const merchant = await this.users.findMerchantById(merchantId);
    const graceMonths = merchant?.terms.graceMonths ?? 0;

    const inStock = (await this.garments.byMerchant(merchantId)).filter(
      (garment) =>
        (garment.status === 'in_stock' || garment.status === 'with_remarks') &&
        garmentInScope(garment, filters),
    );
    const agreements = await this.agreements.listForUser('merchant', merchantId);
    const agreementByGarment = new Map(agreements.map((a) => [a.garmentId, a]));
    const consignors = await this.users.consignorSummaries();
    const consignorById = new Map(consignors.map((c) => [c.id, c]));

    const now = new Date();
    const threshold = this.addDays(now, withinDays);

    const items: ExpiringConsignment[] = [];
    for (const garment of inStock) {
      const agreement = agreementByGarment.get(garment.id);
      if (!agreement) continue;
      const effectiveDeadline = this.addMonths(agreement.saleDeadline, graceMonths);
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

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  private addMonths(date: Date, months: number): Date {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
  }
}
