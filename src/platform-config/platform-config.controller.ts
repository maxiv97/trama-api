import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators/public.decorator';

// Configuración pública que el front lee al iniciar (sin autenticación).
// Los feature flags se controlan por variables de entorno en el deploy.
@Controller('config')
export class PlatformConfigController {
  constructor(private readonly config: ConfigService) {}

  @Public()
  @Get()
  get() {
    return {
      // Cobro a comercios (posicionamiento + suscripción). Se prende con
      // MONETIZATION_ENABLED=true en el entorno del backend.
      monetization: this.config.get<string>('MONETIZATION_ENABLED', 'false') === 'true',
    };
  }
}
