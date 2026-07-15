import { IsIn, IsOptional, IsString } from 'class-validator';
import type { GarmentAction } from '../../shared/state-machine/garment.state-machine';

const ACTIONS: GarmentAction[] = [
  'SUBMIT_PROPOSAL',
  'ACCEPT_PROPOSAL',
  'COUNTER_OFFER',
  'ACCEPT_COUNTEROFFER',
  'REJECT',
  'RECEIVE_AS_AGREED',
  'RECEIVE_WITH_REMARKS',
  'REJECT_RECEPTION',
  'REGISTER_SALE',
  'MARK_PAID_OUT',
  'REDELIVER',
  'CANCEL',
];

export class ApplyActionDto {
  @IsIn(ACTIONS) action: GarmentAction;
  @IsOptional() @IsString() note?: string;
}
