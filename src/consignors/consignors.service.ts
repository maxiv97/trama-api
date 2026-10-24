import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
    const consignorIds = await this.garments.consignorIdsByMerchant(merchantId);
    return this.consignorModel.find({ _id: { $in: consignorIds } }).exec();
  }

  // Un comercio solo puede ver a un cedente con el que opera (que le haya consignado alguna
  // prenda); de lo contrario, no tiene por qué acceder a sus datos de contacto.
  async getForMerchantOrFail(id: string, merchantId: string): Promise<ConsignorDocument> {
    const consignor = await this.getByIdOrFail(id);
    if (!(await this.garments.merchantHasConsignor(merchantId, id))) {
      throw new ForbiddenException('El cedente no opera con tu comercio');
    }
    return consignor;
  }
}
