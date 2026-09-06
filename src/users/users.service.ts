import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Model } from 'mongoose';
import { Consignor, ConsignorDocument } from './schemas/consignor.schema';
import { Merchant, MerchantDocument } from './schemas/merchant.schema';
import { User, UserDocument, UserLocation } from './schemas/user.schema';

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

export interface CreateConsignorInput {
  name: string;
  email: string;
  phone: string;
  password: string;
  dni: string;
  location: UserLocation;
}

export interface CreateSalesPointInput {
  name: string;
  address: string;
  phone: string;
  geo: { lat: number; lng: number };
  receptionSchedule: { days: string; hours: string; instructions: string };
}

export interface CreateMerchantInput {
  name: string;
  email: string;
  phone: string;
  password: string;
  businessName: string;
  cuit: string;
  location: UserLocation;
  commissionConfig: { consignorPercentage: number; merchantPercentage: number };
  terms: { saleWindowMonths: number; graceMonths: number; payoutDay: number };
  salesPoint: CreateSalesPointInput;
}

const PASSWORD_SALT_ROUNDS = 10;

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

  async createConsignor(input: CreateConsignorInput): Promise<ConsignorDocument> {
    await this.assertEmailAvailable(input.email);
    const password = await bcrypt.hash(input.password, PASSWORD_SALT_ROUNDS);
    return this.consignorModel.create({
      name: input.name,
      email: input.email,
      phone: input.phone,
      verified: false,
      createdAt: new Date(),
      accountStatus: 'active',
      location: input.location,
      dni: input.dni,
      password,
    } as unknown as Consignor);
  }

  async createMerchant(input: CreateMerchantInput): Promise<MerchantDocument> {
    await this.assertEmailAvailable(input.email);
    const password = await bcrypt.hash(input.password, PASSWORD_SALT_ROUNDS);
    const merchant = new this.merchantModel({
      name: input.name,
      email: input.email,
      phone: input.phone,
      verified: false,
      createdAt: new Date(),
      accountStatus: 'active',
      location: input.location,
      businessName: input.businessName,
      cuit: input.cuit,
      commissionConfig: input.commissionConfig,
      terms: input.terms,
      password,
    } as unknown as Merchant);
    merchant.salesPoints = [
      { ...input.salesPoint, merchantId: merchant.id },
    ] as never;
    await merchant.save();
    return merchant;
  }

  private async assertEmailAvailable(email: string): Promise<void> {
    const existing = await this.userModel.exists({ email });
    if (existing) {
      throw new ConflictException('El email ya está registrado');
    }
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
