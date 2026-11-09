import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { IsNull, Not, Repository } from 'typeorm';
import { AccountStatus, Role } from '../common/enums';
import { config } from '../config/config';
import { RealtimeService } from '../realtime/realtime.service';
import { User } from '../users/user.entity';

const BCRYPT_COST = 10;

export interface AdminView {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  isSuperAdmin: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
}

export interface AdminList {
  admins: AdminView[];
  /** How many other admins can exist, and how many are used. */
  limit: number;
  used: number;
}

const view = (u: User): AdminView => ({
  id: u.id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  status: u.status,
  isSuperAdmin: u.isSuperAdmin,
  mustChangePassword: u.mustChangePassword,
  createdAt: u.createdAt,
});

/**
 * Creates the superadmin at startup and lets them manage up to `maxAdmins` other admins.
 *
 * The superadmin's credentials come from SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD (environment, never source
 * code). The account is created once; the password in the environment is not re-applied afterwards, so changing
 * it inside the app sticks.
 */
@Injectable()
export class AdminsService implements OnApplicationBootstrap {
  private readonly log = new Logger('Admins');
  /** Creations run one at a time, so two simultaneous requests cannot both take the last slot. */
  private createQueue: Promise<unknown> = Promise.resolve();

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly realtime: RealtimeService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureSuperAdmin();
  }

  async ensureSuperAdmin(): Promise<void> {
    const { email, password, name } = config.superAdmin;
    if (!email || !password) {
      this.log.warn('SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD are not set: there is no superadmin on this server.');
      return;
    }
    const existing = await this.users.findOne({ where: { email } });
    if (existing) {
      if (!existing.isSuperAdmin) {
        // Never promote an account that already exists: its owner might not be who we think.
        this.log.error(`SUPERADMIN_EMAIL ${email} belongs to an ordinary account. It was NOT promoted.`);
      }
      return;
    }
    await this.users.save(
      this.users.create({
        email,
        name,
        phone: '',
        passwordHash: await bcrypt.hash(password, BCRYPT_COST),
        role: Role.ADMIN,
        status: AccountStatus.ACTIVE,
        isSuperAdmin: true,
        mustChangePassword: false,
        online: false,
      }),
    );
    this.log.log(`Superadmin created: ${email}`);
  }

  async list(): Promise<AdminList> {
    const rows = await this.users.find({ where: { role: Role.ADMIN }, order: { createdAt: 'ASC' } });
    return {
      admins: rows.map(view),
      limit: config.maxAdmins,
      used: rows.filter((u) => u.createdById !== null).length,
    };
  }

  create(superAdminId: string, dto: { name: string; email: string; phone: string; password: string }): Promise<AdminView> {
    const run = this.createQueue.then(() => this.createNow(superAdminId, dto));
    this.createQueue = run.catch(() => undefined);
    return run;
  }

  private async createNow(superAdminId: string, dto: { name: string; email: string; phone: string; password: string }): Promise<AdminView> {
    const used = await this.users.count({ where: { role: Role.ADMIN, createdById: Not(IsNull()) } });
    if (used >= config.maxAdmins) {
      throw new ConflictException(`You can create at most ${config.maxAdmins} other admins. Remove one first.`);
    }
    if (await this.users.findOne({ where: { email: dto.email } })) {
      throw new ConflictException('An account with this email already exists.');
    }
    const created = await this.users.save(
      this.users.create({
        email: dto.email,
        name: dto.name,
        phone: dto.phone,
        passwordHash: await bcrypt.hash(dto.password, BCRYPT_COST),
        role: Role.ADMIN,
        status: AccountStatus.ACTIVE,
        isSuperAdmin: false,
        createdById: superAdminId,
        mustChangePassword: true,
        online: false,
      }),
    );
    this.realtime.adminChanged();
    return view(created);
  }

  private async otherAdmin(id: string): Promise<User> {
    const user = await this.users.findOne({ where: { id, role: Role.ADMIN } });
    if (!user) throw new NotFoundException('Admin not found.');
    if (user.isSuperAdmin) throw new BadRequestException('The superadmin account cannot be changed here.');
    return user;
  }

  async setSuspended(id: string, suspended: boolean): Promise<AdminView> {
    const user = await this.otherAdmin(id);
    user.status = suspended ? AccountStatus.SUSPENDED : AccountStatus.ACTIVE;
    await this.users.save(user);
    this.realtime.userUpdated(user.id);
    this.realtime.adminChanged();
    return view(user);
  }

  async resetPassword(id: string, temporaryPassword: string): Promise<AdminView> {
    const user = await this.otherAdmin(id);
    user.passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_COST);
    user.mustChangePassword = true;
    user.passwordChangedAt = new Date(); // signs out their current sessions
    user.failedLogins = 0;
    user.lockedUntil = null;
    await this.users.save(user);
    return view(user);
  }

  /** Admins own no records, so removing one is a plain delete and frees a slot. */
  async remove(id: string): Promise<void> {
    const user = await this.otherAdmin(id);
    await this.users.delete({ id: user.id });
    this.realtime.adminChanged();
  }
}
