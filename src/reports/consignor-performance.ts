export interface ConsignorPerformance {
  consignorId: string;
  name: string;
  dni: string;
  email: string;
  phone: string;
  verified: boolean;
  acceptanceRate: number | null;
  accepted: number;
  decided: number;
  inStockCount: number;
  soldCount: number;
  liquidatedAmount: number;
  pendingAmount: number;
  avgPayoutDays: number | null;
}
