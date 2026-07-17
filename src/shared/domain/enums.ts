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
  | 'cancelled';

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
  | 'payout';
