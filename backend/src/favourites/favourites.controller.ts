import { BadRequestException, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { In, Repository } from 'typeorm';
import { AuthUser, CurrentUser } from '../common/auth.decorators';
import { ShopStatus } from '../common/enums';
import { Shop } from '../shops/shop.entity';
import { toShopView } from '../shops/shops.service';
import { Favourite } from './favourite.entity';

const MAX_FAVOURITES = 200;

@ApiTags('favourites')
@ApiBearerAuth()
@Controller('favourites')
export class FavouritesController {
  constructor(
    @InjectRepository(Favourite) private readonly favs: Repository<Favourite>,
    @InjectRepository(Shop) private readonly shops: Repository<Shop>,
  ) {}

  @ApiOperation({ summary: 'Your saved shops, most recently saved first' })
  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const rows = await this.favs.find({ where: { userId: user.id }, order: { createdAt: 'DESC' }, take: MAX_FAVOURITES });
    if (rows.length === 0) return [];
    const shops = await this.shops.find({ where: { id: In(rows.map((r) => r.shopId)), status: ShopStatus.APPROVED } });
    const byId = new Map(shops.map((s) => [s.id, s]));
    return rows.map((r) => byId.get(r.shopId)).filter((s): s is Shop => !!s).map((s) => toShopView(s));
  }

  @ApiOperation({ summary: 'Just the ids, so lists can show filled hearts' })
  @Get('ids')
  async ids(@CurrentUser() user: AuthUser) {
    const rows = await this.favs.find({ where: { userId: user.id }, select: { shopId: true }, take: MAX_FAVOURITES });
    return rows.map((r) => r.shopId);
  }

  @HttpCode(200)
  @ApiOperation({ summary: 'Save a shop. Saving twice is harmless.' })
  @Put(':shopId')
  async add(@CurrentUser() user: AuthUser, @Param('shopId', ParseUUIDPipe) shopId: string) {
    if (!(await this.shops.exists({ where: { id: shopId, status: ShopStatus.APPROVED } }))) {
      throw new BadRequestException('That shop is not available.');
    }
    if (await this.favs.exists({ where: { userId: user.id, shopId } })) return { ok: true };
    if ((await this.favs.count({ where: { userId: user.id } })) >= MAX_FAVOURITES) {
      throw new BadRequestException(`You can save up to ${MAX_FAVOURITES} shops. Remove one first.`);
    }
    try {
      await this.favs.save(this.favs.create({ userId: user.id, shopId }));
    } catch {
      /* a simultaneous duplicate hit the unique index: the shop is saved either way */
    }
    return { ok: true };
  }

  @HttpCode(200)
  @ApiOperation({ summary: 'Remove a saved shop' })
  @Delete(':shopId')
  async remove(@CurrentUser() user: AuthUser, @Param('shopId', ParseUUIDPipe) shopId: string) {
    await this.favs.delete({ userId: user.id, shopId });
    return { ok: true };
  }
}
