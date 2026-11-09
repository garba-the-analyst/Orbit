import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Not, Repository } from 'typeorm';
import { VEHICLE_SPECS } from '../common/catalog';
import { VehicleType } from '../common/enums';
import { UploadsService } from '../uploads/uploads.service';
import { User } from '../users/user.entity';
import { CreateVehicleDto, UpdateVehicleDto } from './vehicles.dto';
import { Vehicle } from './vehicle.entity';

const MAX_VEHICLES_PER_PERSON = 6;
export const normalisePlate = (p: string) => p.toUpperCase().replace(/[\s-]+/g, '');

export interface VehicleView {
  id: string; type: string; fleet: string; label: string;
  make: string; model: string; color: string; plate: string; year: number | null;
  capacityKg: number; photos: string[]; status: string; reviewNote: string | null; isActive: boolean;
}

export const toVehicleView = (v: Vehicle): VehicleView => ({
  id: v.id, type: v.type, fleet: v.fleet, label: VEHICLE_SPECS[v.type as VehicleType]?.label ?? v.type,
  make: v.make, model: v.model, color: v.color, plate: v.plate, year: v.year,
  capacityKg: v.capacityKg ?? VEHICLE_SPECS[v.type as VehicleType]?.maxWeightKg ?? 0,
  photos: v.photos ?? [], status: v.status, reviewNote: v.reviewNote, isActive: v.isActive,
});

@Injectable()
export class VehiclesService {
  constructor(
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectDataSource() private readonly db: DataSource,
    private readonly uploads: UploadsService,
  ) {}

  async list(ownerId: string): Promise<VehicleView[]> {
    return (await this.vehicles.find({ where: { ownerId }, order: { createdAt: 'ASC' } })).map(toVehicleView);
  }

  private async mine(ownerId: string, id: string): Promise<Vehicle> {
    const v = await this.vehicles.findOne({ where: { id, ownerId } });
    if (!v) throw new NotFoundException('Vehicle not found.');
    return v;
  }

  /** One plate, one vehicle: a plate already on someone else's live registration is refused. */
  private async assertPlateFree(plate: string, exceptId?: string) {
    if (!plate) return;
    const clash = await this.vehicles.findOne({ where: { plate, status: Not('REJECTED'), ...(exceptId ? { id: Not(exceptId) } : {}) } });
    if (clash) throw new ConflictException('A vehicle with this plate is already registered.');
  }

  private clampCapacity(type: string, capacityKg?: number) {
    const max = VEHICLE_SPECS[type as VehicleType].maxWeightKg;
    if (capacityKg !== undefined && capacityKg > max) throw new BadRequestException(`A ${VEHICLE_SPECS[type as VehicleType].label.toLowerCase()} can be listed for at most ${max} kg.`);
  }

  async create(ownerId: string, dto: CreateVehicleDto): Promise<VehicleView> {
    if ((await this.vehicles.count({ where: { ownerId } })) >= MAX_VEHICLES_PER_PERSON) {
      throw new ConflictException(`You can register up to ${MAX_VEHICLES_PER_PERSON} vehicles.`);
    }
    const plate = normalisePlate(dto.plate ?? '');
    await this.assertPlateFree(plate);
    this.clampCapacity(dto.type, dto.capacityKg);
    await this.uploads.assertOwned(ownerId, dto.photos ?? []);
    const hasActive = await this.vehicles.exists({ where: { ownerId, isActive: true } });
    const v = await this.vehicles.save(this.vehicles.create({
      ownerId, type: dto.type, fleet: VEHICLE_SPECS[dto.type as VehicleType].fleet, plate,
      make: dto.make ?? '', model: dto.model ?? '', color: dto.color ?? '', year: dto.year ?? null,
      capacityKg: dto.capacityKg ?? null, photos: dto.photos ?? [], status: 'PENDING', reviewNote: null, isActive: !hasActive,
    }));
    if (!hasActive) await this.syncUser(ownerId, v);
    return toVehicleView(v);
  }

  /**
   * Editing the plate puts an approved vehicle back in the queue, because the approval was for that plate. If it
   * was the active vehicle, its driver goes offline until it is approved again.
   */
  async update(ownerId: string, id: string, dto: UpdateVehicleDto): Promise<VehicleView> {
    const v = await this.mine(ownerId, id);
    this.clampCapacity(v.type, dto.capacityKg);
    if (dto.photos) await this.uploads.assertOwned(ownerId, dto.photos);
    let plateChanged = false;
    if (dto.plate !== undefined) {
      const plate = normalisePlate(dto.plate);
      if (plate !== v.plate) { await this.assertPlateFree(plate, v.id); v.plate = plate; plateChanged = true; }
    }
    for (const k of ['make', 'model', 'color', 'year', 'capacityKg', 'photos'] as const) {
      if (dto[k] !== undefined) (v as unknown as Record<string, unknown>)[k] = dto[k];
    }
    if (plateChanged || v.status === 'REJECTED') {
      v.status = 'PENDING';
      v.reviewNote = null;
      if (v.isActive) await this.users.update({ id: ownerId }, { online: false });
    }
    return toVehicleView(await this.vehicles.save(v));
  }

  async remove(ownerId: string, id: string): Promise<void> {
    const v = await this.mine(ownerId, id);
    const owner = await this.users.findOneByOrFail({ id: ownerId });
    if (v.isActive && owner.online) throw new ConflictException('Go offline before removing your active vehicle.');
    await this.vehicles.delete({ id });
    if (v.isActive) {
      const next = await this.vehicles.findOne({ where: { ownerId, status: 'APPROVED' }, order: { createdAt: 'ASC' } });
      if (next) { next.isActive = true; await this.vehicles.save(next); }
      await this.syncUser(ownerId, next);
    }
  }

  /** Makes an approved vehicle the one in use. Jobs and trips are matched to it. */
  async activate(ownerId: string, id: string): Promise<VehicleView> {
    const v = await this.mine(ownerId, id);
    if (v.status !== 'APPROVED') throw new ConflictException('This vehicle has not been approved yet.');
    const owner = await this.users.findOneByOrFail({ id: ownerId });
    if (owner.online && !v.isActive) throw new ConflictException('Go offline before switching vehicles.');
    await this.db.transaction(async (m) => {
      await m.update(Vehicle, { ownerId }, { isActive: false });
      await m.update(Vehicle, { id }, { isActive: true });
    });
    v.isActive = true;
    await this.syncUser(ownerId, v);
    return toVehicleView(v);
  }

  /** The user row carries the active vehicle's type and fleet so lists and matching do not need a join. */
  private async syncUser(ownerId: string, v: Vehicle | null) {
    await this.users.update({ id: ownerId }, { vehicle: v?.type ?? null, fleet: v?.fleet ?? null });
  }

  /** The vehicle a driver is using now (shown to customers so they can recognise it). */
  async activeOf(ownerId: string): Promise<VehicleView | null> {
    const v = await this.vehicles.findOne({ where: { ownerId, isActive: true } });
    return v ? toVehicleView(v) : null;
  }

  /** A driver may go online only with an approved vehicle in use. */
  hasApprovedActive(ownerId: string): Promise<boolean> {
    return this.vehicles.exists({ where: { ownerId, isActive: true, status: 'APPROVED' } });
  }

  // ---- Admin -------------------------------------------------------------------------------------

  async queue(status: string = 'PENDING'): Promise<Array<VehicleView & { ownerId: string; ownerName: string }>> {
    const rows = await this.vehicles.find({ where: { status: status as Vehicle['status'] }, order: { createdAt: 'ASC' }, take: 100 });
    const owners = rows.length ? await this.users.createQueryBuilder('u').where('u.id IN (:...ids)', { ids: [...new Set(rows.map((r) => r.ownerId))] }).getMany() : [];
    const name = new Map(owners.map((o) => [o.id, o.name]));
    return rows.map((v) => ({ ...toVehicleView(v), ownerId: v.ownerId, ownerName: name.get(v.ownerId) ?? '' }));
  }

  async approve(id: string): Promise<VehicleView> {
    const v = await this.vehicles.findOne({ where: { id } });
    if (!v) throw new NotFoundException('Vehicle not found.');
    if (v.type !== 'BICYCLE' && !v.plate) throw new BadRequestException('This vehicle has no plate number yet.');
    v.status = 'APPROVED';
    v.reviewNote = null;
    await this.vehicles.save(v);
    if (!(await this.vehicles.exists({ where: { ownerId: v.ownerId, isActive: true } }))) {
      v.isActive = true;
      await this.vehicles.save(v);
      await this.syncUser(v.ownerId, v);
    }
    return toVehicleView(v);
  }

  async reject(id: string, note: string): Promise<VehicleView> {
    const v = await this.vehicles.findOne({ where: { id } });
    if (!v) throw new NotFoundException('Vehicle not found.');
    v.status = 'REJECTED';
    v.reviewNote = note.slice(0, 200);
    await this.vehicles.save(v);
    if (v.isActive) await this.users.update({ id: v.ownerId }, { online: false });
    return toVehicleView(v);
  }

  /** Approving a driver approves their waiting vehicles that have the details needed (a plate, unless a bicycle). */
  async approvePendingFor(ownerId: string): Promise<void> {
    const pending = await this.vehicles.find({ where: { ownerId, status: 'PENDING' } });
    for (const v of pending) if (v.type === 'BICYCLE' || v.plate) await this.approve(v.id);
  }
}
