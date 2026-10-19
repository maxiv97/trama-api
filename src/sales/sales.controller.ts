import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { SessionUser } from '../auth/session-user';
import { BulkSaleDto } from './dto/bulk-sale.dto';
import { CreateSaleDto } from './dto/create-sale.dto';
import { SalesService } from './sales.service';

@Controller()
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Post('sales')
  @Roles('merchant')
  create(@CurrentUser() user: SessionUser, @Body() dto: CreateSaleDto) {
    return this.sales.create(user, dto);
  }

  @Post('sales/bulk')
  @Roles('merchant')
  bulkCreate(@CurrentUser() user: SessionUser, @Body() dto: BulkSaleDto) {
    return this.sales.bulkCreate(user, dto);
  }

  @Get('garments/:garmentId/sale')
  byGarment(@Param('garmentId') garmentId: string) {
    return this.sales.byGarment(garmentId);
  }

  @Get('sales')
  @Roles('merchant')
  list(@CurrentUser() user: SessionUser) {
    return this.sales.byMerchant(user.id);
  }
}
