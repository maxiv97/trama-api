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
  | 'no_agreement';

export type GarmentCondition = 'new' | 'very_good' | 'good' | 'fair';

export type EventActor = 'consignor' | 'merchant' | 'system';

export type Role = 'consignor' | 'merchant';

export type ReceptionResult = 'accepted' | 'with_remarks' | 'rejected';

export type ReceptionDiscrepancy =
  | 'condition'
  | 'damage'
  | 'photo_mismatch'
  | 'measurements'
  | 'accessories'
  | 'hygiene';

export type PaymentMethod = 'cash' | 'transfer';

export type PayoutStatus = 'pending' | 'paid' | 'overdue';

export type NotificationType =
  | 'proposal'
  | 'counteroffer'
  | 'agreement'
  | 'reception'
  | 'sale'
  | 'payout';
