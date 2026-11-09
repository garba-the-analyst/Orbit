import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThan, Repository } from 'typeorm';
import { RealtimeService } from '../realtime/realtime.service';
import { Notification } from './notification.entity';

export interface NewNotification {
  userId: string | null | undefined;
  type: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface NotificationView {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, string>;
  read: boolean;
  createdAt: string;
}

const KEEP_PER_USER = 200;

@Injectable()
export class NotificationsService {
  private readonly log = new Logger('Notifications');

  constructor(
    @InjectRepository(Notification) private readonly repo: Repository<Notification>,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Stores notifications and pings each recipient's open app. It never throws: a failure to notify must not
   * undo the order or trip change that caused it.
   */
  async push(items: NewNotification[]): Promise<void> {
    const valid = items.filter((n): n is NewNotification & { userId: string } => !!n.userId);
    if (valid.length === 0) return;
    try {
      const rows = await this.repo.save(
        valid.map((n) =>
          this.repo.create({ userId: n.userId, type: n.type, title: n.title.slice(0, 120), body: n.body.slice(0, 300), data: n.data ?? {} }),
        ),
      );
      for (const r of rows) this.realtime.notificationAdded(r.userId, r.id);
      for (const userId of new Set(valid.map((n) => n.userId))) void this.trim(userId);
    } catch (e) {
      this.log.error(`Could not store notification: ${(e as Error).message}`);
    }
  }

  /** Keeps each person's inbox bounded so it cannot grow without limit. */
  private async trim(userId: string): Promise<void> {
    try {
      const cutoff = await this.repo.find({ where: { userId }, order: { createdAt: 'DESC' }, skip: KEEP_PER_USER, take: 1, select: { createdAt: true } });
      if (cutoff[0]) await this.repo.delete({ userId, createdAt: LessThan(cutoff[0].createdAt) });
    } catch {
      /* housekeeping only */
    }
  }

  async list(userId: string, limit = 30, before?: string): Promise<NotificationView[]> {
    const where = before ? { userId, createdAt: LessThan(new Date(before)) } : { userId };
    const rows = await this.repo.find({ where, order: { createdAt: 'DESC' }, take: Math.min(Math.max(limit, 1), 100) });
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body,
      data: r.data ?? {},
      read: r.readAt !== null,
      createdAt: new Date(r.createdAt).toISOString(),
    }));
  }

  unreadCount(userId: string): Promise<number> {
    return this.repo.count({ where: { userId, readAt: IsNull() } });
  }

  /** Marks the given notifications read, or all of them when no ids are given. Only ever touches your own. */
  async markRead(userId: string, ids?: string[]): Promise<{ unread: number }> {
    const where = ids?.length ? { userId, id: In(ids), readAt: IsNull() } : { userId, readAt: IsNull() };
    await this.repo.update(where, { readAt: new Date() });
    return { unread: await this.unreadCount(userId) };
  }

  async clear(userId: string): Promise<void> {
    await this.repo.delete({ userId });
  }
}
