import {
  availableActions,
  canTransition,
  GarmentAction,
  transition,
} from '../../../../src/shared/state-machine/garment.state-machine';
import { GarmentStatus } from '../../../../src/shared/domain/enums';

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

  it('permite al cedente cancelar antes de entregar', () => {
    expect(transition('under_review', 'CANCEL')).toBe('cancelled');
    expect(transition('counteroffer', 'CANCEL')).toBe('cancelled');
    expect(transition('agreed', 'CANCEL')).toBe('cancelled');
  });

  it('no permite cancelar una vez entregada', () => {
    expect(() => transition('in_stock', 'CANCEL')).toThrow();
    expect(() => transition('with_remarks', 'CANCEL')).toThrow();
    expect(() => transition('sold', 'CANCEL')).toThrow();
  });

  it('lanza en transiciones inválidas', () => {
    expect(() => transition('paid_out', 'REGISTER_SALE')).toThrow();
    expect(() => transition('submitted', 'REGISTER_SALE')).toThrow();
    expect(() => transition('sold', 'REJECT')).toThrow();
    expect(() => transition('cancelled', 'REDELIVER')).toThrow();
  });

  it('reporta las acciones disponibles por estado', () => {
    expect(availableActions('under_review').sort()).toEqual(
      (['ACCEPT_PROPOSAL', 'COUNTER_OFFER', 'REJECT', 'CANCEL'] as GarmentAction[]).sort(),
    );
    expect(availableActions('paid_out')).toEqual([]);
    expect(availableActions('cancelled')).toEqual([]);
  });

  it('vence la entrega de una prenda acordada o rechazada en la recepción', () => {
    expect(transition('agreed', 'EXPIRE_DELIVERY')).toBe('delivery_expired');
    expect(transition('rejected', 'EXPIRE_DELIVERY')).toBe('delivery_expired');
    expect(availableActions('delivery_expired')).toEqual([]);
  });

  it('pasa a por retirar al vencer la venta y cierra con la devolución o sin retiro', () => {
    expect(transition('in_stock', 'EXPIRE_SALE')).toBe('awaiting_pickup');
    expect(transition('with_remarks', 'EXPIRE_SALE')).toBe('awaiting_pickup');
    expect(transition('awaiting_pickup', 'REGISTER_RETURN')).toBe('returned');
    expect(transition('awaiting_pickup', 'MARK_UNCLAIMED')).toBe('unclaimed');
    expect(availableActions('returned')).toEqual([]);
    expect(availableActions('unclaimed')).toEqual([]);
  });

  it('no permite vender una prenda por retirar ni vencer lo que ya se vendió', () => {
    expect(() => transition('awaiting_pickup', 'REGISTER_SALE')).toThrow();
    expect(() => transition('sold', 'EXPIRE_SALE')).toThrow();
    expect(() => transition('in_stock', 'EXPIRE_DELIVERY')).toThrow();
    expect(() => transition('agreed', 'EXPIRE_SALE')).toThrow();
  });

  it('canTransition coincide con transition', () => {
    expect(canTransition('under_review', 'ACCEPT_PROPOSAL')).toBe(true);
    expect(canTransition('under_review', 'REGISTER_SALE')).toBe(false);
  });
});
