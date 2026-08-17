import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { SessionUser } from '../auth/session-user';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('expiring')
  @Roles('merchant')
  expiring(@CurrentUser() user: SessionUser, @Query('withinDays') withinDays?: string) {
    const days = Number(withinDays);
    return this.reports.expiringConsignments(user.id, Number.isFinite(days) && days > 0 ? days : 30);
  }
}
