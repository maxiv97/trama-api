import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Merchant, MerchantDocument } from '../users/schemas/merchant.schema';
import { SalesPoint } from '../users/schemas/sales-point.schema';
import { SalesPointDto } from './dto/sales-point.dto';

@Injectable()
export class SalesPointsService {
  constructor(@InjectModel(Merchant.name) private readonly merchantModel: Model<Merchant>) {}

  async list(): Promise<SalesPoint[]> {
    const merchants = await this.merchantModel.find().exec();
    return merchants.flatMap((merchant) => merchant.salesPoints);
  }

  async byMerchant(merchantId: string): Promise<SalesPoint[]> {
    const merchant = await this.findMerchantOrFail(merchantId);
    return merchant.salesPoints;
  }

  async getById(id: string): Promise<SalesPoint> {
    const merchant = await this.merchantModel.findOne({ 'salesPoints._id': id }).exec();
    const point = merchant && this.points(merchant).id(id);
    if (!point) {
      throw new NotFoundException(`Punto de venta no encontrado: ${id}`);
    }
    return point;
  }

  async create(merchantId: string, dto: SalesPointDto): Promise<SalesPoint> {
    const merchant = await this.findMerchantOrFail(merchantId);
    const points = this.points(merchant);
    points.push({ ...dto, merchantId } as SalesPoint);
    await merchant.save();
    return points[points.length - 1];
  }

  async update(merchantId: string, id: string, dto: SalesPointDto): Promise<SalesPoint> {
    const merchant = await this.findMerchantOrFail(merchantId);
    const point = this.points(merchant).id(id);
    if (!point) {
      throw new NotFoundException(`Punto de venta no encontrado: ${id}`);
    }
    point.name = dto.name;
    point.address = dto.address;
    point.phone = dto.phone;
    point.geo = dto.geo;
    point.receptionSchedule = dto.receptionSchedule;
    await merchant.save();
    return point;
  }

  private async findMerchantOrFail(merchantId: string): Promise<MerchantDocument> {
    const merchant = await this.merchantModel.findById(merchantId).exec();
    if (!merchant) {
      throw new NotFoundException(`Comercio no encontrado: ${merchantId}`);
    }
    return merchant;
  }

  private points(merchant: MerchantDocument): Types.DocumentArray<SalesPoint> {
    return merchant.salesPoints as unknown as Types.DocumentArray<SalesPoint>;
  }
}
