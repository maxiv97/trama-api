import { calculateConsignorAmount, calculateSalePrice } from './price.util';

describe('price util', () => {
  it('calcula el precio de venta desde el precio del cedente y su porcentaje', () => {
    expect(calculateSalePrice(7000, 70)).toBe(10000);
    expect(calculateSalePrice(3000, 30)).toBe(10000);
  });

  it('redondea el precio de venta a pesos enteros', () => {
    expect(calculateSalePrice(5000, 30)).toBe(16667);
  });

  it('calcula el monto del cedente desde la venta real y su porcentaje', () => {
    expect(calculateConsignorAmount(10000, 70)).toBe(7000);
    expect(calculateConsignorAmount(12000, 30)).toBe(3600);
  });
});
