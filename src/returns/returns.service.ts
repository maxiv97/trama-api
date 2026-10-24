import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { SessionUser } from '../auth/session-user';
import { GarmentsService } from '../garments/garments.service';
import { GarmentDocument } from '../garments/schemas/garment.schema';
import type { EmailDetail } from '../mail/templates';
import { SalesPointsService } from '../sales-points/sales-points.service';
import type { UnclaimedDisposition } from '../shared/domain/enums';
import { formatDate } from '../shared/format';
import { canTransition } from '../shared/state-machine/garment.state-machine';
import { CreateReturnDto } from './dto/create-return.dto';
import { RegisterDispositionDto } from './dto/register-disposition.dto';
import { GarmentReturn, GarmentReturnDocument } from './schemas/return.schema';

const DISPOSITION_LABELS: Record<UnclaimedDisposition, string> = {
  donated: 'Donada',
  kept: 'Quedó para el comercio',
  other: 'Otro destino',
};

@Injectable()
export class ReturnsService {
  constructor(
    @InjectModel(GarmentReturn.name)
    private readonly returnModel: Model<GarmentReturn>,
    private readonly garments: GarmentsService,
    private readonly salesPoints: SalesPointsService,
  ) {}

  // El comercio entrega al cedente una prenda que no se vendió (Por retirar → Retirada).
  async create(
    user: SessionUser,
    dto: CreateReturnDto,
  ): Promise<GarmentReturnDocument> {
    const garment = await this.garments.getByIdOrFail(dto.garmentId);
    if (garment.merchantId !== user.id) {
      throw new ForbiddenException('La prenda no pertenece al comercio');
    }
    if (!canTransition(garment.status, 'REGISTER_RETURN')) {
      throw new ConflictException(
        `Transición inválida: ${garment.status} + REGISTER_RETURN`,
      );
    }
    const returned = await this.returnModel.create({
      garmentId: garment.id,
      merchantId: user.id,
      consignorId: garment.consignorId,
      salesPointId: garment.salesPointId,
      returnedAt: new Date(),
      identityChecked: dto.identityChecked,
      notes: dto.notes,
      receiptNumber: `DEV-${Date.now()}`,
      handledBy: user.name,
    });
    await this.garments.applyAction(
      garment.id,
      'REGISTER_RETURN',
      'merchant',
      'Retirada por el cedente',
      await this.emailDetails(garment, returned),
    );
    return returned;
  }

  // Solo la ven el cedente y el comercio de la prenda.
  async byGarment(
    garmentId: string,
    user: SessionUser,
  ): Promise<GarmentReturnDocument | null> {
    const garment = await this.garments.getByIdOrFail(garmentId);
    const ownerId =
      user.role === 'merchant' ? garment.merchantId : garment.consignorId;
    if (ownerId !== user.id) {
      throw new ForbiddenException('La prenda no te pertenece');
    }
    return this.returnModel.findOne({ garmentId }).exec();
  }

  async registerDisposition(
    garmentId: string,
    user: SessionUser,
    dto: RegisterDispositionDto,
  ): Promise<GarmentDocument> {
    const garment = await this.garments.getByIdOrFail(garmentId);
    if (garment.merchantId !== user.id) {
      throw new ForbiddenException('La prenda no pertenece al comercio');
    }
    const label = DISPOSITION_LABELS[dto.disposition];
    return this.garments.registerDisposition(
      garmentId,
      {
        disposition: dto.disposition,
        note: dto.note,
        date: new Date(),
        handledBy: user.name,
      },
      dto.note ? `Destino: ${label}. ${dto.note}` : `Destino: ${label}`,
    );
  }

  private async emailDetails(
    garment: GarmentDocument,
    returned: GarmentReturnDocument,
  ): Promise<EmailDetail[]> {
    const details: EmailDetail[] = [
      { label: 'Comprobante', value: returned.receiptNumber },
      { label: 'Fecha', value: formatDate(returned.returnedAt) },
    ];
    if (garment.salesPointId) {
      try {
        const point = await this.salesPoints.getById(garment.salesPointId);
        details.push({ label: 'Punto de venta', value: point.name });
      } catch {
        // Punto de venta no disponible: el comprobante alcanza.
      }
    }
    return details;
  }
}
