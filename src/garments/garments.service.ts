import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventActor } from '../shared/domain/enums';
import { canTransition, GarmentAction, transition } from '../shared/state-machine/garment.state-machine';
import { CreateGarmentDto } from './dto/create-garment.dto';
import { Garment, GarmentDocument } from './schemas/garment.schema';

@Injectable()
export class GarmentsService {
  constructor(@InjectModel(Garment.name) private readonly garmentModel: Model<Garment>) {}

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
    return garment;
  }
}
