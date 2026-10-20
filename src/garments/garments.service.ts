import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventActor, GarmentCondition, NotificationType } from '../shared/domain/enums';

export interface EditableGarmentFields {
  name: string;
  category: string;
  subcategory?: string;
  brand: string;
  size: string;
  color: string;
  season: string;
  condition: GarmentCondition;
  description?: string;
  photos: string[];
  video?: string;
}
import { canTransition, GarmentAction, transition } from '../shared/state-machine/garment.state-machine';
import type { EmailDetail } from '../mail/templates';
import { CategoriesService } from '../categories/categories.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateGarmentDto } from './dto/create-garment.dto';
import { Counter } from './schemas/counter.schema';
import { Garment, GarmentDocument } from './schemas/garment.schema';

interface NotificationTemplate {
  type: NotificationType;
  text: (garment: GarmentDocument) => string;
}

const CONDITION_LABELS: Record<string, string> = {
  new: 'Nuevo',
  very_good: 'Muy bueno',
  good: 'Bueno',
  fair: 'Regular',
};

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
  CANCEL: {
    type: 'proposal',
    text: (garment) => `El cedente canceló "${garment.name}".`,
  },
};

@Injectable()
export class GarmentsService {
  constructor(
    @InjectModel(Garment.name) private readonly garmentModel: Model<Garment>,
    @InjectModel(Counter.name) private readonly counterModel: Model<Counter>,
    private readonly notifications: NotificationsService,
    private readonly categories: CategoriesService,
  ) {}

  // Código legible y correlativo (TRA-00001) para que el comercio identifique la prenda.
  async nextCode(): Promise<string> {
    const counter = await this.counterModel
      .findOneAndUpdate({ _id: 'garment' }, { $inc: { seq: 1 } }, { upsert: true, new: true })
      .exec();
    return `TRA-${String(counter.seq).padStart(5, '0')}`;
  }

  async create(consignorId: string, dto: CreateGarmentDto): Promise<GarmentDocument> {
    const validCategory = await this.categories.isValidForMerchant(dto.category, dto.merchantId);
    if (!validCategory) {
      throw new BadRequestException(`La categoría "${dto.category}" no está disponible para este comercio.`);
    }
    const createdAt = new Date();
    const status = transition('submitted', 'SUBMIT_PROPOSAL');
    const garment = new this.garmentModel({
      ...dto,
      consignorId,
      code: await this.nextCode(),
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
        garmentStatus: garment.status,
        emailDetails: [
          { label: 'Categoría', value: garment.category },
          { label: 'Marca', value: garment.brand },
          { label: 'Talle', value: garment.size },
          { label: 'Estado', value: CONDITION_LABELS[garment.condition] ?? garment.condition },
        ],
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

  // Edición del cedente mientras la consignación está en revisión (antes de que
  // el comercio la acepte o contraoferte). No cambia el comercio.
  async editDraft(
    id: string,
    consignorId: string,
    fields: EditableGarmentFields,
  ): Promise<GarmentDocument> {
    const garment = await this.getByIdOrFail(id);
    if (garment.consignorId !== consignorId) {
      throw new ForbiddenException('La prenda no te pertenece');
    }
    if (garment.status !== 'under_review') {
      throw new BadRequestException(
        'Solo podés editar la consignación mientras el comercio no la haya revisado.',
      );
    }
    const validCategory = await this.categories.isValidForMerchant(
      fields.category,
      garment.merchantId,
    );
    if (!validCategory) {
      throw new BadRequestException(
        `La categoría "${fields.category}" no está disponible para este comercio.`,
      );
    }
    garment.name = fields.name;
    garment.category = fields.category;
    garment.subcategory = fields.subcategory;
    garment.brand = fields.brand;
    garment.size = fields.size;
    garment.color = fields.color;
    garment.season = fields.season;
    garment.condition = fields.condition;
    garment.description = fields.description ?? '';
    garment.photos = fields.photos;
    garment.video = fields.video;
    await garment.save();
    return garment;
  }

  // Los listados solo muestran, a lo sumo, una miniatura (primera foto). Recortar
  // a la primera con $slice evita mandar todas las fotos base64 de cada prenda,
  // que inflaban los payloads. El detalle (getByIdOrFail) devuelve todas.
  byConsignor(consignorId: string): Promise<GarmentDocument[]> {
    return this.garmentModel.find({ consignorId }, { photos: { $slice: 1 } }).exec();
  }

  byMerchant(merchantId: string): Promise<GarmentDocument[]> {
    return this.garmentModel.find({ merchantId }, { photos: { $slice: 1 } }).exec();
  }

  // Reportes, liquidaciones y agregaciones nunca muestran fotos, video ni el timeline.
  // Esos campos (sobre todo las fotos base64) dominan el tamaño del documento, así que
  // excluirlos evita transferir megabytes por comercio en cada endpoint de reportes.
  private static readonly META_PROJECTION = { photos: 0, video: 0, timeline: 0 } as const;

  metaByConsignor(consignorId: string): Promise<GarmentDocument[]> {
    return this.garmentModel.find({ consignorId }, GarmentsService.META_PROJECTION).exec();
  }

  metaByMerchant(merchantId: string): Promise<GarmentDocument[]> {
    return this.garmentModel.find({ merchantId }, GarmentsService.META_PROJECTION).exec();
  }

  async applyAction(
    id: string,
    action: GarmentAction,
    actor: EventActor,
    note?: string,
    emailDetails?: EmailDetail[],
  ): Promise<GarmentDocument> {
    const garment = await this.getByIdOrFail(id);
    if (!canTransition(garment.status, action)) {
      throw new ConflictException(`Transición inválida: ${garment.status} + ${action}`);
    }
    const status = transition(garment.status, action);
    garment.status = status;
    garment.timeline.push({ date: new Date(), actor, status, note });
    await garment.save();
    await this.notify(garment, action, actor, emailDetails);
    return garment;
  }

  private async notify(
    garment: GarmentDocument,
    action: GarmentAction,
    actor: EventActor,
    emailDetails?: EmailDetail[],
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
      emailDetails,
      garmentStatus: garment.status,
    });
  }
}
