import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AgreementsService } from '../agreements/agreements.service';
import { AgreementDocument } from '../agreements/schemas/agreement.schema';
import { GarmentsService } from '../garments/garments.service';
import { GarmentDocument } from '../garments/schemas/garment.schema';
import type { EmailDetail } from '../mail/templates';
import { NotificationsService } from '../notifications/notifications.service';
import { SalesPointsService } from '../sales-points/sales-points.service';
import type { GarmentStatus, NotificationType } from '../shared/domain/enums';
import { formatDate } from '../shared/format';
import { GarmentAction } from '../shared/state-machine/garment.state-machine';
import {
  addDays,
  DAY_MS,
  DEFAULT_DELIVERY_DAYS,
  DEFAULT_PICKUP_DAYS,
} from '../shared/domain/terms';
import { UsersService } from '../users/users.service';

// Cuánto antes de cada vencimiento se avisa al cedente.
export const DELIVERY_REMINDER_DAYS = 2;
export const SALE_REMINDER_DAYS = 7;
export const PICKUP_REMINDER_DAYS = 3;

// Un vencimiento más viejo que esto se aplica sin avisar: evita una ola de avisos atrasados la
// primera vez que corre la tarea sobre datos existentes (o si la tarea estuvo caída varios días).
const RECENT_MS = 2 * DAY_MS;

// Marcas guardadas en Agreement.notices: cada aviso se emite una sola vez por prenda.
type NoticeKind =
  | 'delivery_reminder'
  | 'delivery_expired'
  | 'sale_reminder'
  | 'sale_expired'
  | 'pickup_reminder'
  | 'unclaimed';

type Audience = 'consignor' | 'merchant';

interface PendingNotice {
  agreement: AgreementDocument;
  garment: GarmentDocument;
  kind: NoticeKind;
  date: Date; // la fecha que se informa (vencimiento o nuevo plazo)
  silent: boolean; // vencimiento viejo: se marca como avisado sin emitir
}

export interface DeadlinesRunResult {
  deliveryExpired: number;
  saleExpired: number;
  unclaimed: number;
  notifications: number;
}

const NOTICE_TYPE: Record<NoticeKind, NotificationType> = {
  delivery_reminder: 'delivery',
  delivery_expired: 'delivery',
  sale_reminder: 'expiry',
  sale_expired: 'expiry',
  pickup_reminder: 'pickup',
  unclaimed: 'pickup',
};

// Quién recibe cada aviso. Los recordatorios son solo para el cedente: el comercio ve los
// plazos próximos en las urgencias de su panel.
const NOTICE_AUDIENCE: Record<NoticeKind, Audience[]> = {
  delivery_reminder: ['consignor'],
  delivery_expired: ['consignor', 'merchant'],
  sale_reminder: ['consignor'],
  sale_expired: ['consignor', 'merchant'],
  pickup_reminder: ['consignor'],
  unclaimed: ['consignor', 'merchant'],
};

/**
 * Plazos de la consignación: entrega (acordada → entregada), venta (en stock → vendida) y retiro
 * (por retirar → retirada). Una vez por día aplica los vencimientos y emite los avisos previos.
 * Es idempotente: se puede ejecutar varias veces el mismo día sin duplicar transiciones ni avisos.
 */
@Injectable()
export class DeadlinesService {
  private readonly logger = new Logger(DeadlinesService.name);

  constructor(
    private readonly agreements: AgreementsService,
    private readonly garments: GarmentsService,
    private readonly users: UsersService,
    private readonly salesPoints: SalesPointsService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('0 3 * * *', {
    name: 'deadlines',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
  async scheduledRun(): Promise<void> {
    try {
      const result = await this.run();
      this.logger.log(`Plazos procesados: ${JSON.stringify(result)}`);
    } catch (error) {
      this.logger.error('Falló la tarea de plazos', error as Error);
    }
  }

  async run(now: Date = new Date()): Promise<DeadlinesRunResult> {
    const result: DeadlinesRunResult = {
      deliveryExpired: 0,
      saleExpired: 0,
      unclaimed: 0,
      notifications: 0,
    };
    const pending: PendingNotice[] = [];
    await this.backfillDeliveryDeadlines(now);

    // 1 · Entrega: acordadas (o con recepción rechazada) que no llegaron al comercio.
    for (const { agreement, garment } of await this.due(
      'deliveryDeadline',
      now,
      DELIVERY_REMINDER_DAYS,
      ['agreed', 'rejected'],
    )) {
      const deadline = agreement.deliveryDeadline as Date;
      if (deadline <= now) {
        await this.expire(
          garment,
          'EXPIRE_DELIVERY',
          'Venció el plazo de entrega',
        );
        result.deliveryExpired += 1;
        this.queue(
          pending,
          agreement,
          garment,
          'delivery_expired',
          deadline,
          now,
        );
      } else {
        this.queue(
          pending,
          agreement,
          garment,
          'delivery_reminder',
          deadline,
          now,
        );
      }
    }

    // 2 · Venta: en stock sin vender al terminar la ventana. Pasa a Por retirar y corre el plazo
    // de retiro. Si el vencimiento es viejo (datos previos a esta funcionalidad), el plazo de
    // retiro se cuenta desde hoy, para que el cedente tenga el tiempo completo para retirarla.
    for (const { agreement, garment } of await this.due(
      'saleDeadline',
      now,
      SALE_REMINDER_DAYS,
      ['in_stock', 'with_remarks'],
    )) {
      const deadline = agreement.saleDeadline;
      if (deadline <= now) {
        const pickupDays =
          agreement.pickupDays ?? (await this.merchantPickupDays(garment));
        const from = this.isRecent(deadline, now) ? deadline : now;
        agreement.pickupDays = pickupDays;
        agreement.pickupDeadline = addDays(from, pickupDays);
        await agreement.save();
        await this.expire(
          garment,
          'EXPIRE_SALE',
          'Terminó el período de venta',
        );
        result.saleExpired += 1;
        this.queue(
          pending,
          agreement,
          garment,
          'sale_expired',
          agreement.pickupDeadline,
          now,
          deadline,
        );
      } else {
        this.queue(pending, agreement, garment, 'sale_reminder', deadline, now);
      }
    }

    // 3 · Retiro: por retirar que el cedente no pasó a buscar.
    for (const { agreement, garment } of await this.due(
      'pickupDeadline',
      now,
      PICKUP_REMINDER_DAYS,
      ['awaiting_pickup'],
    )) {
      const deadline = agreement.pickupDeadline as Date;
      if (deadline <= now) {
        await this.expire(
          garment,
          'MARK_UNCLAIMED',
          'Venció el plazo para retirarla',
        );
        result.unclaimed += 1;
        this.queue(pending, agreement, garment, 'unclaimed', deadline, now);
      } else {
        this.queue(
          pending,
          agreement,
          garment,
          'pickup_reminder',
          deadline,
          now,
        );
      }
    }

    result.notifications = await this.emitGrouped(pending);
    return result;
  }

  // Los acuerdos cerrados antes de que existiera el plazo de entrega no lo tienen: si la prenda
  // todavía no se entregó, se le da el plazo completo desde hoy (con la configuración vigente del
  // comercio), en lugar de dejarla esperando indefinidamente o vencerla sin aviso.
  private async backfillDeliveryDeadlines(now: Date): Promise<void> {
    const legacy = await this.agreements.withoutDeliveryDeadline();
    if (legacy.length === 0) return;
    const garments = await this.garments.metaByIds(
      legacy.map((a) => a.garmentId),
    );
    const byId = new Map(garments.map((g) => [g.id, g]));
    for (const agreement of legacy) {
      const garment = byId.get(agreement.garmentId);
      if (
        !garment ||
        (garment.status !== 'agreed' && garment.status !== 'rejected')
      )
        continue;
      const merchant = garment.merchantId
        ? await this.users.findMerchantById(garment.merchantId)
        : null;
      agreement.deliveryDays =
        merchant?.terms.deliveryDays ?? DEFAULT_DELIVERY_DAYS;
      agreement.deliveryDeadline = addDays(now, agreement.deliveryDays);
      await agreement.save();
    }
  }

  // Acuerdos cuyo plazo vence hasta `reminderDays` días después de `now`, con la prenda en alguno
  // de los estados en que ese plazo aplica.
  private async due(
    field: 'deliveryDeadline' | 'saleDeadline' | 'pickupDeadline',
    now: Date,
    reminderDays: number,
    statuses: GarmentStatus[],
  ): Promise<{ agreement: AgreementDocument; garment: GarmentDocument }[]> {
    const agreements = await this.agreements.dueBy(
      field,
      addDays(now, reminderDays),
    );
    if (agreements.length === 0) return [];
    const garments = await this.garments.metaByIds(
      agreements.map((a) => a.garmentId),
    );
    const byId = new Map(garments.map((g) => [g.id, g]));
    return agreements
      .map((agreement) => ({
        agreement,
        garment: byId.get(agreement.garmentId),
      }))
      .filter(
        (
          pair,
        ): pair is { agreement: AgreementDocument; garment: GarmentDocument } =>
          !!pair.garment && statuses.includes(pair.garment.status),
      );
  }

  private async expire(
    garment: GarmentDocument,
    action: GarmentAction,
    note: string,
  ): Promise<void> {
    await this.garments.applyAction(garment.id, action, 'system', note);
  }

  // Encola el aviso si todavía no se emitió. Los vencimientos viejos se marcan como avisados sin
  // emitir nada (ver RECENT_MS).
  private queue(
    pending: PendingNotice[],
    agreement: AgreementDocument,
    garment: GarmentDocument,
    kind: NoticeKind,
    date: Date,
    now: Date,
    expiredAt: Date = date,
  ): void {
    if (agreement.notices.includes(kind)) return;
    const isExpiry =
      kind === 'delivery_expired' ||
      kind === 'sale_expired' ||
      kind === 'unclaimed';
    const silent = isExpiry && !this.isRecent(expiredAt, now);
    pending.push({ agreement, garment, kind, date, silent });
  }

  private isRecent(date: Date, now: Date): boolean {
    return now.getTime() - date.getTime() <= RECENT_MS;
  }

  private async merchantPickupDays(garment: GarmentDocument): Promise<number> {
    if (!garment.merchantId) return DEFAULT_PICKUP_DAYS;
    const merchant = await this.users.findMerchantById(garment.merchantId);
    return merchant?.terms.pickupDays ?? DEFAULT_PICKUP_DAYS;
  }

  // Un aviso por destinatario, tipo de aviso, punto de venta y fecha: si a un cedente le vencen
  // tres prendas el mismo día en el mismo local, recibe un solo aviso con las tres.
  private async emitGrouped(pending: PendingNotice[]): Promise<number> {
    const groups = new Map<
      string,
      { audience: Audience; userId: string; items: PendingNotice[] }
    >();
    for (const notice of pending.filter((n) => !n.silent)) {
      for (const audience of NOTICE_AUDIENCE[notice.kind]) {
        const userId =
          audience === 'consignor'
            ? notice.garment.consignorId
            : notice.garment.merchantId;
        if (!userId) continue;
        const key = [
          audience,
          userId,
          notice.kind,
          notice.garment.salesPointId ?? '',
          formatDate(notice.date),
          // El comercio recibe un aviso por cedente: así puede contactarlo.
          audience === 'merchant' ? notice.garment.consignorId : '',
        ].join('|');
        const group = groups.get(key) ?? { audience, userId, items: [] };
        group.items.push(notice);
        groups.set(key, group);
      }
    }

    let emitted = 0;
    const consignorNames = await this.consignorNames(pending);
    for (const group of groups.values()) {
      const first = group.items[0];
      const point = await this.salesPoint(first.garment.salesPointId);
      await this.notifications.emit({
        userId: group.userId,
        type: NOTICE_TYPE[first.kind],
        text: this.text(
          group.audience,
          first.kind,
          group.items,
          point?.name,
          consignorNames,
        ),
        target: this.target(group.audience, group.items),
        emailDetails: this.details(group.audience, first, group.items, point),
        garmentStatus:
          group.items.length === 1 ? first.garment.status : undefined,
      });
      emitted += 1;
    }

    // Las marcas se guardan después de emitir: si algo falla antes, el aviso sale en la próxima
    // ejecución en lugar de perderse.
    const touched = new Set<AgreementDocument>();
    for (const notice of pending) {
      if (!notice.agreement.notices.includes(notice.kind))
        notice.agreement.notices.push(notice.kind);
      touched.add(notice.agreement);
    }
    await Promise.all([...touched].map((agreement) => agreement.save()));
    return emitted;
  }

  private text(
    audience: Audience,
    kind: NoticeKind,
    items: PendingNotice[],
    pointName: string | undefined,
    consignorNames: Map<string, string>,
  ): string {
    const one = items.length === 1;
    const name = `"${items[0].garment.name}"`;
    const what = one ? name : `${items.length} prendas`;
    const date = formatDate(items[0].date);
    const where = pointName ? ` en ${pointName}` : '';
    const consignor =
      consignorNames.get(items[0].garment.consignorId) ?? 'El cedente';

    if (audience === 'merchant') {
      switch (kind) {
        case 'delivery_expired':
          return `${consignor} no entregó ${what} dentro del plazo. El acuerdo quedó sin efecto.`;
        case 'sale_expired':
          return one
            ? `${name} terminó su período de venta sin venderse: sacala de exhibición. ${consignor} tiene hasta el ${date} para retirarla.`
            : `${what} de ${consignor} terminaron su período de venta sin venderse: sacalas de exhibición. Tiene hasta el ${date} para retirarlas.`;
        case 'unclaimed':
          return `${consignor} no retiró ${what} a tiempo. Registrá el destino desde la ficha de la prenda.`;
        default:
          return '';
      }
    }

    switch (kind) {
      case 'delivery_reminder':
        return `Recordá entregar ${what}${where} antes del ${date}.`;
      case 'delivery_expired':
        return `Venció el plazo para entregar ${what}${where}. El acuerdo quedó sin efecto.`;
      case 'sale_reminder':
        return one
          ? `${name} termina su período de venta el ${date}.`
          : `${what} terminan su período de venta el ${date}.`;
      case 'sale_expired':
        return one
          ? `${name} no se vendió. Retirala${where} antes del ${date}.`
          : `${what} no se vendieron. Retiralas${where} antes del ${date}.`;
      case 'pickup_reminder':
        return `Te quedan pocos días para retirar ${what}${where}: el plazo vence el ${date}.`;
      case 'unclaimed':
        return `Venció el plazo para retirar ${what}. El comercio dispondrá de ${one ? 'la prenda' : 'las prendas'} según los Términos y condiciones.`;
    }
  }

  private target(audience: Audience, items: PendingNotice[]): string {
    const base = audience === 'consignor' ? '/c' : '/m';
    return items.length === 1 ? `${base}/garment/${items[0].garment.id}` : base;
  }

  private details(
    audience: Audience,
    first: PendingNotice,
    items: PendingNotice[],
    point: {
      name: string;
      address: string;
      receptionSchedule?: { days: string; hours: string };
    } | null,
  ): EmailDetail[] {
    const details: EmailDetail[] = [];
    if (items.length > 1) {
      details.push({
        label: 'Prendas',
        value: items.map((n) => n.garment.name).join(', '),
      });
    }
    const pickupOrDelivery =
      audience === 'consignor' &&
      ['delivery_reminder', 'sale_expired', 'pickup_reminder'].includes(
        first.kind,
      );
    if (point && pickupOrDelivery) {
      details.push({
        label: 'Dónde',
        value: `${point.name} · ${point.address}`,
      });
      if (point.receptionSchedule) {
        details.push({
          label: 'Horario',
          value: `${point.receptionSchedule.days} · ${point.receptionSchedule.hours}`,
        });
      }
    }
    if (first.kind === 'sale_expired' || first.kind === 'pickup_reminder') {
      details.push({
        label: 'Retirala antes del',
        value: formatDate(first.date),
      });
      if (audience === 'consignor')
        details.push({ label: 'Llevá', value: 'Tu DNI' });
    }
    return details;
  }

  private async salesPoint(id: string | undefined) {
    if (!id) return null;
    try {
      return await this.salesPoints.getById(id);
    } catch {
      return null;
    }
  }

  private async consignorNames(
    pending: PendingNotice[],
  ): Promise<Map<string, string>> {
    const ids = [...new Set(pending.map((n) => n.garment.consignorId))];
    const summaries = await this.users.consignorSummaries(ids);
    return new Map(summaries.map((c) => [c.id, c.name]));
  }
}
