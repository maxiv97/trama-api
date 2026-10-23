import { Body, Controller, Get, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterConsignorDto } from './dto/register-consignor.dto';
import { RegisterMerchantDto } from './dto/register-merchant.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import type { SessionUser } from './session-user';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Public()
  @Post('register/consignor')
  registerConsignor(@Body() dto: RegisterConsignorDto) {
    return this.auth.registerConsignor(dto);
  }

  @Public()
  @Post('register/merchant')
  registerMerchant(@Body() dto: RegisterMerchantDto) {
    return this.auth.registerMerchant(dto);
  }

  @Post('verify-email')
  verifyEmail(@CurrentUser() user: SessionUser, @Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(user.id, dto.code);
  }

  @Post('resend-code')
  resendCode(@CurrentUser() user: SessionUser) {
    return this.auth.resendCode(user.id);
  }

  // Sesión actual con el email (lo usa el contacto de ayuda para precargar el formulario).
  @Get('me')
  me(
    @CurrentUser() user: SessionUser,
  ): Promise<SessionUser & { email?: string }> {
    return this.auth.me(user);
  }
}
