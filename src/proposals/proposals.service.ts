import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AgreementsService } from '../agreements/agreements.service';
import { GarmentsService } from '../garments/garments.service';
import { EmailDetail } from '../mail/templates';
import { SalesPointsService } from '../sales-points/sales-points.service';
import { EventActor, GarmentStatus } from '../shared/domain/enums';
import { addDays, addMonths } from '../shared/domain/terms';
import { formatArs, formatDate } from '../shared/format';
import { canTransition, GarmentAction } from '../shared/state-machine/garment.state-machine';
import { calculateSalePrice } from '../shared/utils/price.util';
import { MerchantDocument } from '../users/schemas/merchant.schema';
import { UsersService } from '../users/users.service';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { UpdateDraftDto } from './dto/update-draft.dto';
import { Proposal, ProposalDocument } from './schemas/proposal.schema';

@Injectable()
export class ProposalsService {
  constructor(
    @InjectModel(Proposal.name) private readonly proposalModel: Model<Proposal>,
    private readonly garments: GarmentsService,
    private readonly agreements: AgreementsService,
    private readonly users: UsersService,
    private readonly salesPoints: SalesPointsService,
  ) {}

  async create(consignorId: string, dto: CreateProposalDto): Promise<ProposalDocument> {
    const garment = await this.garments.getByIdOrFail(dto.garmentId);
    if (garment.consignorId !== consignorId) {
      throw new ForbiddenException('La prenda no pertenece al cedente');
    }
    const merchant = await this.merchantForGarment(garment.merchantId);
    const calculatedSalePrice = calculateSalePrice(
      dto.requestedConsignorPrice,
      merchant.commissionConfig.consignorPercentage,
    );
    const proposal = new this.proposalModel({
      garmentId: dto.garmentId,
      requestedConsignorPrice: dto.requestedConsignorPrice,
      calculatedSalePrice,
      status: 'under_review',
      createdAt: new Date(),
    });
    await proposal.save();
    return proposal;
  }

  // Edición del cedente en revisión: actualiza la prenda (vía GarmentsService,
  // que valida dueño/estado/categoría) y recalcula el precio de la propuesta.
  async updateDraft(
    garmentId: string,
    consignorId: string,
    dto: UpdateDraftDto,
  ): Promise<ProposalDocument> {
    const garment = await this.garments.editDraft(garmentId, consignorId, {
      name: dto.name,
      category: dto.category,
      subcategory: dto.subcategory,
      brand: dto.brand,
      size: dto.size,
      color: dto.color,
      season: dto.season,
      condition: dto.condition,
      description: dto.description,
      photos: dto.photos,
      video: dto.video,
    });
    const merchant = await this.merchantForGarment(garment.merchantId);
    const proposal = await this.proposalOrFail(garmentId);
    proposal.requestedConsignorPrice = dto.requestedConsignorPrice;
    proposal.calculatedSalePrice = calculateSalePrice(
      dto.requestedConsignorPrice,
      merchant.commissionConfig.consignorPercentage,
    );
    await proposal.save();
    return proposal;
  }

  byGarment(garmentId: string): Promise<ProposalDocument | null> {
    return this.proposalModel.findOne({ garmentId }).exec();
  }

  async getByIdOrFail(id: string): Promise<ProposalDocument> {
    const proposal = await this.proposalModel.findById(id).exec();
    if (!proposal) {
      throw new NotFoundException(`Propuesta no encontrada: ${id}`);
    }
    return proposal;
  }

  // La propuesta solo puede consultarla el cedente o el comercio de la prenda asociada.
  async byGarmentForUser(garmentId: string, userId: string, role: string): Promise<ProposalDocument | null> {
    await this.assertGarmentAccess(garmentId, userId, role);
    return this.byGarment(garmentId);
  }

  async getByIdForUser(id: string, userId: string, role: string): Promise<ProposalDocument> {
    const proposal = await this.getByIdOrFail(id);
    await this.assertGarmentAccess(proposal.garmentId, userId, role);
    return proposal;
  }

  private async assertGarmentAccess(garmentId: string, userId: string, role: string): Promise<void> {
    const garment = await this.garments.getByIdOrFail(garmentId);
    const ownerId = role === 'merchant' ? garment.merchantId : garment.consignorId;
    if (ownerId !== userId) {
      throw new ForbiddenException('La propuesta no te pertenece');
    }
  }

  async pendingForMerchant(merchantId: string): Promise<ProposalDocument[]> {
    const garments = await this.garments.metaByMerchant(merchantId);
    const garmentIds = garments
      .filter((garment) => garment.status === 'under_review')
      .map((garment) => garment.id);
    return this.proposalModel.find({ garmentId: { $in: garmentIds } }).exec();
  }

  async accept(garmentId: string, merchantId: string): Promise<ProposalDocument> {
    const { garment, proposal, merchant } = await this.loadForNegotiation(garmentId);
    if (garment.merchantId !== merchantId) {
      throw new ForbiddenException('La prenda no pertenece al comercio');
    }
    this.ensureCanTransition(garment.status, 'ACCEPT_PROPOSAL');
    const deliveryDeadline = await this.createAgreement(
      garmentId,
      proposal.requestedConsignorPrice,
      proposal.calculatedSalePrice,
      merchant,
    );
    proposal.status = 'agreed';
    await proposal.save();
    const details = await this.agreementEmailDetails(
      garment.salesPointId,
      proposal.requestedConsignorPrice,
      proposal.calculatedSalePrice,
    );
    details.push({ label: 'Entregala antes del', value: formatDate(deliveryDeadline) });
    await this.garments.applyAction(
      garmentId,
      'ACCEPT_PROPOSAL',
      'merchant',
      'Propuesta aceptada',
      details,
    );
    return proposal;
  }

  // Money the consignor will get, the sale price, and where/when to drop off the garment. Built
  // defensively: a failure to resolve the sales point must never block accepting the proposal.
  private async agreementEmailDetails(
    salesPointId: string | undefined,
    consignorPrice: number,
    salePrice: number,
  ): Promise<EmailDetail[]> {
    const details: EmailDetail[] = [
      { label: 'Vas a cobrar', value: formatArs(consignorPrice) },
      { label: 'Precio de venta', value: formatArs(salePrice) },
    ];
    if (salesPointId) {
      try {
        const point = await this.salesPoints.getById(salesPointId);
        details.push({ label: 'Dónde entregar', value: `${point.name} · ${point.address}` });
        details.push({
          label: 'Recepción',
          value: `${point.receptionSchedule.days} · ${point.receptionSchedule.hours}`,
        });
      } catch {
        // Sales point unavailable: keep the money details, skip the drop-off info.
      }
    }
    return details;
  }

  async counteroffer(
    garmentId: string,
    merchantId: string,
    consignorPrice: number,
  ): Promise<ProposalDocument> {
    const { garment, proposal, merchant } = await this.loadForNegotiation(garmentId);
    if (garment.merchantId !== merchantId) {
      throw new ForbiddenException('La prenda no pertenece al comercio');
    }
    this.ensureCanTransition(garment.status, 'COUNTER_OFFER');
    const salePrice = calculateSalePrice(
      consignorPrice,
      merchant.commissionConfig.consignorPercentage,
    );
    await this.garments.applyAction(garmentId, 'COUNTER_OFFER', 'merchant', 'Contraoferta enviada', [
      { label: 'Tu pedido original', value: formatArs(proposal.requestedConsignorPrice) },
      { label: 'Contraoferta (cobrás)', value: formatArs(consignorPrice) },
      { label: 'Precio de venta', value: formatArs(salePrice) },
    ]);
    proposal.counteroffer = { consignorPrice, salePrice, date: new Date() };
    proposal.status = 'counteroffer';
    await proposal.save();
    return proposal;
  }

  async acceptCounteroffer(garmentId: string, consignorId: string): Promise<ProposalDocument> {
    const { garment, proposal, merchant } = await this.loadForNegotiation(garmentId);
    if (garment.consignorId !== consignorId) {
      throw new ForbiddenException('La prenda no pertenece al cedente');
    }
    if (!proposal.counteroffer) {
      throw new ConflictException('No hay contraoferta para aceptar');
    }
    this.ensureCanTransition(garment.status, 'ACCEPT_COUNTEROFFER');
    const deliveryDeadline = await this.createAgreement(
      garmentId,
      proposal.counteroffer.consignorPrice,
      proposal.counteroffer.salePrice,
      merchant,
    );
    proposal.status = 'agreed';
    await proposal.save();
    const details = await this.counterofferAcceptedDetails(
      garment.salesPointId,
      proposal.counteroffer.consignorPrice,
      proposal.counteroffer.salePrice,
    );
    details.push({ label: 'Plazo de entrega', value: `hasta el ${formatDate(deliveryDeadline)}` });
    await this.garments.applyAction(
      garmentId,
      'ACCEPT_COUNTEROFFER',
      'consignor',
      'Contraoferta aceptada',
      details,
    );
    return proposal;
  }

  // For the merchant: what was agreed and where the garment will arrive. Defensive on the sales point.
  private async counterofferAcceptedDetails(
    salesPointId: string | undefined,
    consignorPrice: number,
    salePrice: number,
  ): Promise<EmailDetail[]> {
    const details: EmailDetail[] = [
      { label: 'Le pagás al cedente', value: formatArs(consignorPrice) },
      { label: 'Precio de venta', value: formatArs(salePrice) },
    ];
    if (salesPointId) {
      try {
        const point = await this.salesPoints.getById(salesPointId);
        details.push({ label: 'La recibís en', value: `${point.name} · ${point.address}` });
      } catch {
        // Sales point unavailable: keep the amounts.
      }
    }
    return details;
  }

  async reject(garmentId: string, actor: EventActor, note?: string): Promise<ProposalDocument> {
    const proposal = await this.proposalOrFail(garmentId);
    await this.garments.applyAction(garmentId, 'REJECT', actor, note);
    proposal.status = 'no_agreement';
    await proposal.save();
    return proposal;
  }

  private async loadForNegotiation(garmentId: string) {
    const garment = await this.garments.getByIdOrFail(garmentId);
    const proposal = await this.proposalOrFail(garmentId);
    const merchant = await this.merchantForGarment(garment.merchantId);
    return { garment, proposal, merchant };
  }

  private async proposalOrFail(garmentId: string): Promise<ProposalDocument> {
    const proposal = await this.byGarment(garmentId);
    if (!proposal) {
      throw new NotFoundException(`Propuesta no encontrada para la prenda: ${garmentId}`);
    }
    return proposal;
  }

  private async merchantForGarment(merchantId?: string): Promise<MerchantDocument> {
    if (!merchantId) {
      throw new NotFoundException('La prenda no tiene comercio asignado');
    }
    const merchant = await this.users.findMerchantById(merchantId);
    if (!merchant) {
      throw new NotFoundException(`Comercio no encontrado: ${merchantId}`);
    }
    return merchant;
  }

  private ensureCanTransition(status: GarmentStatus, action: GarmentAction): void {
    if (!canTransition(status, action)) {
      throw new ConflictException(`Transición inválida: ${status} + ${action}`);
    }
  }

  private async createAgreement(
    garmentId: string,
    agreedConsignorPrice: number,
    agreedSalePrice: number,
    merchant: MerchantDocument,
  ): Promise<Date> {
    const agreedAt = new Date();
    const deliveryDeadline = addDays(agreedAt, merchant.terms.deliveryDays);
    const { saleWindowMonths, deliveryDays, pickupDays } = merchant.terms;
    await this.agreements.create({
      garmentId,
      agreedConsignorPrice,
      agreedSalePrice,
      appliedCommission: merchant.commissionConfig.merchantPercentage,
      agreedAt,
      // Provisoria hasta la recepción, que la recalcula (AgreementsService.startSaleWindow).
      saleDeadline: addMonths(agreedAt, saleWindowMonths),
      saleWindowMonths,
      deliveryDays,
      deliveryDeadline,
      pickupDays,
    });
    return deliveryDeadline;
  }
}
