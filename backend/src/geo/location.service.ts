import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { haversineM, marketAt } from '../common/markets';
import { config } from '../config/config';
import { User } from '../users/user.entity';

export interface Position { lat: number; lng: number; heading?: number | null }
type Listener = (riderId: string, pos: Position) => Promise<void> | void;

/**
 * Receives drivers' positions. The database is written only when the driver has moved or a while has passed, so
 * thousands of drivers pinging every few seconds do not become thousands of writes. Anyone who needs to react to
 * movement (orders, trips) subscribes with onUpdate.
 */
@Injectable()
export class LocationService {
  private readonly log = new Logger('Location');
  private readonly listeners: Listener[] = [];
  private readonly last = new Map<string, { t: number; lat: number; lng: number }>();

  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  onUpdate(fn: Listener) {
    this.listeners.push(fn);
  }

  async update(riderId: string, pos: Position): Promise<{ accepted: boolean }> {
    if (!marketAt(pos, config.markets.enabled)) {
      throw new BadRequestException('That position is outside the countries ORBIT serves.');
    }
    const now = Date.now();
    const prev = this.last.get(riderId);
    if (prev && now - prev.t < 2000) return { accepted: false }; // bursts are ignored
    const moved = prev ? haversineM(prev, pos) : Infinity;
    if (moved >= 15 || !prev || now - prev.t > 15_000) {
      await this.users.update({ id: riderId }, { lat: pos.lat, lng: pos.lng, heading: pos.heading ?? null, locationAt: new Date(now) });
    }
    this.last.set(riderId, { t: now, lat: pos.lat, lng: pos.lng });
    for (const fn of this.listeners) {
      void Promise.resolve(fn(riderId, pos)).catch((e: Error) => this.log.warn(`Location listener failed: ${e.message}`));
    }
    return { accepted: true };
  }

  forget(riderId: string) {
    this.last.delete(riderId);
  }

  /** A driver's last known position, or null if unknown or older than the staleness limit. */
  async currentOf(riderId: string): Promise<{ lat: number; lng: number; heading: number | null; updatedAt: string } | null> {
    const u = await this.users.findOne({ where: { id: riderId }, select: { lat: true, lng: true, heading: true, locationAt: true } });
    if (!u || u.lat === null || u.lng === null || !u.locationAt) return null;
    if (Date.now() - new Date(u.locationAt).getTime() > config.trips.staleLocationSec * 1000) return null;
    return { lat: u.lat, lng: u.lng, heading: u.heading, updatedAt: new Date(u.locationAt).toISOString() };
  }
}
