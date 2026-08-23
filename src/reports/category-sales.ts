export interface CategorySales {
  category: string;
  soldCount: number;
  soldRevenue: number;
  merchantProfit: number;
  inStockCount: number;
  conversion: number | null;
  avgDaysToSale: number | null;
}
