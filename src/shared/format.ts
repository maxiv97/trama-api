// Formats an amount as Argentine pesos for display in emails, e.g. 14000 -> "$14.000".
export function formatArs(amount: number): string {
  return '$' + Math.round(amount).toLocaleString('es-AR');
}

// Formats a date as a short Argentine date for display in emails, e.g. "12/09/2026".
export function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
