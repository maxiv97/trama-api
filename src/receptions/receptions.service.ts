import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SessionUser } from '../auth/session-user';
import { GarmentsService } from '../garments/garments.service';
import { ReceptionResult } from '../shared/domain/enums';
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

@Injectable()
export class ReceptionsService {
  constructor(
    @InjectModel(Reception.name) private readonly receptionModel: Model<Reception>,
    private readonly garments: GarmentsService,
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
    await this.garments.applyAction(dto.garmentId, action, 'merchant', RESULT_NOTE[dto.result]);
    return reception;
  }

  byGarment(garmentId: string): Promise<ReceptionDocument | null> {
    return this.receptionModel.findOne({ garmentId }).exec();
  }
}
