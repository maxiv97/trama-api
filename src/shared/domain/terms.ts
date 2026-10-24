// Plazos por defecto de la consignación (decisión del equipo, 23/10/2026). Cada comercio puede
// modificarlos en el registro y en Configuración; el acuerdo congela los vigentes al cerrarse.
export const DEFAULT_DELIVERY_DAYS = 7; // días para que el cedente entregue la prenda acordada
export const DEFAULT_PICKUP_DAYS = 15; // días para retirar la prenda que no se vendió

export const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}
