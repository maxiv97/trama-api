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
import { EmailDetail } from '../mail/templates';
import { PaymentMethod } from '../shared/domain/enums';
import { formatArs } from '../shared/format';
import { canTransition } from '../shared/state-machine/garment.state-machine';
import { calculateConsignorAmount } from '../shared/utils/price.util';
import { UsersService } from '../users/users.service';
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
    private readonly users: UsersService,
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
    const details = await this.saleEmailDetails(
      garment.merchantId,
      consignorAmount,
      dto.actualSalePrice,
    );
    await this.garments.applyAction(
      dto.garmentId,
      'REGISTER_SALE',
      'merchant',
      'Venta registrada',
      details,
    );
    return sale;
  }

  // What the consignor earns, the sale price, and when they get paid. Built defensively so a failure
  // to resolve the merchant's payout day never blocks registering the sale.
  private async saleEmailDetails(
    merchantId: string | undefined,
    consignorAmount: number,
    salePrice: number,
  ): Promise<EmailDetail[]> {
    const details: EmailDetail[] = [
      { label: 'Vas a cobrar', value: formatArs(consignorAmount) },
      { label: 'Precio de venta', value: formatArs(salePrice) },
    ];
    if (merchantId) {
      try {
        const merchant = await this.users.findMerchantById(merchantId);
        if (merchant) {
          details.push({
            label: 'Lo cobrás',
            value: `el día ${merchant.terms.payoutDay} de cada mes`,
          });
        }
      } catch {
        // Merchant unavailable: keep the amounts, skip the payout-day line.
      }
    }
    return details;
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
