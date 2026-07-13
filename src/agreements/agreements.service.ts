import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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
  constructor(@InjectModel(Agreement.name) private readonly model: Model<Agreement>) {}

  async create(data: NewAgreement): Promise<AgreementDocument> {
    const agreement = new this.model(data);
    await agreement.save();
    return agreement;
  }

  byGarment(garmentId: string): Promise<AgreementDocument | null> {
    return this.model.findOne({ garmentId }).exec();
  }
}
