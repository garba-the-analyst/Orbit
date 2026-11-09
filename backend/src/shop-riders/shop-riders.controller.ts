import {
  BadRequestException, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Body,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, Length } from 'class-validator';
import { In, Repository } from 'typeorm';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { AccountStatus, Role } from '../common/enums';
import { normalisePhone } from '../common/phone';
import { config } from '../config/config';
import { NotificationsService } from '../notifications/notifications.service';
import { Shop } from '../shops/shop.entity';
import { User } from '../users/user.entity';
import { ShopRider } from './shop-rider.entity';

const MAX_RIDERS_PER_SHOP = 20;

class InviteRiderDto {
  @ApiProperty({ description: 'The rider’s ORBIT email address or phone number' })
  @IsString() @Length(5, 254)
  identifier: string;
}

@ApiTags('shop riders')
@ApiBearerAuth()
@Roles(Role.MERCHANT)
@Controller('merchant/riders')
export class MerchantRidersController {
  constructor(
    @InjectRepository(ShopRider) private readonly links: Repository<ShopRider>,
    @InjectRepository(Shop) private readonly shops: Repository<Shop>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly notifications: NotificationsService,
  ) {}

  private async myShop(ownerId: string): Promise<Shop> {
    const shop = await this.shops.findOne({ where: { ownerId } });
    if (!shop) throw new NotFoundException('You have no shop yet.');
    return shop;
  }

  @ApiOperation({ summary: 'Your own riders and pending invitations' })
  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const shop = await this.myShop(user.id);
    const links = await this.links.find({ where: { shopId: shop.id }, order: { createdAt: 'ASC' } });
    const riders = links.length ? await this.users.find({ where: { id: In(links.map((l) => l.riderId)) } }) : [];
    const byId = new Map(riders.map((r) => [r.id, r]));
    return links.map((l) => {
      const r = byId.get(l.riderId);
      return {
        id: l.id,
        status: l.status,
        riderId: l.riderId,
        name: r?.name ?? 'Unknown',
        phone: l.status === 'ACTIVE' ? (r?.phone ?? null) : null,
        vehicle: r?.vehicle ?? null,
        avatarUrl: r?.avatarUrl ?? null,
        online: l.status === 'ACTIVE' ? !!r?.online : false,
      };
    });
  }

  @Throttle({ default: { limit: config.isTest ? 100_000 : 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Invite an approved rider (by email or phone) to be one of your own riders' })
  @Post()
  async invite(@CurrentUser() user: AuthUser, @Body() dto: InviteRiderDto) {
    const shop = await this.myShop(user.id);
    const id = dto.identifier.trim();
    const phone = id.includes('@') ? null : normalisePhone(id);
    const lookup = id.includes('@') ? { email: id.toLowerCase() } : phone ? { phone } : null;
    const rider = lookup ? await this.users.findOne({ where: { ...lookup, role: Role.RIDER, status: AccountStatus.ACTIVE } }) : null;
    // One message for "no such person" and "not an approved rider", so this cannot be used to probe accounts.
    if (!rider) {
      throw new NotFoundException('We found no approved ORBIT rider with that email or phone number.');
    }
    if (await this.links.exists({ where: { shopId: shop.id, riderId: rider.id } })) {
      throw new ConflictException('That rider is already on your list.');
    }
    if ((await this.links.count({ where: { shopId: shop.id } })) >= MAX_RIDERS_PER_SHOP) {
      throw new BadRequestException(`You can have up to ${MAX_RIDERS_PER_SHOP} riders. Remove one first.`);
    }
    const link = await this.links.save(this.links.create({ shopId: shop.id, riderId: rider.id, status: 'INVITED' }));
    await this.notifications.push([
      { userId: rider.id, type: 'rider.invited', title: `${shop.name} invited you`, body: 'Accept to deliver this shop’s orders directly for them.', data: { linkId: link.id } },
    ]);
    return { id: link.id, status: link.status, riderId: rider.id, name: rider.name };
  }

  @HttpCode(200)
  @ApiOperation({ summary: 'Remove a rider or cancel an invitation' })
  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const shop = await this.myShop(user.id);
    await this.links.delete({ id, shopId: shop.id });
    return { ok: true };
  }
}

@ApiTags('shop riders')
@ApiBearerAuth()
@Roles(Role.RIDER)
@Controller('rider/shops')
export class RiderShopsController {
  constructor(
    @InjectRepository(ShopRider) private readonly links: Repository<ShopRider>,
    @InjectRepository(Shop) private readonly shops: Repository<Shop>,
    private readonly notifications: NotificationsService,
  ) {}

  @ApiOperation({ summary: 'Shops that invited you or that you ride for' })
  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const links = await this.links.find({ where: { riderId: user.id }, order: { createdAt: 'DESC' } });
    const shops = links.length ? await this.shops.find({ where: { id: In(links.map((l) => l.shopId)) } }) : [];
    const byId = new Map(shops.map((s) => [s.id, s]));
    return links.map((l) => ({
      id: l.id,
      status: l.status,
      shop: { id: l.shopId, name: byId.get(l.shopId)?.name ?? 'Shop', address: byId.get(l.shopId)?.address ?? '', city: byId.get(l.shopId)?.city ?? '' },
    }));
  }

  @HttpCode(200)
  @ApiOperation({ summary: 'Accept an invitation' })
  @Post(':id/accept')
  async accept(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const res = await this.links.update({ id, riderId: user.id, status: 'INVITED' }, { status: 'ACTIVE' });
    if (!res.affected) throw new NotFoundException('Invitation not found.');
    const link = await this.links.findOneByOrFail({ id });
    const shop = await this.shops.findOne({ where: { id: link.shopId } });
    await this.notifications.push([
      { userId: shop?.ownerId, type: 'rider.joined', title: `${user.name} accepted`, body: 'They can now be assigned your deliveries.', data: {} },
    ]);
    return { ok: true };
  }

  @HttpCode(200)
  @ApiOperation({ summary: 'Decline an invitation or stop riding for a shop' })
  @Delete(':id')
  async leave(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.links.delete({ id, riderId: user.id });
    return { ok: true };
  }
}
