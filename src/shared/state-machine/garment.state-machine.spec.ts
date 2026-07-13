import {
  availableActions,
  canTransition,
  GarmentAction,
  transition,
} from './garment.state-machine';
import { GarmentStatus } from '../domain/enums';

describe('garment state machine', () => {
  it('recorre el flujo feliz completo', () => {
    let status: GarmentStatus = 'submitted';
    status = transition(status, 'SUBMIT_PROPOSAL');
    expect(status).toBe('under_review');
    status = transition(status, 'ACCEPT_PROPOSAL');
    expect(status).toBe('agreed');
    status = transition(status, 'RECEIVE_AS_AGREED');
    expect(status).toBe('in_stock');
    status = transition(status, 'REGISTER_SALE');
    expect(status).toBe('sold');
    status = transition(status, 'MARK_PAID_OUT');
    expect(status).toBe('paid_out');
  });

  it('maneja la contraoferta y el acuerdo', () => {
    expect(transition('under_review', 'COUNTER_OFFER')).toBe('counteroffer');
    expect(transition('counteroffer', 'ACCEPT_COUNTEROFFER')).toBe('agreed');
  });

  it('permite recibir con observaciones y luego vender', () => {
    expect(transition('agreed', 'RECEIVE_WITH_REMARKS')).toBe('with_remarks');
    expect(transition('with_remarks', 'REGISTER_SALE')).toBe('sold');
  });

  it('reintenta la entrega tras un rechazo de recepción', () => {
    expect(transition('agreed', 'REJECT_RECEPTION')).toBe('rejected');
    expect(transition('rejected', 'REDELIVER')).toBe('agreed');
  });

  it('lanza en transiciones inválidas', () => {
    expect(() => transition('paid_out', 'REGISTER_SALE')).toThrow();
    expect(() => transition('submitted', 'REGISTER_SALE')).toThrow();
    expect(() => transition('sold', 'REJECT')).toThrow();
  });

  it('reporta las acciones disponibles por estado', () => {
    expect(availableActions('under_review').sort()).toEqual(
      (['ACCEPT_PROPOSAL', 'COUNTER_OFFER', 'REJECT'] as GarmentAction[]).sort(),
    );
    expect(availableActions('paid_out')).toEqual([]);
    expect(availableActions('no_agreement')).toEqual([]);
  });

  it('canTransition coincide con transition', () => {
    expect(canTransition('under_review', 'ACCEPT_PROPOSAL')).toBe(true);
    expect(canTransition('under_review', 'REGISTER_SALE')).toBe(false);
  });
});
