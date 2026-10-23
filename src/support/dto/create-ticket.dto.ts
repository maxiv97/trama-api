import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SUPPORT_MOTIVOS, SUPPORT_ROLES } from '../support.constants';
import type { SupportMotivo, SupportRole } from '../support.constants';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateTicketDto {
  @IsIn(SUPPORT_MOTIVOS) motivo: SupportMotivo;
  @IsIn(SUPPORT_ROLES) rol: SupportRole;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(80) nombre: string;
  @Transform(trim) @IsEmail() @MaxLength(160) email: string;
  @Transform(trim) @IsString() @MinLength(20) @MaxLength(2000) mensaje: string;
  @IsOptional() @IsString() @MaxLength(300) origen?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  faqsVistas?: string[];
  // Data URL de una imagen (el tamaño se controla en el servicio).
  @IsOptional()
  @IsString()
  @Matches(/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/, {
    message: 'La captura tiene que ser una imagen PNG, JPG, WEBP o GIF',
  })
  captura?: string;
  // Honeypot: campo oculto en el formulario; si viene con algo, es un bot.
  @IsOptional() @IsString() @MaxLength(500) website?: string;
}
