import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AgreementsService } from '../agreements/agreements.service';
import { SessionUser } from '../auth/session-user';
import { GarmentsService } from '../garments/garments.service';
import { PaymentMethod } from '../shared/domain/enums';
import { canTransition } from '../shared/state-machine/garment.state-machine';
import { calculateConsignorAmount } from '../shared/utils/price.util';
import { CreateSaleDto } from './dto/create-sale.dto';
import { Sale, SaleDocument } from './schemas/sale.schema';

interface Payment {
  paymentMethod: PaymentMethod;
  receiptNumber?: string;
}

@Injectable()
export class SalesService {
  constructor(
    @InjectModel(Sale.name) private readonly saleModel: Model<Sale>,
    private readonly garments: GarmentsService,
    private readonly agreements: AgreementsService,
  ) {}

  async create(user: SessionUser, dto: CreateSaleDto): Promise<SaleDocument> {
    const garment = await this.garments.getByIdOrFail(dto.garmentId);
    if (garment.merchantId !== user.id) {
      throw new ForbiddenException('La prenda no pertenece al comercio');
    }
    if (!canTransition(garment.status, 'REGISTER_SALE')) {
      throw new ConflictException(`Transición inválida: ${garment.status} + REGISTER_SALE`);
    }
    const agreement = await this.agreements.byGarment(dto.garmentId);
    if (!agreement) {
      throw new NotFoundException(`Acuerdo no encontrado para la prenda: ${dto.garmentId}`);
    }
    const consignorPercentage = 100 - agreement.appliedCommission;
    const consignorAmount = calculateConsignorAmount(dto.actualSalePrice, consignorPercentage);
    const merchantCommission = dto.actualSalePrice - consignorAmount;
    const sale = new this.saleModel({
      garmentId: dto.garmentId,
      actualSalePrice: dto.actualSalePrice,
      soldAt: new Date(dto.soldAt),
      consignorAmount,
      merchantCommission,
    });
    await sale.save();
    await this.garments.applyAction(dto.garmentId, 'REGISTER_SALE', 'merchant', 'Venta registrada');
    return sale;
  }

  byGarment(garmentId: string): Promise<SaleDocument | null> {
    return this.saleModel.findOne({ garmentId }).exec();
  }

  byGarmentIds(garmentIds: string[]): Promise<SaleDocument[]> {
    return this.saleModel.find({ garmentId: { $in: garmentIds } }).exec();
  }

  async byMerchant(merchantId: string): Promise<SaleDocument[]> {
    const garments = await this.garments.byMerchant(merchantId);
    return this.byGarmentIds(garments.map((garment) => garment.id));
  }

  async markPaid(garmentId: string, payment: Payment): Promise<SaleDocument> {
    const sale = await this.saleModel.findOne({ garmentId }).exec();
    if (!sale) {
      throw new NotFoundException(`Venta no encontrada para la prenda: ${garmentId}`);
    }
    sale.paidAt = new Date();
    sale.paymentMethod = payment.paymentMethod;
    sale.receiptNumber = payment.receiptNumber;
    await sale.save();
    return sale;
  }
}
