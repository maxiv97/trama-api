import { ReceptionDiscrepancy } from '../shared/domain/enums';

// One row per received garment that had observations, with enough context to act on it.
export interface DiscrepancyDetailRow {
  garmentName: string;
  category: string;
  consignorName: string;
  receivedAt: Date;
  daysInStock: number;
  discrepancies: ReceptionDiscrepancy[];
}
