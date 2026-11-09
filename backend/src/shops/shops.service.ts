/**
 * Shop discovery for customers and shop management for merchants.
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, In, Raw, Repository } from 'typeorm';
import { ShopStatus } from '../common/enums';
import { findProhibitedTerm } from '../common/prohibited-goods.policy';
import { config } from '../config/config';
import { haversineM, marketAt } from '../common/markets';
import { UploadsService } from '../uploads/uploads.service';
import { Product } from '../products/product.entity';
import { ProductView, toProductView } from '../products/products.service';
import { ListShopsQuery, UpdateShopDto } from './shops.dto';
import { Shop } from './shop.entity';

/**
 * Case-insensitive "contains" match that works on SQLite and PostgreSQL alike.
 * LIKE wildcards in the search text are escaped, so a search for "50%" means the literal text "50%".
 */
const contains = (text: string) =>
  Raw((alias) => `LOWER(${alias}) LIKE :pattern ESCAPE '\\'`, {
    pattern: `%${text.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`,
  });

export interface ShopView {
  id: string;
  name: string;
  description: string;
  category: string;
  address: string;
  color: string;
  isOpen: boolean;
  prepMinutes: number;
  offersDelivery: boolean;
  deliveryFee: number;
  /** Average rating to one decimal place, or null until the first review. */
  rating: number | null;
  ratingCount: number;
  status: string;
  country: string;
  currency: string;
  city: string;
  state: string;
  lat: number | null;
  lng: number | null;
  logoUrl: string | null;
  coverUrl: string | null;
  phone: string;
  openingHours: string;
  /** Straight-line distance from the searcher, when they shared their location. */
  distanceKm: number | null;
}

export function toShopView(shop: Shop, distanceKm: number | null = null): ShopView {
  return {
    id: shop.id,
    name: shop.name,
    description: shop.description,
    category: shop.category,
    address: shop.address,
    color: shop.color,
    isOpen: shop.isOpen,
    prepMinutes: shop.prepMinutes,
    offersDelivery: shop.offersDelivery,
    deliveryFee: shop.deliveryFee,
    rating: shop.ratingCount > 0 ? Math.round((shop.ratingSum / shop.ratingCount) * 10) / 10 : null,
    ratingCount: shop.ratingCount,
    status: shop.status,
    country: shop.country,
    currency: shop.currency,
    city: shop.city,
    state: shop.state,
    lat: shop.lat,
    lng: shop.lng,
    logoUrl: shop.logoUrl,
    coverUrl: shop.coverUrl,
    phone: shop.phone,
    openingHours: shop.openingHours,
    distanceKm: distanceKm === null ? null : Math.round(distanceKm * 10) / 10,
  };
}

@Injectable()
export class ShopsService {
  constructor(
    @InjectRepository(Shop) private readonly shops: Repository<Shop>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    private readonly uploads: UploadsService,
  ) {}

  /**
   * Approved shops. Filters: category, search term (shop, category or product name), city, country, open now.
   * With the searcher's location, only shops within radiusKm (default 25) are returned, nearest first.
   *
   * Scale note: distance is computed in the application after a bounding-box prefilter in SQL. That is fine for
   * thousands of shops per search area. Past that, move this to PostGIS (ST_DWithin on an indexed geography column).
   */
  async listPublic(opts: ListShopsQuery): Promise<{ items: ShopView[]; total: number }> {
    if ((opts.lat === undefined) !== (opts.lng === undefined)) {
      throw new BadRequestException('Send lat and lng together.');
    }
    const here = opts.lat !== undefined && opts.lng !== undefined ? { lat: opts.lat, lng: opts.lng } : null;
    const radiusKm = opts.radiusKm ?? 25;
    const q = opts.q?.trim();

    const base: FindOptionsWhere<Shop> = { status: ShopStatus.APPROVED };
    if (opts.category) base.category = opts.category;
    if (opts.country) base.country = opts.country;
    if (opts.openNow) base.isOpen = true;
    if (opts.city) {
      base.city = Raw((a) => `LOWER(${a}) = :cityName`, { cityName: opts.city!.toLowerCase() });
    }
    if (here) {
      // One degree of latitude is about 111 km; longitude shrinks with the cosine of the latitude.
      const dLat = radiusKm / 111;
      const dLng = radiusKm / (111 * Math.max(0.2, Math.cos((here.lat * Math.PI) / 180)));
      base.lat = Between(here.lat - dLat, here.lat + dLat);
      base.lng = Between(here.lng - dLng, here.lng + dLng);
    }

    let shops: Shop[];
    if (!q) {
      shops = await this.shops.find({ where: base });
    } else {
      const match = contains(q.slice(0, 60));
      const productHits = await this.products.find({
        where: { name: match, available: true },
        select: { shopId: true },
        take: 500,
      });
      const productShopIds = [...new Set(productHits.map((p) => p.shopId))];
      const where: FindOptionsWhere<Shop>[] = [
        { ...base, name: match },
        { ...base, category: match },
      ];
      if (productShopIds.length) where.push({ ...base, id: In(productShopIds) });
      shops = await this.shops.find({ where });
    }

    let rows = shops.map((shop) => ({
      shop,
      km: here && shop.lat !== null && shop.lng !== null ? haversineM(here, { lat: shop.lat, lng: shop.lng }) / 1000 : null,
    }));
    if (here) rows = rows.filter((r) => r.km !== null && r.km <= radiusKm);

    const sort = opts.sort ?? (here ? 'distance' : 'name');
    rows.sort((a, b) => {
      if (a.shop.isOpen !== b.shop.isOpen) return Number(b.shop.isOpen) - Number(a.shop.isOpen); // open shops first
      if (sort === 'distance' && a.km !== null && b.km !== null && a.km !== b.km) return a.km - b.km;
      if (sort === 'rating') {
        const ra = a.shop.ratingCount ? a.shop.ratingSum / a.shop.ratingCount : 0;
        const rb = b.shop.ratingCount ? b.shop.ratingSum / b.shop.ratingCount : 0;
        if (ra !== rb) return rb - ra;
      }
      return a.shop.name.localeCompare(b.shop.name);
    });

    const offset = opts.offset ?? 0;
    const limit = opts.limit ?? 40;
    return { total: rows.length, items: rows.slice(offset, offset + limit).map((r) => toShopView(r.shop, r.km)) };
  }

  /** Cities that have approved shops, so people can browse by place. */
  async cities(): Promise<Array<{ country: string; city: string; shops: number }>> {
    const rows = await this.shops
      .createQueryBuilder('s')
      .select('s.country', 'country')
      .addSelect('s.city', 'city')
      .addSelect('COUNT(*)', 'shops')
      .where('s.status = :status', { status: ShopStatus.APPROVED })
      .andWhere("s.city <> ''")
      .groupBy('s.country')
      .addGroupBy('s.city')
      .getRawMany<{ country: string; city: string; shops: string | number }>();
    return rows
      .map((r) => ({ country: r.country, city: r.city, shops: Number(r.shops) }))
      .sort((a, b) => b.shops - a.shops || a.city.localeCompare(b.city));
  }

  /** One approved shop with its available catalogue. */
  async getPublic(id: string): Promise<{ shop: ShopView; products: ProductView[] }> {
    const shop = await this.shops.findOne({ where: { id, status: ShopStatus.APPROVED } });
    if (!shop) throw new NotFoundException('Shop not found.');
    const products = await this.products.find({
      where: { shopId: id, available: true },
      order: { name: 'ASC' },
    });
    return { shop: toShopView(shop), products: products.map(toProductView) };
  }

  // ---- Merchant side -------------------------------------------------------------------------------

  async getOwned(ownerId: string): Promise<Shop> {
    const shop = await this.shops.findOne({ where: { ownerId } });
    if (!shop) throw new NotFoundException('You do not have a shop yet.');
    return shop;
  }

  async updateOwned(ownerId: string, dto: UpdateShopDto): Promise<ShopView> {
    const shop = await this.getOwned(ownerId);
    const banned = findProhibitedTerm(dto.name, dto.description);
    if (banned) {
      throw new BadRequestException(`"${banned}" is not allowed on ORBIT. See the prohibited goods policy.`);
    }
    if ((dto.lat === undefined) !== (dto.lng === undefined)) {
      throw new BadRequestException('Send the latitude and longitude together.');
    }
    await this.uploads.assertOwned(ownerId, [dto.logoUrl, dto.coverUrl]);

    if (dto.lat !== undefined && dto.lng !== undefined) {
      const market = marketAt({ lat: dto.lat, lng: dto.lng }, config.markets.enabled);
      if (!market) {
        throw new BadRequestException(`That location is outside the countries ORBIT serves (${config.markets.enabled.join(', ')}).`);
      }
      shop.country = market.code;
      shop.currency = market.currency;
    }
    if (dto.offersDelivery === false) dto.deliveryFee = 0;
    Object.assign(shop, dto);
    await this.shops.save(shop);
    return toShopView(shop);
  }
}
