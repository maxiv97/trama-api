import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { SessionUser } from '../auth/session-user';
import { ReportFiltersDto, toReportFilters } from '../shared/dto/report-filters.dto';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('expiring')
  @Roles('merchant')
  expiring(
    @CurrentUser() user: SessionUser,
    @Query() filters: ReportFiltersDto,
    @Query('withinDays') withinDays?: string,
  ) {
    const days = Number(withinDays);
    return this.reports.expiringConsignments(
      user.id,
      Number.isFinite(days) && days > 0 ? days : 30,
      toReportFilters(filters),
    );
  }

  @Get('by-category')
  @Roles('merchant')
  byCategory(@CurrentUser() user: SessionUser, @Query() filters: ReportFiltersDto) {
    return this.reports.salesByCategory(user.id, toReportFilters(filters));
  }

  @Get('consignors')
  @Roles('merchant')
  consignors(@CurrentUser() user: SessionUser, @Query() filters: ReportFiltersDto) {
    return this.reports.consignorPerformance(user.id, toReportFilters(filters));
  }

  @Get('discrepancies')
  @Roles('merchant')
  discrepancies(@CurrentUser() user: SessionUser, @Query() filters: ReportFiltersDto) {
    return this.reports.receptionDiscrepancies(user.id, toReportFilters(filters));
  }

  @Get('by-point')
  @Roles('merchant')
  byPoint(@CurrentUser() user: SessionUser, @Query() filters: ReportFiltersDto) {
    return this.reports.salesByPoint(user.id, toReportFilters(filters));
  }

  @Get('rotation')
  @Roles('merchant')
  rotation(@CurrentUser() user: SessionUser, @Query() filters: ReportFiltersDto) {
    return this.reports.rotation(user.id, toReportFilters(filters));
  }
}
