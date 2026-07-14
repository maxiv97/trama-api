import { Controller, Get, Param, Query } from '@nestjs/common';
import { ConsignorsService } from './consignors.service';

@Controller('consignors')
export class ConsignorsController {
  constructor(private readonly consignors: ConsignorsService) {}

  @Get()
  list(@Query('merchantId') merchantId?: string) {
    return merchantId ? this.consignors.byMerchant(merchantId) : this.consignors.list();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.consignors.getByIdOrFail(id);
  }
}
