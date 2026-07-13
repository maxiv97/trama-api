import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
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
    const sessionUser: SessionUser = { id: user.id, name: user.name, role: user.role };
    const token = await this.jwt.signAsync({
      sub: user.id,
      name: user.name,
      role: user.role,
    });
    return { token, user: sessionUser };
  }
}
