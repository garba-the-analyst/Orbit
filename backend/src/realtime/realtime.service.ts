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

  /** Tells the customer and driver of a trip that it changed. */
  tripUpdated(trip: { id: string; status: string }, userIds: Array<string | null | undefined>) {
    if (!this.server) return;
    for (const id of new Set(userIds.filter((x): x is string => !!x))) {
      this.server.to(userRoom(id)).emit('trip.updated', { tripId: trip.id, status: trip.status });
    }
  }

  /** Tells specific drivers their offers changed (a new offer arrived, or one was taken or withdrawn). */
  offersChanged(driverIds: string[]) {
    if (!this.server) return;
    for (const id of new Set(driverIds)) this.server.to(userRoom(id)).emit('offers.changed', { at: Date.now() });
  }

  /** Tells all online riders the job board changed (a job appeared or was taken). */
  jobsChanged() {
    this.server?.to(riderRoom).emit('jobs.changed', { at: Date.now() });
  }

  /** Tells an admin dashboard that verification queues changed. */
  adminChanged() {
    this.server?.to('admins').emit('admin.changed', { at: Date.now() });
  }

  /**
   * A driver's position, sent only to the customer whose job they are on (never broadcast). This is the one place
   * a socket carries data rather than a signal: a moving dot cannot wait for a REST round trip.
   */
  courierMoved(customerId: string, payload: { orderId?: string; tripId?: string; lat: number; lng: number; heading: number | null }) {
    this.server?.to(userRoom(customerId)).emit('courier.moved', payload);
  }

  /** Tells one person's open app that a new notification exists; the app fetches it over REST. */
  notificationAdded(userId: string, id: string) {
    this.server?.to(userRoom(userId)).emit('notification.new', { id });
  }

  /** Notifies one user (e.g. their account was approved). */
  userUpdated(userId: string) {
    this.server?.to(userRoom(userId)).emit('account.updated', { at: Date.now() });
    this.logger.debug(`account.updated -> ${userId}`);
  }
}
