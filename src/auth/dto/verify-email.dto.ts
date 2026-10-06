import { Matches } from 'class-validator';

export class VerifyEmailDto {
  @Matches(/^\d{6}$/, { message: 'El código tiene 6 dígitos' })
  code: string;
}
