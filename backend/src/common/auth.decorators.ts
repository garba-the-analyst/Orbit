/**
 * Authentication/authorisation decorators.
 *
 * Every route requires a valid JWT by default (a global guard). Opt out with @Public(),
 * and restrict by role with @Roles(...). Role-restricted routes additionally require an ACTIVE
 * account, so a merchant or rider awaiting verification cannot operate yet.
 */
import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Role } from './enums';

export const IS_PUBLIC_KEY = 'orbit:isPublic';
export const ROLES_KEY = 'orbit:roles';

/** The authenticated principal attached to the request by JwtAuthGuard. */
export interface AuthUser {
  id: string;
  role: Role;
  status: string;
  name: string;
}

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
