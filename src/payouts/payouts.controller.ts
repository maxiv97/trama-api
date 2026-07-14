import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { SessionUser } from '../auth/session-user';
import { SettleDto } from './dto/settle.dto';
import { PayoutsService } from './payouts.service';

@Controller('payouts')
export class PayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Get('monthly')
  monthly(@CurrentUser() user: SessionUser) {
    return this.payouts.monthly(user.role, user.id);
  }

  @Get()
  flat(@CurrentUser() user: SessionUser) {
    return this.payouts.flat(user.role, user.id);
  }

  @Post('settle')
  @Roles('merchant')
  settle(@CurrentUser() user: SessionUser, @Body() dto: SettleDto) {
    return this.payouts.settle(user, dto);
  }
}
