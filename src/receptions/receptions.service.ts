import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AgreementsService } from '../agreements/agreements.service';
import { SessionUser } from '../auth/session-user';
import { GarmentsService } from '../garments/garments.service';
import { EmailDetail } from '../mail/templates';
import { SalesPointsService } from '../sales-points/sales-points.service';
import { UsersService } from '../users/users.service';
import { ReceptionDiscrepancy, ReceptionResult } from '../shared/domain/enums';
import { DEFAULT_DELIVERY_DAYS, DEFAULT_PICKUP_DAYS } from '../shared/domain/terms';
import { formatArs, formatDate } from '../shared/format';
import { canTransition, GarmentAction } from '../shared/state-machine/garment.state-machine';
import { CreateReceptionDto } from './dto/create-reception.dto';
import { Reception, ReceptionDocument } from './schemas/reception.schema';

const RESULT_ACTION: Record<ReceptionResult, GarmentAction> = {
  accepted: 'RECEIVE_AS_AGREED',
  with_remarks: 'RECEIVE_WITH_REMARKS',
  rejected: 'REJECT_RECEPTION',
};

const RESULT_NOTE: Record<ReceptionResult, string> = {
  accepted: 'Recibida conforme',
  with_remarks: 'Recibida con observaciones',
  rejected: 'Recepción rechazada',
};

const DISCREPANCY_LABELS: Record<ReceptionDiscrepancy, string> = {
  condition: 'Estado',
  damage: 'Daño',
  photo_mismatch: 'No coincide con la foto',
  measurements: 'Medidas',
  accessories: 'Accesorios',
  hygiene: 'Higiene',
};

@Injectable()
export class ReceptionsService {
  constructor(
    @InjectModel(Reception.name) private readonly receptionModel: Model<Reception>,
    private readonly garments: GarmentsService,
    private readonly agreements: AgreementsService,
    private readonly salesPoints: SalesPointsService,
    private readonly users: UsersService,
  ) {}

  async create(user: SessionUser, dto: CreateReceptionDto): Promise<ReceptionDocument> {
    const garment = await this.garments.getByIdOrFail(dto.garmentId);
    if (garment.merchantId !== user.id) {
      throw new ForbiddenException('La prenda no pertenece al comercio');
    }
    const action = RESULT_ACTION[dto.result];
    if (!canTransition(garment.status, action)) {
      throw new ConflictException(`Transición inválida: ${garment.status} + ${action}`);
    }
    const reception = new this.receptionModel({
      garmentId: dto.garmentId,
      receivedAt: new Date(),
      salesPointId: dto.salesPointId,
      result: dto.result,
      discrepancies: dto.discrepancies,
      detail: dto.detail,
      evidence: dto.evidence,
      receiptNumber: `REC-${Date.now()}`,
      handledBy: user.name,
    });
    await reception.save();
    await this.updateDeadlines(dto.garmentId, dto.result, reception.receivedAt, user.id);
    const details = await this.receptionEmailDetails(dto);
    await this.garments.applyAction(dto.garmentId, action, 'merchant', RESULT_NOTE[dto.result], details);
    return reception;
  }

  // Recibida: empieza la ventana de venta (y después el plazo de retiro). Rechazada: corre un
  // nuevo plazo de entrega desde el rechazo. Los acuerdos anteriores al 23/10/2026 no tienen los
  // plazos congelados y toman la configuración vigente del comercio.
  private async updateDeadlines(
    garmentId: string,
    result: ReceptionResult,
    receivedAt: Date,
    merchantId: string,
  ): Promise<void> {
    const terms = (await this.users.findMerchantById(merchantId))?.terms;
    if (result === 'rejected') {
      await this.agreements.restartDelivery(
        garmentId,
        receivedAt,
        terms?.deliveryDays ?? DEFAULT_DELIVERY_DAYS,
      );
      return;
    }
    await this.agreements.startSaleWindow(garmentId, receivedAt, {
      saleWindowMonths: terms?.saleWindowMonths ?? 3,
      pickupDays: terms?.pickupDays ?? DEFAULT_PICKUP_DAYS,
    });
  }

  // What the consignor needs to know per reception result: price/deadline if it went on sale, the
  // observations if any, and where to pick it up if rejected. Defensive on the related lookups.
  private async receptionEmailDetails(dto: CreateReceptionDto): Promise<EmailDetail[]> {
    const details: EmailDetail[] = [];
    const observations = (dto.discrepancies ?? [])
      .map((d) => DISCREPANCY_LABELS[d] ?? d)
      .join(', ');

    if (dto.result === 'rejected') {
      if (observations) details.push({ label: 'Motivo', value: observations });
      try {
        const point = await this.salesPoints.getById(dto.salesPointId);
        details.push({ label: 'Retiralo en', value: `${point.name} · ${point.address}` });
      } catch {
        // Sales point unavailable: keep the reason.
      }
      const agreement = await this.agreements.byGarment(dto.garmentId).catch(() => null);
      if (agreement?.deliveryDeadline) {
        details.push({
          label: 'Nueva entrega antes del',
          value: formatDate(agreement.deliveryDeadline),
        });
      }
      return details;
    }

    if (dto.result === 'with_remarks' && observations) {
      details.push({ label: 'Observaciones', value: observations });
    }
    try {
      const agreement = await this.agreements.byGarment(dto.garmentId);
      if (agreement) {
        details.push({ label: 'Precio de exhibición', value: formatArs(agreement.agreedSalePrice) });
        details.push({ label: 'En venta hasta', value: formatDate(agreement.saleDeadline) });
        if (agreement.pickupDays) {
          details.push({
            label: 'Si no se vende',
            value: `tenés ${agreement.pickupDays} días para retirarla`,
          });
        }
      }
    } catch {
      // Agreement unavailable: keep whatever we have.
    }
    return details;
  }

  byGarment(garmentId: string): Promise<ReceptionDocument | null> {
    return this.receptionModel.findOne({ garmentId }).exec();
  }

  byGarmentIds(garmentIds: string[]): Promise<ReceptionDocument[]> {
    return this.receptionModel.find({ garmentId: { $in: garmentIds } }).exec();
  }
}
