import { Injectable } from '@nestjs/common';
import { AgreementsService } from '../agreements/agreements.service';
import { GarmentsService } from '../garments/garments.service';
import { SalesService } from '../sales/sales.service';
import { UsersService } from '../users/users.service';
import { CategorySales } from './category-sales';
import { ExpiringConsignment } from './expiring-consignment';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ReportsService {
  constructor(
    private readonly garments: GarmentsService,
    private readonly agreements: AgreementsService,
    private readonly sales: SalesService,
    private readonly users: UsersService,
  ) {}

  async salesByCategory(merchantId: string): Promise<CategorySales[]> {
    const garments = await this.garments.byMerchant(merchantId);
    const garmentById = new Map(garments.map((garment) => [garment.id, garment]));
    const sales = await this.sales.byGarmentIds([...garmentById.keys()]);

    const byCategory = new Map<string, CategorySales>();
    const bucket = (category: string): CategorySales => {
      let entry = byCategory.get(category);
      if (!entry) {
        entry = { category, soldCount: 0, soldRevenue: 0, merchantProfit: 0, inStockCount: 0 };
        byCategory.set(category, entry);
      }
      return entry;
    };

    for (const garment of garments) {
      if (garment.status === 'in_stock' || garment.status === 'with_remarks') {
        bucket(garment.category).inStockCount += 1;
      }
    }
    for (const sale of sales) {
      const garment = garmentById.get(sale.garmentId);
      if (!garment) continue;
      const entry = bucket(garment.category);
      entry.soldCount += 1;
      entry.soldRevenue += sale.actualSalePrice;
      entry.merchantProfit += sale.merchantCommission;
    }

    return [...byCategory.values()].sort((a, b) => b.merchantProfit - a.merchantProfit);
  }

  async expiringConsignments(
    merchantId: string,
    withinDays = 30,
  ): Promise<ExpiringConsignment[]> {
    const merchant = await this.users.findMerchantById(merchantId);
    const graceMonths = merchant?.terms.graceMonths ?? 0;

    const inStock = (await this.garments.byMerchant(merchantId)).filter(
      (garment) => garment.status === 'in_stock' || garment.status === 'with_remarks',
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
