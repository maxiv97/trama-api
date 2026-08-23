import { ReceptionDiscrepancy } from '../shared/domain/enums';

export interface DiscrepancyCount {
  discrepancy: ReceptionDiscrepancy;
  count: number;
}

export interface ReceptionDiscrepancyReport {
  totalReceptions: number;
  withDiscrepancies: number;
  rate: number | null;
  byType: DiscrepancyCount[];
}
