import { Body, Controller, ForbiddenException, Get, Param, Patch } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { SessionUser } from '../auth/session-user';
import { UpdateMerchantDto } from './dto/update-merchant.dto';
import { MerchantsService } from './merchants.service';

@Controller('merchants')
export class MerchantsController {
  constructor(private readonly merchants: MerchantsService) {}

  @Get()
  list() {
    return this.merchants.list();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.merchants.getByIdOrFail(id);
  }

  @Patch(':id')
  @Roles('merchant')
  update(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() dto: UpdateMerchantDto,
  ) {
    if (id !== user.id) {
      throw new ForbiddenException('Solo podés editar tu propio comercio');
    }
    return this.merchants.update(id, dto);
  }
}
