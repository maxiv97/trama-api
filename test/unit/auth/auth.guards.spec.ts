import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { CurrentUser } from '../../../src/auth/decorators/current-user.decorator';
import { IS_PUBLIC_KEY, Public } from '../../../src/auth/decorators/public.decorator';
import { Roles, ROLES_KEY } from '../../../src/auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../src/auth/jwt-auth.guard';
import { JwtStrategy } from '../../../src/auth/jwt.strategy';
import { RolesGuard } from '../../../src/auth/roles.guard';
import { config } from '../../helpers/world';
import type { UsersService } from '../../../src/users/users.service';

function context(user?: unknown): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => ({ user, headers: {} }),
      getResponse: () => ({}),
    }),
    getType: () => 'http',
    getArgs: () => [],
  } as unknown as ExecutionContext;
}

describe('Autenticación y autorización', () => {
  it('Public y Roles dejan metadatos en la ruta', () => {
    class C {
      @Public() @Roles('merchant') handler() {}
    }
    const handler = Object.getOwnPropertyDescriptor(C.prototype, 'handler')
      ?.value as () => void;
    const reflector = new Reflector();
    expect(reflector.get(IS_PUBLIC_KEY, handler)).toBe(true);
    expect(reflector.get(ROLES_KEY, handler)).toEqual(['merchant']);
  });

  it('RolesGuard: sin roles pasa; con roles exige el rol del usuario', () => {
    const reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as Reflector & { getAllAndOverride: jest.Mock };
    const guard = new RolesGuard(reflector);
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(context())).toBe(true);
    reflector.getAllAndOverride.mockReturnValue([]);
    expect(guard.canActivate(context())).toBe(true);
    reflector.getAllAndOverride.mockReturnValue(['merchant']);
    expect(guard.canActivate(context({ role: 'merchant' }))).toBe(true);
    expect(guard.canActivate(context({ role: 'consignor' }))).toBe(false);
    expect(guard.canActivate(context())).toBe(false);
  });

  it('JwtAuthGuard: las rutas públicas no piden token', async () => {
    const reflector = {
      getAllAndOverride: jest.fn(() => true),
    } as unknown as Reflector;
    expect(new JwtAuthGuard(reflector).canActivate(context())).toBe(true);
    const privateGuard = new JwtAuthGuard({
      getAllAndOverride: jest.fn(() => false),
    } as unknown as Reflector);
    await expect(
      Promise.resolve(privateGuard.canActivate(context())),
    ).rejects.toThrow();
  });

  it('JwtStrategy: valida que el usuario siga existiendo', async () => {
    const users = {
      findById: jest
        .fn()
        .mockResolvedValueOnce({ id: 'u1' })
        .mockResolvedValueOnce(null),
    };
    const strategy = new JwtStrategy(
      config({ JWT_SECRET: 's' }),
      users as unknown as UsersService,
    );
    await expect(
      strategy.validate({ sub: 'u1', name: 'Ana', role: 'consignor' }),
    ).resolves.toEqual({ id: 'u1', name: 'Ana', role: 'consignor' });
    await expect(
      strategy.validate({ sub: 'u2', name: 'X', role: 'merchant' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('CurrentUser devuelve el usuario de la sesión', () => {
    class C {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      handler(@CurrentUser() _user: unknown) {}
    }
    const meta = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      C,
      'handler',
    ) as Record<
      string,
      { factory: (d: unknown, c: ExecutionContext) => unknown }
    >;
    const factory = Object.values(meta)[0].factory;
    expect(factory(undefined, context({ id: 'u1' }))).toEqual({ id: 'u1' });
  });
});
