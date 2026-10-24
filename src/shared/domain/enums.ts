export type GarmentStatus =
  | 'submitted'
  | 'under_review'
  | 'counteroffer'
  | 'agreed'
  | 'in_stock'
  | 'with_remarks'
  | 'rejected'
  | 'sold'
  | 'paid_out'
  | 'no_agreement'
  | 'cancelled'
  // Vencimientos (los detecta la tarea diaria de plazos):
  | 'delivery_expired' // acordada y no entregada dentro del plazo de entrega (final)
  | 'awaiting_pickup' // terminó la ventana de venta sin venderse: el cedente debe retirarla
  | 'returned' // el cedente la retiró y el comercio registró la devolución (final)
  | 'unclaimed'; // venció el plazo para retirarla (final)

export type GarmentCondition = 'new' | 'very_good' | 'good' | 'fair';

export type EventActor = 'consignor' | 'merchant' | 'system';

export type Role = 'consignor' | 'merchant';

export type AccountStatus = 'active' | 'pending' | 'suspended';

export type ReceptionResult = 'accepted' | 'with_remarks' | 'rejected';

export type ReceptionDiscrepancy =
  | 'condition'
  | 'damage'
  | 'photo_mismatch'
  | 'measurements'
  | 'accessories'
  | 'hygiene';

export type ProposalStatus = 'under_review' | 'counteroffer' | 'agreed' | 'no_agreement';

export type PaymentMethod = 'cash' | 'transfer';

export type PayoutStatus = 'pending' | 'paid' | 'overdue';

export type NotificationType =
  | 'proposal'
  | 'counteroffer'
  | 'agreement'
  | 'reception'
  | 'sale'
  | 'payout'
  | 'delivery' // plazo de entrega: recordatorio y vencimiento
  | 'expiry' // ventana de venta: aviso previo y prenda por retirar
  | 'pickup'; // retiro: recordatorio, devolución registrada y prenda no retirada

// Qué hizo el comercio con una prenda que el cedente no retiró a tiempo (según los Términos).
export const UNCLAIMED_DISPOSITIONS = ['donated', 'kept', 'other'] as const;
export type UnclaimedDisposition = (typeof UNCLAIMED_DISPOSITIONS)[number];
