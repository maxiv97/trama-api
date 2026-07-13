export function calculateSalePrice(consignorPrice: number, consignorPercentage: number): number {
  return Math.round(consignorPrice / (consignorPercentage / 100));
}

export function calculateConsignorAmount(
  actualSalePrice: number,
  consignorPercentage: number,
): number {
  return Math.round(actualSalePrice * (consignorPercentage / 100));
}
