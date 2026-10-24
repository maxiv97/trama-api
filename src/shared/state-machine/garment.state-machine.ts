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
  | 'CANCEL'
  // Las de vencimiento solo las ejecuta el sistema (tarea diaria); REGISTER_RETURN, el comercio
  // desde su endpoint propio. Ninguna se acepta en POST /garments/:id/actions.
  | 'EXPIRE_DELIVERY'
  | 'EXPIRE_SALE'
  | 'REGISTER_RETURN'
  | 'MARK_UNCLAIMED';

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
    EXPIRE_DELIVERY: 'delivery_expired',
  },
  in_stock: { REGISTER_SALE: 'sold', EXPIRE_SALE: 'awaiting_pickup' },
  with_remarks: { REGISTER_SALE: 'sold', EXPIRE_SALE: 'awaiting_pickup' },
  rejected: { REDELIVER: 'agreed', EXPIRE_DELIVERY: 'delivery_expired' },
  sold: { MARK_PAID_OUT: 'paid_out' },
  paid_out: {},
  no_agreement: {},
  cancelled: {},
  // Vencida la venta ya no se puede vender: el acuerdo de precio terminó.
  awaiting_pickup: { REGISTER_RETURN: 'returned', MARK_UNCLAIMED: 'unclaimed' },
  delivery_expired: {},
  returned: {},
  unclaimed: {},
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
