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
export const SUPER_ADMIN_KEY = 'orbit:superAdminOnly';
export const ALLOW_PASSWORD_CHANGE_KEY = 'orbit:allowWhilePasswordChange';

/** The authenticated principal attached to the request by JwtAuthGuard. */
export interface AuthUser {
  id: string;
  role: Role;
  status: string;
  name: string;
  isSuperAdmin: boolean;
  mustChangePassword: boolean;
}

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
/** Only the superadmin may call this route (in addition to any @Roles restriction). */
export const SuperAdminOnly = () => SetMetadata(SUPER_ADMIN_KEY, true);
/** Allow this route while the person still has to replace a temporary password. */
export const AllowWhilePasswordChange = () => SetMetadata(ALLOW_PASSWORD_CHANGE_KEY, true);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
