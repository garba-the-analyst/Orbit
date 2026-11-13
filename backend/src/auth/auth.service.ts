/**
 * Registration and login.
 *
 * Security notes:
 * - Passwords are hashed with bcrypt (cost 10); the hash never leaves the server.
 * - Login uses one generic error for "no such user" and "wrong password" and always runs a hash
 *   comparison, so neither the message nor the response time reveals whether an email exists.
 * - Five wrong passwords lock the account for 15 minutes.
 * - Merchants and riders are created as PENDING and must be approved by an admin before they can operate.
 */
import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { VEHICLE_SPECS } from '../common/catalog';
import type { VehicleType } from '../common/enums';
import { Vehicle } from '../vehicles/vehicle.entity';
import { normalisePlate } from '../vehicles/vehicles.service';
import { DataSource, Repository } from 'typeorm';
import { AccountStatus, Role, ShopStatus } from '../common/enums';
import { config } from '../config/config';
import { RealtimeService } from '../realtime/realtime.service';
import { Shop } from '../shops/shop.entity';
import { User } from '../users/user.entity';
import { PublicUser, UsersService } from '../users/users.service';
import { LEGAL_VERSION } from '../legal/legal.content';
import { LoginDto, RegisterDto } from './auth.dto';

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const BCRYPT_COST = 10;
/** A valid hash of a random string, compared against when the email is unknown (timing equalisation). */
const DUMMY_HASH = bcrypt.hashSync('orbit-timing-equaliser', BCRYPT_COST);

export interface AuthResult {
  token: string;
  user: PublicUser;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectDataSource() private readonly db: DataSource,
    private readonly jwt: JwtService,
    private readonly usersService: UsersService,
    private readonly realtime: RealtimeService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    // The superadmin address is reserved so nobody can register it before the startup bootstrap creates the account.
    if (config.superAdmin.email && dto.email === config.superAdmin.email) {
      throw new ConflictException('An account with this email already exists. Sign in instead.');
    }
    const existing = await this.users.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException('An account with this email already exists. Sign in instead.');

    if (config.consent.required && dto.acceptTerms !== true) {
      throw new BadRequestException('Please accept the Terms and Privacy Notice to create an account.');
    }
    const needsVerification = dto.role === Role.MERCHANT || dto.role === Role.RIDER;
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);

    const user = await this.db.transaction(async (manager) => {
      const created = await manager.save(
        manager.create(User, {
          email: dto.email,
          phone: dto.phone,
          name: dto.name,
          username: dto.username ?? null,
          passwordHash,
          role: dto.role,
          status: needsVerification ? AccountStatus.PENDING : AccountStatus.ACTIVE,
          vehicle: dto.role === Role.RIDER ? (dto.vehicle ?? null) : null,
          fleet: dto.role === Role.RIDER && dto.vehicle ? VEHICLE_SPECS[dto.vehicle as VehicleType].fleet : null,
          online: false,
          termsAcceptedAt: dto.acceptTerms ? new Date() : null,
          termsVersion: dto.acceptTerms ? LEGAL_VERSION : null,
        }),
      );

      // A driver's first vehicle is registered with the account and reviewed together with it.
      if (dto.role === Role.RIDER && dto.vehicle) {
        await manager.save(
          manager.create(Vehicle, {
            ownerId: created.id, type: dto.vehicle, fleet: VEHICLE_SPECS[dto.vehicle as VehicleType].fleet,
            plate: normalisePlate(dto.plate ?? ''), model: dto.vehicleModel ?? '', color: dto.vehicleColor ?? '',
            status: 'PENDING', isActive: true,
          }),
        );
      }

      if (dto.role === Role.MERCHANT) {
        await manager.save(
          manager.create(Shop, {
            ownerId: created.id,
            name: dto.shopName!,
            category: dto.shopCategory!,
            address: dto.shopAddress!,
            description: '',
            status: ShopStatus.PENDING,
            isOpen: false,
          }),
        );
      }
      return created;
    });

    if (needsVerification) this.realtime.adminChanged();
    return this.issue(user);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.users.findOne({ where: { email: dto.email } });

    if (user?.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new HttpException(
        'Too many failed attempts. Try again in a few minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const ok = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
      if (user) {
        user.failedLogins += 1;
        if (user.failedLogins >= MAX_FAILED_LOGINS) {
          user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
          user.failedLogins = 0;
        }
        await this.users.save(user);
      }
      throw new UnauthorizedException('Email or password is incorrect.');
    }
    if (user.status === AccountStatus.SUSPENDED) {
      throw new UnauthorizedException('This account has been suspended. Contact ORBIT support.');
    }

    if (user.failedLogins > 0 || user.lockedUntil) {
      user.failedLogins = 0;
      user.lockedUntil = null;
      await this.users.save(user);
    }
    return this.issue(user);
  }

  /** Change your own password. Signs out every other device and returns a fresh token for this one. */
  async changePassword(userId: string, current: string, next: string): Promise<AuthResult> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('This account is not available.');
    if (!(await bcrypt.compare(current, user.passwordHash))) {
      throw new BadRequestException('Your current password is not right.');
    }
    if (current === next) throw new BadRequestException('Choose a password you have not used just now.');
    user.passwordHash = await bcrypt.hash(next, BCRYPT_COST);
    user.mustChangePassword = false;
    user.passwordChangedAt = new Date();
    await this.users.save(user);
    return this.issue(user);
  }

  private async issue(user: User): Promise<AuthResult> {
    // pv is the password version: it changes with every password change or reset, which ends older sessions
    // exactly (a timestamp comparison in whole seconds would miss a token issued in the same second).
    const token = await this.jwt.signAsync({ sub: user.id, role: user.role, pv: user.passwordChangedAt?.getTime() ?? 0 });
    return { token, user: await this.usersService.toPublic(user) };
  }
}
