import { IsNumber, IsPositive, IsString, MinLength } from 'class-validator';

export class CreateProposalDto {
  @IsString() @MinLength(1) garmentId: string;
  @IsNumber() @IsPositive() requestedConsignorPrice: number;
}
