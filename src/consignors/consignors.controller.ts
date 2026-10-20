import { Controller, Get, Param } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { SessionUser } from '../auth/session-user';
import { ConsignorsService } from './consignors.service';

// Solo los comercios acceden a los cedentes, y cada comercio ve únicamente a los
// cedentes con los que opera. Evita exponer datos de contacto de todos los cedentes.
@Controller('consignors')
export class ConsignorsController {
  constructor(private readonly consignors: ConsignorsService) {}

  @Get()
  @Roles('merchant')
  list(@CurrentUser() user: SessionUser) {
    return this.consignors.byMerchant(user.id);
  }

  @Get(':id')
  @Roles('merchant')
  getById(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    return this.consignors.getForMerchantOrFail(id, user.id);
  }
}
