import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { SessionUser } from '../auth/session-user';
import { ReportFiltersDto, toReportFilters } from '../shared/dto/report-filters.dto';
import { SettleDto } from './dto/settle.dto';
import { PayoutsService } from './payouts.service';

@Controller('payouts')
export class PayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Get('monthly')
  monthly(@CurrentUser() user: SessionUser, @Query() filters: ReportFiltersDto) {
    return this.payouts.monthly(user.role, user.id, toReportFilters(filters));
  }

  @Get()
  flat(@CurrentUser() user: SessionUser, @Query() filters: ReportFiltersDto) {
    return this.payouts.flat(user.role, user.id, toReportFilters(filters));
  }

  @Post('settle')
  @Roles('merchant')
  settle(@CurrentUser() user: SessionUser, @Body() dto: SettleDto) {
    return this.payouts.settle(user, dto);
  }
}
