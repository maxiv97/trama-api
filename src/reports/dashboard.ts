import { CategorySales } from './category-sales';
import { SummaryReport, WeeklyPoint } from './summary';

// Todo lo que el Panel del comercio necesita, calculado sobre un único dataset
// (evita las 6-7 llamadas que recargaban y recalculaban las mismas prendas).
export interface DashboardReport {
  displayName: string;
  summary: SummaryReport;
  categories: CategorySales[];
  weekly: WeeklyPoint[];
  pendingCount: number;
  expiringCount: number;
  // Prendas que no se vendieron y esperan el retiro del cedente (hay que sacarlas de exhibición).
  awaitingPickupCount: number;
  // No retiradas a las que todavía no se les registró el destino.
  unclaimedPendingCount: number;
}
