import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Shop } from '../shops/shop.entity';
import { User } from './user.entity';

/** What the API reveals about a user: never the password hash or lockout internals. */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  vehicle: string | null;
  online: boolean;
  /** Merchants only: a summary of their shop. */
  shop: { id: string; name: string; status: string } | null;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Shop) private readonly shops: Repository<Shop>,
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
      role: user.role,
      status: user.status,
      vehicle: user.vehicle,
      online: user.online,
      shop: shop ? { id: shop.id, name: shop.name, status: shop.status } : null,
    };
  }

  async updateProfile(userId: string, patch: { name?: string; phone?: string }): Promise<PublicUser> {
    const user = await this.getOrFail(userId);
    if (patch.name !== undefined) user.name = patch.name;
    if (patch.phone !== undefined) user.phone = patch.phone;
    await this.users.save(user);
    return this.toPublic(user);
  }
}
