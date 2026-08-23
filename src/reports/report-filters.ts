// The "recorte" shared by every report: an optional date range plus the sales-point,
// category and consignor dimensions. Date bounds scope sale-derived figures; the three
// dimensions scope the garments a report looks at. All optional — an empty filter is the
// whole merchant.
export interface ReportFilters {
  from?: Date;
  to?: Date;
  salesPointId?: string;
  category?: string;
  consignorId?: string;
}
