import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GarmentsService } from '../garments/garments.service';
import { Role } from '../shared/domain/enums';
import { addDays, addMonths } from '../shared/domain/terms';
import { Agreement, AgreementDocument } from './schemas/agreement.schema';

export interface NewAgreement {
  garmentId: string;
  agreedConsignorPrice: number;
  agreedSalePrice: number;
  appliedCommission: number;
  agreedAt: Date;
  saleDeadline: Date;
  saleWindowMonths?: number;
  deliveryDays?: number;
  deliveryDeadline?: Date;
  pickupDays?: number;
}

@Injectable()
export class AgreementsService {
  constructor(
    @InjectModel(Agreement.name) private readonly model: Model<Agreement>,
    private readonly garments: GarmentsService,
  ) {}

  async create(data: NewAgreement): Promise<AgreementDocument> {
    const agreement = new this.model(data);
    await agreement.save();
    return agreement;
  }

  byGarment(garmentId: string): Promise<AgreementDocument | null> {
    return this.model.findOne({ garmentId }).exec();
  }

  // La recepción conforme o con observaciones inicia la ventana de venta y, a continuación, el
  // plazo para retirar la prenda si no se vende.
  async startSaleWindow(
    garmentId: string,
    receivedAt: Date,
    fallback: { saleWindowMonths: number; pickupDays: number },
  ): Promise<AgreementDocument | null> {
    const agreement = await this.byGarment(garmentId);
    if (!agreement) return null;
    agreement.saleWindowMonths ??= fallback.saleWindowMonths;
    agreement.pickupDays ??= fallback.pickupDays;
    agreement.saleDeadline = addMonths(receivedAt, agreement.saleWindowMonths);
    agreement.pickupDeadline = addDays(agreement.saleDeadline, agreement.pickupDays);
    await agreement.save();
    return agreement;
  }

  // Una recepción rechazada da un nuevo plazo de entrega desde el rechazo. La nueva entrega
  // (REDELIVER) no lo reinicia, para que no se pueda estirar la espera indefinidamente.
  async restartDelivery(
    garmentId: string,
    from: Date,
    fallbackDeliveryDays: number,
  ): Promise<AgreementDocument | null> {
    const agreement = await this.byGarment(garmentId);
    if (!agreement) return null;
    agreement.deliveryDays ??= fallbackDeliveryDays;
    agreement.deliveryDeadline = addDays(from, agreement.deliveryDays);
    agreement.notices = agreement.notices.filter((n) => !n.startsWith('delivery'));
    await agreement.save();
    return agreement;
  }

  byGarmentIds(garmentIds: string[]): Promise<AgreementDocument[]> {
    return this.model.find({ garmentId: { $in: garmentIds } }).exec();
  }

  // Acuerdos anteriores a los plazos de entrega (23/10/2026), que todavía no tienen uno.
  withoutDeliveryDeadline(): Promise<AgreementDocument[]> {
    return this.model.find({ deliveryDeadline: { $exists: false } }).exec();
  }

  // Acuerdos con alguno de los plazos anterior a `until` (consultas indexadas por fecha).
  dueBy(
    field: 'deliveryDeadline' | 'saleDeadline' | 'pickupDeadline',
    until: Date,
  ): Promise<AgreementDocument[]> {
    return this.model.find({ [field]: { $lte: until } }).exec();
  }

  async listForUser(role: Role, userId: string): Promise<AgreementDocument[]> {
    const garments =
      role === 'merchant'
        ? await this.garments.metaByMerchant(userId)
        : await this.garments.metaByConsignor(userId);
    const garmentIds = garments.map((garment) => garment.id);
    return this.model.find({ garmentId: { $in: garmentIds } }).exec();
  }
}
