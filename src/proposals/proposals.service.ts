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
import { EventActor, GarmentStatus } from '../shared/domain/enums';
import { canTransition, GarmentAction } from '../shared/state-machine/garment.state-machine';
import { calculateSalePrice } from '../shared/utils/price.util';
import { MerchantDocument } from '../users/schemas/merchant.schema';
import { UsersService } from '../users/users.service';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { Proposal, ProposalDocument } from './schemas/proposal.schema';

@Injectable()
export class ProposalsService {
  constructor(
    @InjectModel(Proposal.name) private readonly proposalModel: Model<Proposal>,
    private readonly garments: GarmentsService,
    private readonly agreements: AgreementsService,
    private readonly users: UsersService,
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

  async pendingForMerchant(merchantId: string): Promise<ProposalDocument[]> {
    const garments = await this.garments.byMerchant(merchantId);
    const garmentIds = garments.map((garment) => garment.id);
    return this.proposalModel
      .find({ garmentId: { $in: garmentIds }, status: 'under_review' })
      .exec();
  }

  async accept(garmentId: string, merchantId: string): Promise<ProposalDocument> {
    const { garment, proposal, merchant } = await this.loadForNegotiation(garmentId);
    if (garment.merchantId !== merchantId) {
      throw new ForbiddenException('La prenda no pertenece al comercio');
    }
    this.ensureCanTransition(garment.status, 'ACCEPT_PROPOSAL');
    await this.createAgreement(
      garmentId,
      proposal.requestedConsignorPrice,
      proposal.calculatedSalePrice,
      merchant,
    );
    proposal.status = 'agreed';
    await proposal.save();
    await this.garments.applyAction(garmentId, 'ACCEPT_PROPOSAL', 'merchant', 'Propuesta aceptada');
    return proposal;
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
    await this.garments.applyAction(garmentId, 'COUNTER_OFFER', 'merchant', 'Contraoferta enviada');
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
    await this.createAgreement(
      garmentId,
      proposal.counteroffer.consignorPrice,
      proposal.counteroffer.salePrice,
      merchant,
    );
    proposal.status = 'agreed';
    await proposal.save();
    await this.garments.applyAction(
      garmentId,
      'ACCEPT_COUNTEROFFER',
      'consignor',
      'Contraoferta aceptada',
    );
    return proposal;
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
  ): Promise<void> {
    const agreedAt = new Date();
    const saleDeadline = new Date(agreedAt);
    saleDeadline.setMonth(saleDeadline.getMonth() + merchant.terms.saleWindowMonths);
    await this.agreements.create({
      garmentId,
      agreedConsignorPrice,
      agreedSalePrice,
      appliedCommission: merchant.commissionConfig.merchantPercentage,
      agreedAt,
      saleDeadline,
    });
  }
}
