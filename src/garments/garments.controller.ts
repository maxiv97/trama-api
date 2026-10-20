import { Body, Controller, ForbiddenException, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { SessionUser } from '../auth/session-user';
import { ApplyActionDto } from './dto/apply-action.dto';
import { CreateGarmentDto } from './dto/create-garment.dto';
import { GarmentDocument } from './schemas/garment.schema';
import { GarmentsService } from './garments.service';

@Controller('garments')
export class GarmentsController {
  constructor(private readonly garments: GarmentsService) {}

  @Post()
  @Roles('consignor')
  create(@CurrentUser() user: SessionUser, @Body() dto: CreateGarmentDto) {
    return this.garments.create(user.id, dto);
  }

  // `lite=1` devuelve las prendas sin fotos/video/timeline. Las vistas que agregan datos
  // (puntos de venta, tarjetas de reportes) no muestran miniaturas y así evitan traerse
  // los base64 de cada prenda, que colgaban la carga.
  @Get()
  list(@CurrentUser() user: SessionUser, @Query('lite') lite?: string) {
    const asMeta = lite === '1' || lite === 'true';
    if (user.role === 'merchant') {
      return asMeta ? this.garments.metaByMerchant(user.id) : this.garments.byMerchant(user.id);
    }
    return asMeta ? this.garments.metaByConsignor(user.id) : this.garments.byConsignor(user.id);
  }

  // Miniatura on-demand: las listas se traen en modo `lite` (sin fotos) y cada tarjeta
  // pide su primera foto solo cuando entra en pantalla.
  @Get(':id/photo')
  async photo(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    return { photo: await this.garments.firstPhotoForUser(id, user.id, user.role) };
  }

  @Get(':id')
  async getById(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    const garment = await this.garments.getByIdOrFail(id);
    this.assertOwner(garment, user);
    return garment;
  }

  // Un artículo solo puede consultarlo su cedente o el comercio de destino.
  private assertOwner(garment: GarmentDocument, user: SessionUser): void {
    const ownerId = user.role === 'merchant' ? garment.merchantId : garment.consignorId;
    if (ownerId !== user.id) {
      throw new ForbiddenException('La prenda no te pertenece');
    }
  }

  @Post(':id/actions')
  async applyAction(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() dto: ApplyActionDto,
  ) {
    const garment = await this.garments.getByIdOrFail(id);
    this.assertOwner(garment, user);
    if (dto.action === 'CANCEL' && user.role !== 'consignor') {
      throw new ForbiddenException('Solo el cedente puede cancelar la prenda');
    }
    return this.garments.applyAction(id, dto.action, user.role, dto.note);
  }
}
