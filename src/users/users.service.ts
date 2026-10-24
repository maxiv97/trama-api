import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Model } from 'mongoose';
import { DEFAULT_DELIVERY_DAYS, DEFAULT_PICKUP_DAYS } from '../shared/domain/terms';
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
  bankDetails?: string;
}

export interface CreateConsignorInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  dni: string;
  bankDetails?: string;
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
  terms: { saleWindowMonths: number; deliveryDays?: number; pickupDays?: number; payoutDay: number };
  salesPoint: CreateSalesPointInput;
}

const PASSWORD_SALT_ROUNDS = 10;
const VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;

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
      // `name` stays the canonical display value (session, emails, UI); first/last are stored too.
      name: `${input.firstName} ${input.lastName}`,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      verified: false,
      createdAt: new Date(),
      accountStatus: 'active',
      location: input.location,
      dni: input.dni,
      bankDetails: input.bankDetails,
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
      terms: {
        saleWindowMonths: input.terms.saleWindowMonths,
        deliveryDays: input.terms.deliveryDays ?? DEFAULT_DELIVERY_DAYS,
        pickupDays: input.terms.pickupDays ?? DEFAULT_PICKUP_DAYS,
        payoutDay: input.terms.payoutDay,
      },
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

  // Generates a fresh verification code, stores it with a short expiry, and returns it so the caller
  // can email it. Replacing any previous code means "resend" simply issues a new one.
  async issueVerificationCode(userId: string): Promise<string> {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + VERIFICATION_CODE_TTL_MS);
    await this.userModel
      .updateOne(
        { _id: userId },
        { verificationCode: code, verificationCodeExpiresAt: expiresAt },
      )
      .exec();
    return code;
  }

  // Confirms the code and marks the account verified, clearing the code so it cannot be reused.
  async verifyEmail(userId: string, code: string): Promise<void> {
    const user = await this.userModel
      .findById(userId)
      .select('+verificationCode +verificationCodeExpiresAt')
      .exec();
    if (!user || user.verified) {
      throw new BadRequestException('No hay una verificación pendiente');
    }
    const expired = !user.verificationCodeExpiresAt || user.verificationCodeExpiresAt < new Date();
    if (!user.verificationCode || expired) {
      throw new BadRequestException('El código venció. Pedí uno nuevo.');
    }
    if (user.verificationCode !== code) {
      throw new BadRequestException('El código no coincide');
    }
    user.verified = true;
    user.set('verificationCode', undefined);
    user.set('verificationCodeExpiresAt', undefined);
    await user.save();
  }

  findMerchantById(id: string): Promise<MerchantDocument | null> {
    return this.merchantModel.findById(id).exec();
  }

  // Con `ids`, trae solo esos comercios (y solo los campos del resumen) en lugar de toda la
  // colección: los reportes y liquidaciones nunca necesitan más que las contrapartes involucradas.
  async merchantSummaries(ids?: string[]): Promise<MerchantSummary[]> {
    if (ids && ids.length === 0) return [];
    const filter = ids ? { _id: { $in: ids } } : {};
    const merchants = await this.merchantModel
      .find(filter, { name: 1, businessName: 1, 'terms.payoutDay': 1 })
      .exec();
    return merchants.map((merchant) => ({
      id: merchant.id,
      name: merchant.get('name') as string,
      businessName: merchant.businessName,
      payoutDay: merchant.terms.payoutDay,
    }));
  }

  // Igual que merchantSummaries: con `ids` evita escanear a todos los cedentes de la base.
  async consignorSummaries(ids?: string[]): Promise<ConsignorSummary[]> {
    if (ids && ids.length === 0) return [];
    const filter = ids ? { _id: { $in: ids } } : {};
    const consignors = await this.consignorModel
      .find(filter, { name: 1, dni: 1, bankDetails: 1 })
      .exec();
    return consignors.map((consignor) => ({
      id: consignor.id,
      name: consignor.get('name') as string,
      dni: consignor.dni,
      bankDetails: consignor.bankDetails,
    }));
  }
}
