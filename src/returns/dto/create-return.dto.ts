import {
  Equals,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateReturnDto {
  @IsString() @MinLength(1) garmentId: string;
  @IsBoolean()
  @Equals(true, {
    message: 'Hay que verificar el DNI del cedente antes de entregar la prenda',
  })
  identityChecked: boolean;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
