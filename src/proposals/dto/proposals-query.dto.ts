import { Transform } from 'class-transformer';
import { ArrayNotEmpty, IsIn, IsOptional } from 'class-validator';
import { GarmentStatus } from '../../shared/domain/enums';

export const PROPOSAL_LIST_STATUSES: GarmentStatus[] = [
  'under_review',
  'counteroffer',
  'no_agreement',
  'cancelled',
];

// Acepta tanto ?status=a,b como ?status=a&status=b.
const toList = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string'
    ? value.split(',').map((item) => item.trim())
    : value;

export class ProposalsQueryDto {
  @IsOptional()
  @Transform(toList)
  @ArrayNotEmpty()
  @IsIn(PROPOSAL_LIST_STATUSES, { each: true })
  status?: GarmentStatus[];
}
