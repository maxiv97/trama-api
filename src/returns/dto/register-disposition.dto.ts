import {
  IsIn,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  UNCLAIMED_DISPOSITIONS,
  type UnclaimedDisposition,
} from '../../shared/domain/enums';

export class RegisterDispositionDto {
  @IsIn(UNCLAIMED_DISPOSITIONS) disposition: UnclaimedDisposition;
  // Con "otro destino" la nota es obligatoria: es lo único que dice qué se hizo con la prenda.
  @ValidateIf(
    (dto: RegisterDispositionDto) =>
      dto.disposition === 'other' || dto.note !== undefined,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  note?: string;
}
