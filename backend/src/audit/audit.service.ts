import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Observable, tap } from 'rxjs';
import { Repository } from 'typeorm';
import { Role } from '../common/enums';
import { User } from '../users/user.entity';
import { AuditLog } from './audit.entity';

/** The only request fields that are ever written to the log. Passwords and anything not listed here are left out. */
const SAFE_FIELDS = ['reason', 'note', 'status', 'code', 'type', 'value', 'role', 'online', 'maxDiscount', 'validDays', 'maxUses', 'riderId'];

@Injectable()
export class AuditService {
  private readonly log = new Logger('Audit');
  constructor(
    @InjectRepository(AuditLog) private readonly rows: Repository<AuditLog>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  record(actorId: string, action: string, targetId: string | null, details: AuditLog['details']): void {
    void this.rows.save(this.rows.create({ actorId, action: action.slice(0, 120), targetId, details })).catch((e: Error) => this.log.error(`Could not write audit entry: ${e.message}`));
  }

  async list(limit: number, offset: number, actorId?: string) {
    const [items, total] = await this.rows.findAndCount({ where: actorId ? { actorId } : {}, order: { at: 'DESC' }, take: Math.min(Math.max(limit, 1), 100), skip: Math.max(offset, 0) });
    const names = new Map((await this.users.findByIds([...new Set(items.map((i) => i.actorId))])).map((u) => [u.id, u.name]));
    return { total, items: items.map((i) => ({ id: i.id, at: i.at.toISOString(), actor: { id: i.actorId, name: names.get(i.actorId) ?? 'Unknown' }, action: i.action, targetId: i.targetId, details: i.details })) };
  }
}

/** Logs every successful change an admin makes, without each admin route having to remember to. */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<{ method: string; user?: { id: string; role: string }; route?: { path?: string }; params?: Record<string, string>; body?: Record<string, unknown> }>();
    const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (!mutating) return next.handle();
    return next.handle().pipe(tap(() => {
      if (req.user?.role !== Role.ADMIN || !req.route?.path?.includes('/admin/')) return;
      const details: AuditLog['details'] = {};
      for (const k of SAFE_FIELDS) {
        const v = req.body?.[k];
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') details[k] = typeof v === 'string' ? v.slice(0, 200) : v;
      }
      this.audit.record(req.user.id, `${req.method} ${req.route.path.replace(/^\/api/, '')}`, Object.values(req.params ?? {})[0] ?? null, details);
    }));
  }
}
