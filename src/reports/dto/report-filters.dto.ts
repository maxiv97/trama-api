import { IsOptional, IsString, Matches } from 'class-validator';
import { ReportFilters } from '../report-filters';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ReportFiltersDto {
  @IsOptional() @Matches(DATE, { message: 'from must be YYYY-MM-DD' }) from?: string;
  @IsOptional() @Matches(DATE, { message: 'to must be YYYY-MM-DD' }) to?: string;
  @IsOptional() @IsString() salesPointId?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() consignorId?: string;
}

// `from` opens at the start of its day and `to` closes at the end of its day, both in UTC,
// so a whole-day range includes every sale stamped on those dates.
export function toReportFilters(dto: ReportFiltersDto): ReportFilters {
  return {
    from: dto.from ? new Date(`${dto.from}T00:00:00.000Z`) : undefined,
    to: dto.to ? new Date(`${dto.to}T23:59:59.999Z`) : undefined,
    salesPointId: dto.salesPointId,
    category: dto.category,
    consignorId: dto.consignorId,
  };
}
