import { GarmentStatus } from '../domain/enums';

export type GarmentAction =
  | 'SUBMIT_PROPOSAL'
  | 'ACCEPT_PROPOSAL'
  | 'COUNTER_OFFER'
  | 'ACCEPT_COUNTEROFFER'
  | 'REJECT'
  | 'RECEIVE_AS_AGREED'
  | 'RECEIVE_WITH_REMARKS'
  | 'REJECT_RECEPTION'
  | 'REGISTER_SALE'
  | 'MARK_PAID_OUT'
  | 'REDELIVER'
  | 'CANCEL';

const TRANSITIONS: Record<GarmentStatus, Partial<Record<GarmentAction, GarmentStatus>>> = {
  submitted: { SUBMIT_PROPOSAL: 'under_review' },
  under_review: {
    ACCEPT_PROPOSAL: 'agreed',
    COUNTER_OFFER: 'counteroffer',
    REJECT: 'no_agreement',
    CANCEL: 'cancelled',
  },
  counteroffer: { ACCEPT_COUNTEROFFER: 'agreed', REJECT: 'no_agreement', CANCEL: 'cancelled' },
  agreed: {
    RECEIVE_AS_AGREED: 'in_stock',
    RECEIVE_WITH_REMARKS: 'with_remarks',
    REJECT_RECEPTION: 'rejected',
    CANCEL: 'cancelled',
  },
  in_stock: { REGISTER_SALE: 'sold' },
  with_remarks: { REGISTER_SALE: 'sold' },
  rejected: { REDELIVER: 'agreed' },
  sold: { MARK_PAID_OUT: 'paid_out' },
  paid_out: {},
  no_agreement: {},
  cancelled: {},
};

export function canTransition(status: GarmentStatus, action: GarmentAction): boolean {
  return TRANSITIONS[status]?.[action] !== undefined;
}

export function transition(status: GarmentStatus, action: GarmentAction): GarmentStatus {
  const next = TRANSITIONS[status]?.[action];
  if (!next) {
    throw new Error(`Transición inválida: ${status} + ${action}`);
  }
  return next;
}

export function availableActions(status: GarmentStatus): GarmentAction[] {
  return Object.keys(TRANSITIONS[status] ?? {}) as GarmentAction[];
}
