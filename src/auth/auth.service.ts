import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { UserDocument } from '../users/schemas/user.schema';
import {
  CreateConsignorInput,
  CreateMerchantInput,
  UsersService,
} from '../users/users.service';
import { SessionUser } from './session-user';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
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
    return this.issueSession(consignor as unknown as UserDocument);
  }

  async registerMerchant(
    input: CreateMerchantInput,
  ): Promise<{ token: string; user: SessionUser }> {
    const merchant = await this.users.createMerchant(input);
    return this.issueSession(merchant as unknown as UserDocument);
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
