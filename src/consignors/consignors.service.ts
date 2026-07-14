import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GarmentsService } from '../garments/garments.service';
import { Consignor, ConsignorDocument } from '../users/schemas/consignor.schema';

@Injectable()
export class ConsignorsService {
  constructor(
    @InjectModel(Consignor.name) private readonly consignorModel: Model<Consignor>,
    private readonly garments: GarmentsService,
  ) {}

  list(): Promise<ConsignorDocument[]> {
    return this.consignorModel.find().exec();
  }

  async getByIdOrFail(id: string): Promise<ConsignorDocument> {
    const consignor = await this.consignorModel.findById(id).exec();
    if (!consignor) {
      throw new NotFoundException(`Cedente no encontrado: ${id}`);
    }
    return consignor;
  }

  async byMerchant(merchantId: string): Promise<ConsignorDocument[]> {
    const garments = await this.garments.byMerchant(merchantId);
    const consignorIds = [...new Set(garments.map((garment) => garment.consignorId))];
    return this.consignorModel.find({ _id: { $in: consignorIds } }).exec();
  }
}
