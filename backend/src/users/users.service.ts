import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Shop } from '../shops/shop.entity';
import { UploadsService } from '../uploads/uploads.service';
import { User } from './user.entity';

/** What the API reveals about a user: never the password hash or lockout internals. */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  username: string | null;
  role: string;
  status: string;
  vehicle: string | null;
  fleet: string | null;
  country: string;
  online: boolean;
  avatarUrl: string | null;
  isSuperAdmin: boolean;
  mustChangePassword: boolean;
  /** Merchants only: a summary of their shop. */
  shop: { id: string; name: string; status: string } | null;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Shop) private readonly shops: Repository<Shop>,
    private readonly uploads: UploadsService,
  ) {}

  async getOrFail(id: string): Promise<User> {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  /** Builds the safe public representation of a user. */
  async toPublic(user: User): Promise<PublicUser> {
    const shop =
      user.role === 'MERCHANT' ? await this.shops.findOne({ where: { ownerId: user.id } }) : null;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      username: user.username,
      role: user.role,
      status: user.status,
      vehicle: user.vehicle,
      fleet: user.fleet,
      country: user.country,
      online: user.online,
      avatarUrl: user.avatarUrl,
      isSuperAdmin: user.isSuperAdmin,
      mustChangePassword: user.mustChangePassword,
      shop: shop ? { id: shop.id, name: shop.name, status: shop.status } : null,
    };
  }

  async updateProfile(
    userId: string,
    patch: { name?: string; phone?: string; username?: string; avatarUrl?: string | null },
  ): Promise<PublicUser> {
    const user = await this.getOrFail(userId);
    if (patch.avatarUrl) await this.uploads.assertOwned(userId, [patch.avatarUrl]);
    if (patch.name !== undefined) user.name = patch.name;
    if (patch.phone !== undefined) user.phone = patch.phone;
    if (patch.username !== undefined) {
      const taken = await this.users.findOne({ where: { username: patch.username } });
      if (taken && taken.id !== userId) throw new ConflictException('That username is already taken.');
      user.username = patch.username || null;
    }
    if (patch.avatarUrl !== undefined) user.avatarUrl = patch.avatarUrl || null;
    await this.users.save(user);
    return this.toPublic(user);
  }
}
