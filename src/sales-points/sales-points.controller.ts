import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { SessionUser } from '../auth/session-user';
import { SalesPointDto } from './dto/sales-point.dto';
import { SalesPointsService } from './sales-points.service';

@Controller('sales-points')
export class SalesPointsController {
  constructor(private readonly salesPoints: SalesPointsService) {}

  @Get()
  list(@Query('merchantId') merchantId?: string) {
    return merchantId ? this.salesPoints.byMerchant(merchantId) : this.salesPoints.list();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.salesPoints.getById(id);
  }

  @Post()
  @Roles('merchant')
  create(@CurrentUser() user: SessionUser, @Body() dto: SalesPointDto) {
    return this.salesPoints.create(user.id, dto);
  }

  @Patch(':id')
  @Roles('merchant')
  update(@CurrentUser() user: SessionUser, @Param('id') id: string, @Body() dto: SalesPointDto) {
    return this.salesPoints.update(user.id, id, dto);
  }
}
