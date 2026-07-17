import { Body, Controller, ForbiddenException, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { SessionUser } from '../auth/session-user';
import { ApplyActionDto } from './dto/apply-action.dto';
import { CreateGarmentDto } from './dto/create-garment.dto';
import { GarmentsService } from './garments.service';

@Controller('garments')
export class GarmentsController {
  constructor(private readonly garments: GarmentsService) {}

  @Post()
  @Roles('consignor')
  create(@CurrentUser() user: SessionUser, @Body() dto: CreateGarmentDto) {
    return this.garments.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return user.role === 'merchant'
      ? this.garments.byMerchant(user.id)
      : this.garments.byConsignor(user.id);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.garments.getByIdOrFail(id);
  }

  @Post(':id/actions')
  async applyAction(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() dto: ApplyActionDto,
  ) {
    const garment = await this.garments.getByIdOrFail(id);
    const ownerId = user.role === 'merchant' ? garment.merchantId : garment.consignorId;
    if (ownerId !== user.id) {
      throw new ForbiddenException('La prenda no te pertenece');
    }
    if (dto.action === 'CANCEL' && user.role !== 'consignor') {
      throw new ForbiddenException('Solo el cedente puede cancelar la prenda');
    }
    return this.garments.applyAction(id, dto.action, user.role, dto.note);
  }
}
