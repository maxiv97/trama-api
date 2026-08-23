export interface StockAgingBucket {
  bucket: string;
  count: number;
}

export interface RotationReport {
  stockAging: StockAgingBucket[];
  staleCount: number;
  avgDaysToSale: number | null;
}
