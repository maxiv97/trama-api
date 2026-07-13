import { IsArray, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import type { ReceptionDiscrepancy, ReceptionResult } from '../../shared/domain/enums';

const RESULTS: ReceptionResult[] = ['accepted', 'with_remarks', 'rejected'];
const DISCREPANCIES: ReceptionDiscrepancy[] = [
  'condition',
  'damage',
  'photo_mismatch',
  'measurements',
  'accessories',
  'hygiene',
];

export class CreateReceptionDto {
  @IsString() @MinLength(1) garmentId: string;
  @IsString() @MinLength(1) salesPointId: string;
  @IsIn(RESULTS) result: ReceptionResult;
  @IsArray() @IsIn(DISCREPANCIES, { each: true }) discrepancies: ReceptionDiscrepancy[];
  @IsOptional() @IsString() detail?: string;
  @IsArray() @IsString({ each: true }) evidence: string[];
}
