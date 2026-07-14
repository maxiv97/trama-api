import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GarmentsService } from '../garments/garments.service';
import { Role } from '../shared/domain/enums';
import { Agreement, AgreementDocument } from './schemas/agreement.schema';

export interface NewAgreement {
  garmentId: string;
  agreedConsignorPrice: number;
  agreedSalePrice: number;
  appliedCommission: number;
  agreedAt: Date;
  saleDeadline: Date;
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

  async listForUser(role: Role, userId: string): Promise<AgreementDocument[]> {
    const garments =
      role === 'merchant'
        ? await this.garments.byMerchant(userId)
        : await this.garments.byConsignor(userId);
    const garmentIds = garments.map((garment) => garment.id);
    return this.model.find({ garmentId: { $in: garmentIds } }).exec();
  }
}
