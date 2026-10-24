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
  // Cumplimiento del cedente con este comercio (nunca cruza datos de otros comercios).
  deliveredCount: number; // acordadas que entregó al comercio
  deliveryExpiredCount: number; // acordadas que no entregó dentro del plazo
  deliveryRate: number | null; // entregadas / (entregadas + no entregadas)
  expiredCount: number; // recibidas que terminaron la ventana sin venderse (pasaron a Por retirar)
  returnedCount: number; // de esas, las que el cedente retiró
  unclaimedCount: number; // de esas, las que no retiró (venció el plazo)
  awaitingPickupCount: number; // todavía por retirar, sin resolver
  pickupRate: number | null; // retiradas / (retiradas + no retiradas)
}
