import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Merchant } from '../users/schemas/merchant.schema';
import { CANONICAL_CATEGORIES } from '../shared/domain/garment-categories';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { Category, CategoryDocument } from './schemas/category.schema';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel(Category.name) private readonly categoryModel: Model<Category>,
    @InjectModel(Merchant.name) private readonly merchantModel: Model<Merchant>,
  ) {}

  // Catálogo que ve un comercio (y el wizard una vez elegido el comercio): la
  // base canónica menos las que ocultó, más sus categorías propias.
  async forMerchant(merchantId?: string): Promise<CategoryDocument[]> {
    const hidden = merchantId ? await this.hiddenLabels(merchantId) : [];
    const owners = merchantId ? [{ ownerMerchantId: merchantId }] : [];
    const categories = await this.categoryModel
      .find({ active: true, $or: [{ base: true }, ...owners] })
      .sort({ base: -1, label: 1 })
      .exec();
    return categories.filter((category) => !(category.base && hidden.includes(category.label)));
  }

  async create(merchantId: string, dto: CreateCategoryDto): Promise<CategoryDocument> {
    const label = dto.label.trim();
    await this.ensureLabelAvailable(label, merchantId);
    await this.ensureValidParent(dto.parentLabel);
    return this.categoryModel.create({
      label,
      subcategories: this.cleanSubcategories(dto.subcategories),
      parentLabel: dto.parentLabel?.trim() || undefined,
      base: false,
      ownerMerchantId: merchantId,
      active: true,
    });
  }

  async update(
    merchantId: string,
    id: string,
    dto: UpdateCategoryDto,
  ): Promise<CategoryDocument> {
    const category = await this.ownedOrFail(merchantId, id);
    if (dto.label !== undefined) {
      const label = dto.label.trim();
      if (label.toLowerCase() !== category.label.toLowerCase()) {
        await this.ensureLabelAvailable(label, merchantId);
      }
      category.label = label;
    }
    if (dto.subcategories !== undefined) {
      category.subcategories = this.cleanSubcategories(dto.subcategories);
    }
    if (dto.parentLabel !== undefined) {
      await this.ensureValidParent(dto.parentLabel);
      category.parentLabel = dto.parentLabel.trim() || undefined;
    }
    await category.save();
    return category;
  }

  // Baja lógica de una categoría propia: deja de ofrecerse pero no se borra, así
  // el historial de prendas que la usaron sigue siendo legible.
  async remove(merchantId: string, id: string): Promise<void> {
    const category = await this.ownedOrFail(merchantId, id);
    category.active = false;
    await category.save();
  }

  // Opt-out de categorías base: el comercio elige cuáles de la base no ofrecer.
  async setHidden(merchantId: string, labels: string[]): Promise<string[]> {
    const baseLabels = new Set(
      (await this.categoryModel.find({ base: true, active: true }).select('label').exec()).map(
        (category) => category.label,
      ),
    );
    const hidden = [...new Set(labels.map((label) => label.trim()))].filter((label) =>
      baseLabels.has(label),
    );
    const merchant = await this.merchantOrFail(merchantId);
    merchant.hiddenCategoryLabels = hidden;
    await merchant.save();
    return hidden;
  }

  // Usado por GarmentsService: una categoría es válida para un comercio si es
  // base activa (y no oculta por el comercio) o una custom activa que le pertenece.
  async isValidForMerchant(label: string, merchantId?: string): Promise<boolean> {
    const category = await this.categoryModel
      .findOne({
        label,
        active: true,
        $or: [{ base: true }, ...(merchantId ? [{ ownerMerchantId: merchantId }] : [])],
      })
      .exec();
    if (!category) return false;
    if (category.base && merchantId) {
      const hidden = await this.hiddenLabels(merchantId);
      if (hidden.includes(category.label)) return false;
    }
    return true;
  }

  // Siembra idempotente del catálogo canónico como categorías base.
  async seedBase(): Promise<void> {
    await Promise.all(
      CANONICAL_CATEGORIES.map((category) =>
        this.categoryModel.updateOne(
          { label: category.label, base: true },
          {
            $set: { subcategories: category.subcategories, active: true },
            $setOnInsert: { label: category.label, base: true },
          },
          { upsert: true },
        ),
      ),
    );
  }

  private async hiddenLabels(merchantId: string): Promise<string[]> {
    const merchant = await this.merchantModel
      .findById(merchantId)
      .select('hiddenCategoryLabels')
      .exec();
    return merchant?.hiddenCategoryLabels ?? [];
  }

  private cleanSubcategories(subcategories?: string[]): string[] {
    return (subcategories ?? []).map((value) => value.trim()).filter((value) => value.length > 0);
  }

  private async ensureLabelAvailable(label: string, merchantId: string): Promise<void> {
    const clash = await this.categoryModel
      .exists({
        label: new RegExp(`^${escapeRegExp(label)}$`, 'i'),
        active: true,
        $or: [{ base: true }, { ownerMerchantId: merchantId }],
      })
      .exec();
    if (clash) {
      throw new BadRequestException(`Ya existe una categoría "${label}".`);
    }
  }

  private async ensureValidParent(parentLabel?: string): Promise<void> {
    if (!parentLabel?.trim()) return;
    const parent = await this.categoryModel
      .exists({ label: parentLabel.trim(), base: true, active: true })
      .exec();
    if (!parent) {
      throw new BadRequestException(`La categoría base "${parentLabel}" no existe.`);
    }
  }

  private async ownedOrFail(merchantId: string, id: string): Promise<CategoryDocument> {
    const category = await this.categoryModel.findById(id).exec();
    if (!category || !category.active) {
      throw new NotFoundException('Categoría no encontrada.');
    }
    if (category.base || category.ownerMerchantId !== merchantId) {
      throw new ForbiddenException('No podés modificar esta categoría.');
    }
    return category;
  }

  private async merchantOrFail(merchantId: string) {
    const merchant = await this.merchantModel.findById(merchantId).exec();
    if (!merchant) {
      throw new NotFoundException('Comercio no encontrado.');
    }
    return merchant;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
