/**
 * Global guards.
 *
 * JwtAuthGuard   - verifies the bearer token and loads the user fresh from the database, so suspending
 *                  an account takes effect immediately rather than when the token expires.
 * RolesGuard     - enforces @Roles() and requires ACTIVE status on role-restricted routes.
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { AccountStatus, Role } from './enums';
import { AuthUser, IS_PUBLIC_KEY, ROLES_KEY } from './auth.decorators';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const header: string | undefined = request.headers['authorization'];
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('Sign in to continue.');

    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Your session has expired. Sign in again.');
    }

    const user = await this.users.findOne({ where: { id: payload.sub } });
    if (!user || user.status === AccountStatus.SUSPENDED) {
      throw new UnauthorizedException('This account is not available.');
    }

    const principal: AuthUser = { id: user.id, role: user.role, status: user.status, name: user.name };
    request.user = principal;
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;

    const user: AuthUser | undefined = context.switchToHttp().getRequest().user;
    if (!user || !roles.includes(user.role)) {
      throw new ForbiddenException('You do not have access to this action.');
    }
    if (user.status !== AccountStatus.ACTIVE) {
      throw new ForbiddenException('Your account is waiting for ORBIT verification. You will be notified once it is approved.');
    }
    return true;
  }
}
