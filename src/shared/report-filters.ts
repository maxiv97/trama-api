// The "recorte" shared by the reports and the payouts endpoints: an optional date range plus
// the sales-point, category and consignor dimensions. Date bounds scope sale-derived figures;
// the three dimensions scope the garments a report looks at. All optional — an empty filter is
// the whole merchant.
export interface ReportFilters {
  from?: Date;
  to?: Date;
  salesPointId?: string;
  category?: string;
  consignorId?: string;
}

// Sales-point / category / consignor scope: which garments an endpoint looks at.
export function garmentInScope(
  garment: { salesPointId?: string | null; category: string; consignorId: string },
  filters: ReportFilters,
): boolean {
  if (filters.salesPointId && garment.salesPointId !== filters.salesPointId) return false;
  if (filters.category && garment.category !== filters.category) return false;
  if (filters.consignorId && garment.consignorId !== filters.consignorId) return false;
  return true;
}

// Date scope: whether a sale falls inside the filtered period.
export function saleInRange(soldAt: Date, filters: ReportFilters): boolean {
  if (filters.from && soldAt < filters.from) return false;
  if (filters.to && soldAt > filters.to) return false;
  return true;
}
