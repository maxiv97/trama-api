import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Public } from '../auth/decorators/public.decorator';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { SupportService } from './support.service';

@Controller('support')
export class SupportController {
  constructor(
    private readonly support: SupportService,
    private readonly jwt: JwtService,
  ) {}

  // Público: cualquiera puede escribir desde /ayuda/contacto. Si viaja un JWT válido (lo agrega el
  // interceptor del front cuando hay sesión), el ticket queda asociado al usuario.
  @Public()
  @Post('tickets')
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateTicketDto,
    @Headers('authorization') authorization?: string,
  ) {
    return this.support.create(dto, this.optionalUserId(authorization));
  }

  private optionalUserId(authorization?: string): string | undefined {
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return undefined;
    try {
      return this.jwt.verify<{ sub: string }>(token).sub;
    } catch {
      return undefined; // token vencido o inválido: se trata como anónimo
    }
  }
}
