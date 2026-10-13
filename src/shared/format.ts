// Formats an amount as Argentine pesos for display in emails, e.g. 14000 -> "$14.000".
export function formatArs(amount: number): string {
  return '$' + Math.round(amount).toLocaleString('es-AR');
}
