// Catálogos del contacto de ayuda (handoff design_handoff_trama_ayuda §2.4). Deben coincidir con
// MOTIVOS en trama-web/src/app/features/public/help/help.content.ts.
export const SUPPORT_MOTIVOS = [
  'cuenta',
  'recepcion',
  'plazos',
  'precios',
  'liquidaciones',
  'no-vendidas',
  'discrepancias',
  'ubicacion',
  'problema',
  'otro',
] as const;
export type SupportMotivo = (typeof SUPPORT_MOTIVOS)[number];

export const MOTIVO_LABELS: Record<SupportMotivo, string> = {
  cuenta: 'Registro y cuenta',
  recepcion: 'Recepción de prendas',
  plazos: 'Plazos y período de gracia',
  precios: 'Precios y comisión',
  liquidaciones: 'Liquidaciones y pagos',
  'no-vendidas': 'Prendas no vendidas y devolución',
  discrepancias: 'Discrepancias en la recepción',
  ubicacion: 'Ubicación y comercios cercanos',
  problema: 'Algo no funciona',
  otro: 'Otro',
};

export const SUPPORT_ROLES = ['cedente', 'comercio', 'sin-cuenta'] as const;
export type SupportRole = (typeof SUPPORT_ROLES)[number];

export const ROLE_LABELS: Record<SupportRole, string> = {
  cedente: 'Cedente',
  comercio: 'Comercio',
  'sin-cuenta': 'Todavía no tiene cuenta',
};

/** Antispam: tope de tickets por email en la ventana. */
export const MAX_TICKETS_PER_WINDOW = 5;
export const TICKET_WINDOW_MS = 60 * 60 * 1000;

/** Captura opcional: una imagen de hasta 5 MB. */
export const MAX_CAPTURE_BYTES = 5 * 1024 * 1024;
