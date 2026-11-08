/**
 * Realtime layer (proposal section 9: Socket.IO for order events).
 *
 * Design choice: sockets carry only tiny "something changed" signals (ids and a status), never
 * personal data. Clients react by re-fetching over the authenticated REST API, so the socket can
 * never leak an address or phone number to the wrong person.
 *
 * Redis is not used in the MVP (single process). To scale horizontally, add the Socket.IO Redis adapter.
 */
import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';

export const riderRoom = 'riders';
export const userRoom = (userId: string) => `user:${userId}`;

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server: Server | null = null;

  attach(server: Server) {
    this.server = server;
  }

  /** Tells the customer, the shop owner and the assigned rider that an order changed. */
  orderUpdated(order: { id: string; status: string }, userIds: Array<string | null | undefined>) {
    if (!this.server) return;
    for (const id of new Set(userIds.filter((x): x is string => !!x))) {
      this.server.to(userRoom(id)).emit('order.updated', { orderId: order.id, status: order.status });
    }
  }

  /** Tells all online riders the job board changed (a job appeared or was taken). */
  jobsChanged() {
    this.server?.to(riderRoom).emit('jobs.changed', { at: Date.now() });
  }

  /** Tells an admin dashboard that verification queues changed. */
  adminChanged() {
    this.server?.to('admins').emit('admin.changed', { at: Date.now() });
  }

  /** Notifies one user (e.g. their account was approved). */
  userUpdated(userId: string) {
    this.server?.to(userRoom(userId)).emit('account.updated', { at: Date.now() });
    this.logger.debug(`account.updated -> ${userId}`);
  }
}
