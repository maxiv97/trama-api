import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Consignor } from './schemas/consignor.schema';
import { Merchant, MerchantDocument } from './schemas/merchant.schema';
import { User, UserDocument } from './schemas/user.schema';

export interface MerchantSummary {
  id: string;
  name: string;
  businessName: string;
  payoutDay: number;
}

export interface ConsignorSummary {
  id: string;
  name: string;
  dni: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Merchant.name) private readonly merchantModel: Model<Merchant>,
    @InjectModel(Consignor.name) private readonly consignorModel: Model<Consignor>,
  ) {}

  findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  findByEmailWithPassword(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email }).select('+password').exec();
  }

  findMerchantById(id: string): Promise<MerchantDocument | null> {
    return this.merchantModel.findById(id).exec();
  }

  async merchantSummaries(): Promise<MerchantSummary[]> {
    const merchants = await this.merchantModel.find().exec();
    return merchants.map((merchant) => ({
      id: merchant.id,
      name: merchant.get('name') as string,
      businessName: merchant.businessName,
      payoutDay: merchant.terms.payoutDay,
    }));
  }

  async consignorSummaries(): Promise<ConsignorSummary[]> {
    const consignors = await this.consignorModel.find().exec();
    return consignors.map((consignor) => ({
      id: consignor.id,
      name: consignor.get('name') as string,
      dni: consignor.dni,
    }));
  }
}
