export interface ExpiringConsignment {
  garmentId: string;
  name: string;
  consignorId: string;
  consignorName: string;
  salesPointId?: string;
  saleDeadline: Date;
  effectiveDeadline: Date;
  daysLeft: number;
  overdue: boolean;
}
