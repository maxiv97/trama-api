import { ForbiddenException, Injectable } from '@nestjs/common';
import { SessionUser } from '../auth/session-user';
import { GarmentsService } from '../garments/garments.service';
import { SaleDocument } from '../sales/schemas/sale.schema';
import { SalesService } from '../sales/sales.service';
import { Role } from '../shared/domain/enums';
import { garmentInScope, ReportFilters, dateInRange } from '../shared/report-filters';
import { monthKey } from '../shared/utils/month.util';
import { ConsignorSummary, MerchantSummary, UsersService } from '../users/users.service';
import { SettleDto } from './dto/settle.dto';
import { MonthlyPayout, Payout } from './monthly-payout';

type Perspective = Role;

@Injectable()
export class PayoutsService {
  constructor(
    private readonly garments: GarmentsService,
    private readonly sales: SalesService,
    private readonly users: UsersService,
  ) {}

  monthly(role: Role, userId: string, filters: ReportFilters = {}): Promise<MonthlyPayout[]> {
    return this.buildMonthly(role, userId, filters);
  }

  async flat(role: Role, userId: string, filters: ReportFilters = {}): Promise<Payout[]> {
    const groups = await this.buildMonthly(role, userId, filters);
    return groups.map((group) => ({
      id: group.key,
      consignorId: role === 'consignor' ? userId : group.counterpartId,
      merchantId: role === 'merchant' ? userId : group.counterpartId,
      month: group.month,
      saleIds: [],
      totalAmount: group.totalAmount,
      status: group.status,
      dueDate: group.dueDate,
      paidAt: group.paidAt,
    }));
  }

  async settle(user: SessionUser, dto: SettleDto): Promise<SaleDocument[]> {
    const method = dto.paymentMethod === 'cash' ? 'Efectivo' : 'Transferencia';
    const note = `Pago: ${method} · Comp. ${dto.receiptNumber || '—'}`;
    const paid: SaleDocument[] = [];
    for (const garmentId of dto.garmentIds) {
      const garment = await this.garments.getByIdOrFail(garmentId);
      if (garment.merchantId !== user.id) {
        throw new ForbiddenException('La prenda no pertenece al comercio');
      }
      await this.garments.applyAction(garmentId, 'MARK_PAID_OUT', 'merchant', note);
      paid.push(
        await this.sales.markPaid(garmentId, {
          paymentMethod: dto.paymentMethod,
          receiptNumber: dto.receiptNumber,
        }),
      );
    }
    return paid;
  }

  private async buildMonthly(
    perspective: Perspective,
    id: string,
    filters: ReportFilters = {},
  ): Promise<MonthlyPayout[]> {
    const garments = (
      perspective === 'merchant'
        ? await this.garments.byMerchant(id)
        : await this.garments.byConsignor(id)
    ).filter((garment) => garmentInScope(garment, filters));
    const garmentById = new Map(garments.map((garment) => [garment.id, garment]));
    const sales = (await this.sales.byGarmentIds([...garmentById.keys()])).filter((sale) =>
      dateInRange(sale.soldAt, filters),
    );

    const [merchants, consignors] = await Promise.all([
      this.users.merchantSummaries(),
      this.users.consignorSummaries(),
    ]);
    const merchantById = new Map<string, MerchantSummary>(merchants.map((m) => [m.id, m]));
    const consignorById = new Map<string, ConsignorSummary>(consignors.map((c) => [c.id, c]));
    const now = new Date();

    const groups = new Map<string, MonthlyPayout>();
    for (const sale of sales) {
      const garment = garmentById.get(sale.garmentId);
      if (!garment || !garment.merchantId) continue;
      const merchant = merchantById.get(garment.merchantId);
      const consignor = consignorById.get(garment.consignorId);
      const month = monthKey(sale.soldAt);
      const counterpartId = perspective === 'merchant' ? garment.consignorId : garment.merchantId;
      const key = `${counterpartId}-${month}`;

      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          month,
          counterpartId,
          counterpartName:
            perspective === 'merchant'
              ? (consignor?.name ?? '—')
              : (merchant?.businessName ?? '—'),
          counterpartDni: perspective === 'merchant' ? consignor?.dni : undefined,
          lines: [],
          unpaidGarmentIds: [],
          totalAmount: 0,
          paidAmount: 0,
          pendingAmount: 0,
          status: 'pending',
          dueDate: this.dueDateFor(month, merchant?.payoutDay ?? 20),
        };
        groups.set(key, group);
      }

      const paid = !!sale.paidAt;
      group.lines.push({
        garmentId: garment.id,
        garmentName: garment.name,
        soldAt: sale.soldAt,
        consignorAmount: sale.consignorAmount,
        paid,
      });
      group.totalAmount += sale.consignorAmount;
      if (paid) {
        group.paidAmount += sale.consignorAmount;
        if (sale.paidAt && (!group.paidAt || sale.paidAt > group.paidAt)) {
          group.paidAt = sale.paidAt;
        }
      } else {
        group.pendingAmount += sale.consignorAmount;
        group.unpaidGarmentIds.push(garment.id);
      }
    }

    const result = [...groups.values()];
    for (const group of result) {
      const allPaid = group.lines.every((line) => line.paid);
      group.status = allPaid ? 'paid' : group.dueDate < now ? 'overdue' : 'pending';
      group.lines.sort((a, b) => a.soldAt.getTime() - b.soldAt.getTime());
    }
    return result.sort(
      (a, b) =>
        b.month.localeCompare(a.month) || a.counterpartName.localeCompare(b.counterpartName),
    );
  }

  private dueDateFor(month: string, payoutDay: number): Date {
    const [year, monthNumber] = month.split('-').map(Number);
    return new Date(year, monthNumber, payoutDay);
  }
}
