import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Merchant, MerchantDocument } from '../users/schemas/merchant.schema';
import { UpdateMerchantDto } from './dto/update-merchant.dto';

@Injectable()
export class MerchantsService {
  constructor(@InjectModel(Merchant.name) private readonly merchantModel: Model<Merchant>) {}

  list(): Promise<MerchantDocument[]> {
    return this.merchantModel.find().exec();
  }

  async getByIdOrFail(id: string): Promise<MerchantDocument> {
    const merchant = await this.merchantModel.findById(id).exec();
    if (!merchant) {
      throw new NotFoundException(`Comercio no encontrado: ${id}`);
    }
    return merchant;
  }

  async update(id: string, dto: UpdateMerchantDto): Promise<MerchantDocument> {
    const merchant = await this.getByIdOrFail(id);
    merchant.businessName = dto.businessName;
    merchant.set('email', dto.email);
    merchant.set('phone', dto.phone);
    merchant.set('location', dto.location);
    merchant.commissionConfig = dto.commissionConfig;
    merchant.terms = dto.terms;
    await merchant.save();
    return merchant;
  }
}
