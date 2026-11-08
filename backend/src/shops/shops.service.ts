/**
 * Shop discovery for customers and shop management for merchants.
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Raw, Repository } from 'typeorm';
import { ShopStatus } from '../common/enums';
import { findProhibitedTerm } from '../common/prohibited-goods.policy';
import { Product } from '../products/product.entity';
import { ProductView, toProductView } from '../products/products.service';
import { UpdateShopDto } from './shops.dto';
import { Shop } from './shop.entity';

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
}

export function toShopView(shop: Shop): ShopView {
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
  };
}

/**
 * A case-insensitive "contains" match that behaves the same on SQLite and PostgreSQL.
 * (PostgreSQL's LIKE is case-sensitive and SQLite's only ignores case for plain ASCII, so we lower-case both
 * sides, and we name the escape character explicitly so a search for "50%" matches a literal percent sign
 * instead of everything.)
 */
const contains = (q: string) =>
  Raw((alias) => `LOWER(${alias}) LIKE :pattern ESCAPE '\\'`, {
    pattern: `%${q.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`,
  });

@Injectable()
export class ShopsService {
  constructor(
    @InjectRepository(Shop) private readonly shops: Repository<Shop>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
  ) {}

  /** Approved shops, optionally filtered by category and a search term (shop, category or product name). */
  async listPublic(opts: { q?: string; category?: string }): Promise<ShopView[]> {
    const base = { status: ShopStatus.APPROVED, ...(opts.category ? { category: opts.category } : {}) };
    const q = opts.q?.trim();

    let shops: Shop[];
    if (!q) {
      shops = await this.shops.find({ where: base, order: { name: 'ASC' } });
    } else {
      const match = contains(q.slice(0, 60));
      const byName = await this.shops.find({
        where: [
          { ...base, name: match },
          { ...base, category: match },
        ],
      });
      const productHits = await this.products.find({
        where: { name: match, available: true },
        select: { shopId: true },
      });
      const extraIds = [...new Set(productHits.map((p) => p.shopId))].filter(
        (id) => !byName.some((s) => s.id === id),
      );
      const byProduct = extraIds.length ? await this.shops.find({ where: { ...base, id: In(extraIds) } }) : [];
      shops = [...byName, ...byProduct].sort((a, b) => a.name.localeCompare(b.name));
    }

    // Open shops first, then alphabetical.
    return shops.sort((a, b) => Number(b.isOpen) - Number(a.isOpen)).map(toShopView);
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
    if (dto.offersDelivery === false) dto.deliveryFee = 0;
    Object.assign(shop, dto);
    await this.shops.save(shop);
    return toShopView(shop);
  }
}
