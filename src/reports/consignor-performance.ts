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
  receivedCount: number;
  sellThroughRate: number | null;
  soldCount: number;
  liquidatedAmount: number;
  pendingAmount: number;
  merchantProfit: number;
  paidCount: number;
  avgPayoutDays: number | null;
}
