export interface SummaryKpis {
  profit: number;
  revenue: number;
  soldCount: number;
  avgTicket: number;
  pendingPayout: number;
}

// KPIs for the filtered period and for the equal-length window right before it, so the
// dashboard can show "▲ vs período anterior" deltas.
export interface SummaryReport {
  current: SummaryKpis;
  previous: SummaryKpis;
}

export interface WeeklyPoint {
  weekStart: string;
  profit: number;
  soldCount: number;
}
