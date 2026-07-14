import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventActor, NotificationType } from '../shared/domain/enums';
import { canTransition, GarmentAction, transition } from '../shared/state-machine/garment.state-machine';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateGarmentDto } from './dto/create-garment.dto';
import { Garment, GarmentDocument } from './schemas/garment.schema';

interface NotificationTemplate {
  type: NotificationType;
  text: (garment: GarmentDocument) => string;
}

const ACTION_NOTIFICATION: Partial<Record<GarmentAction, NotificationTemplate>> = {
  COUNTER_OFFER: {
    type: 'counteroffer',
    text: (garment) => `El comercio te hizo una contraoferta por "${garment.name}".`,
  },
  ACCEPT_PROPOSAL: {
    type: 'agreement',
    text: (garment) => `El comercio aceptó tu propuesta de "${garment.name}".`,
  },
  ACCEPT_COUNTEROFFER: {
    type: 'agreement',
    text: (garment) => `El cedente aceptó tu contraoferta de "${garment.name}".`,
  },
  REJECT: {
    type: 'proposal',
    text: (garment) => `El comercio rechazó tu propuesta de "${garment.name}".`,
  },
  RECEIVE_AS_AGREED: {
    type: 'reception',
    text: (garment) => `El comercio recibió "${garment.name}" conforme.`,
  },
  RECEIVE_WITH_REMARKS: {
    type: 'reception',
    text: (garment) => `El comercio recibió "${garment.name}" con observaciones.`,
  },
  REJECT_RECEPTION: {
    type: 'reception',
    text: (garment) => `El comercio rechazó la recepción de "${garment.name}".`,
  },
  REGISTER_SALE: {
    type: 'sale',
    text: (garment) => `¡Vendimos "${garment.name}"!`,
  },
  MARK_PAID_OUT: {
    type: 'payout',
    text: (garment) => `Liquidamos el pago de "${garment.name}".`,
  },
};

@Injectable()
export class GarmentsService {
  constructor(
    @InjectModel(Garment.name) private readonly garmentModel: Model<Garment>,
    private readonly notifications: NotificationsService,
  ) {}

  async create(consignorId: string, dto: CreateGarmentDto): Promise<GarmentDocument> {
    const createdAt = new Date();
    const status = transition('submitted', 'SUBMIT_PROPOSAL');
    const garment = new this.garmentModel({
      ...dto,
      consignorId,
      status,
      createdAt,
      timeline: [
        { date: createdAt, actor: 'consignor', status: 'submitted' },
        { date: createdAt, actor: 'consignor', status, note: 'Propuesta enviada' },
      ],
    } as Garment);
    await garment.save();
    if (garment.merchantId) {
      await this.notifications.emit({
        userId: garment.merchantId,
        type: 'proposal',
        text: `Nueva propuesta de "${garment.name}" para revisar.`,
        target: `/m/garment/${garment.id}`,
      });
    }
    return garment;
  }

  async getByIdOrFail(id: string): Promise<GarmentDocument> {
    const garment = await this.garmentModel.findById(id).exec();
    if (!garment) {
      throw new NotFoundException(`Prenda no encontrada: ${id}`);
    }
    return garment;
  }

  byConsignor(consignorId: string): Promise<GarmentDocument[]> {
    return this.garmentModel.find({ consignorId }).exec();
  }

  byMerchant(merchantId: string): Promise<GarmentDocument[]> {
    return this.garmentModel.find({ merchantId }).exec();
  }

  async applyAction(
    id: string,
    action: GarmentAction,
    actor: EventActor,
    note?: string,
  ): Promise<GarmentDocument> {
    const garment = await this.getByIdOrFail(id);
    if (!canTransition(garment.status, action)) {
      throw new ConflictException(`Transición inválida: ${garment.status} + ${action}`);
    }
    const status = transition(garment.status, action);
    garment.status = status;
    garment.timeline.push({ date: new Date(), actor, status, note });
    await garment.save();
    await this.notify(garment, action, actor);
    return garment;
  }

  private async notify(
    garment: GarmentDocument,
    action: GarmentAction,
    actor: EventActor,
  ): Promise<void> {
    const template = ACTION_NOTIFICATION[action];
    if (!template) return;
    const recipientId = actor === 'merchant' ? garment.consignorId : garment.merchantId;
    if (!recipientId) return;
    const base = actor === 'merchant' ? '/c' : '/m';
    await this.notifications.emit({
      userId: recipientId,
      type: template.type,
      text: template.text(garment),
      target: `${base}/garment/${garment.id}`,
    });
  }
}
