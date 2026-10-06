import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { MailService } from '../mail/mail.service';
import type { UserDocument } from '../users/schemas/user.schema';
import {
  CreateConsignorInput,
  CreateMerchantInput,
  UsersService,
} from '../users/users.service';
import { SessionUser } from './session-user';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
  ) {}

  async login(email: string, password: string): Promise<{ token: string; user: SessionUser }> {
    const user = await this.users.findByEmailWithPassword(email);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    return this.issueSession(user);
  }

  async registerConsignor(
    input: CreateConsignorInput,
  ): Promise<{ token: string; user: SessionUser }> {
    const consignor = await this.users.createConsignor(input);
    await this.sendVerificationCode(consignor as unknown as UserDocument);
    return this.issueSession(consignor as unknown as UserDocument);
  }

  async registerMerchant(
    input: CreateMerchantInput,
  ): Promise<{ token: string; user: SessionUser }> {
    const merchant = await this.users.createMerchant(input);
    await this.sendVerificationCode(merchant as unknown as UserDocument);
    return this.issueSession(merchant as unknown as UserDocument);
  }

  async verifyEmail(userId: string, code: string): Promise<{ verified: true }> {
    await this.users.verifyEmail(userId, code);
    return { verified: true };
  }

  async resendCode(userId: string): Promise<{ sent: true }> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    await this.sendVerificationCode(user);
    return { sent: true };
  }

  // Issues a code and emails it. A mail failure must not break the signup — the account already
  // exists and the user can ask for a new code — so the error is logged and swallowed.
  private async sendVerificationCode(user: UserDocument): Promise<void> {
    try {
      const code = await this.users.issueVerificationCode(user.id);
      await this.mail.sendVerificationCode(user.email, user.name, code);
    } catch (error) {
      this.logger.error(`No se pudo enviar el código de verificación a ${user.email}`, error as Error);
    }
  }

  private async issueSession(
    user: UserDocument,
  ): Promise<{ token: string; user: SessionUser }> {
    const sessionUser: SessionUser = { id: user.id, name: user.name, role: user.role };
    const token = await this.jwt.signAsync({
      sub: user.id,
      name: user.name,
      role: user.role,
    });
    return { token, user: sessionUser };
  }
}
