/**
 * Merchant catalogue management. Every query is scoped to the merchant's own shop, so a merchant can
 * never read or change another shop's products even by guessing ids.
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { findProhibitedTerm } from '../common/prohibited-goods.policy';
import { Shop } from '../shops/shop.entity';
import { GOODS_SPECS } from '../common/catalog';
import type { GoodsType } from '../common/enums';
import { thumbOf, UploadsService } from '../uploads/uploads.service';
import { CreateProductDto, UpdateProductDto } from './products.dto';
import { Product } from './product.entity';

export interface ProductView {
  id: string;
  shopId: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  available: boolean;
  soldOut: boolean;
  kind: string;
  goodsType: string;
  /** Handling note and flags for the goods type. */
  goods: { label: string; handling: string; careful: boolean; urgent: boolean };
  images: string[];
  /** Small copy of the cover picture for lists. */
  thumb: string | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  weightKg: number | null;
  unitLabel: string | null;
}

export function toProductView(p: Product): ProductView {
  const spec = GOODS_SPECS[p.goodsType as GoodsType] ?? GOODS_SPECS.GENERAL;
  const images = p.images ?? [];
  return {
    id: p.id,
    shopId: p.shopId,
    name: p.name,
    description: p.description,
    price: p.price,
    stock: p.stock,
    available: p.available,
    // A service has no stock, so it is never "sold out".
    soldOut: p.kind !== 'SERVICE' && p.stock <= 0,
    kind: p.kind,
    goodsType: p.goodsType,
    goods: { label: spec.label, handling: spec.handling, careful: spec.careful, urgent: spec.urgent },
    images,
    thumb: images[0] ? thumbOf(images[0]) : null,
    lengthCm: p.lengthCm,
    widthCm: p.widthCm,
    heightCm: p.heightCm,
    weightKg: p.weightKg,
    unitLabel: p.unitLabel,
  };
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(Shop) private readonly shops: Repository<Shop>,
    private readonly uploads: UploadsService,
  ) {}

  private async shopOf(ownerId: string): Promise<Shop> {
    const shop = await this.shops.findOne({ where: { ownerId } });
    if (!shop) throw new NotFoundException('You do not have a shop yet.');
    return shop;
  }

  private assertAllowed(name?: string, description?: string) {
    const banned = findProhibitedTerm(name, description);
    if (banned) {
      throw new BadRequestException(
        `"${banned}" is a restricted item and cannot be sold on ORBIT. See the prohibited goods policy.`,
      );
    }
  }

  async list(ownerId: string): Promise<ProductView[]> {
    const shop = await this.shopOf(ownerId);
    const rows = await this.products.find({ where: { shopId: shop.id }, order: { name: 'ASC' } });
    return rows.map(toProductView);
  }

  async create(ownerId: string, dto: CreateProductDto): Promise<ProductView> {
    const shop = await this.shopOf(ownerId);
    this.assertAllowed(dto.name, dto.description);
    await this.uploads.assertOwned(ownerId, dto.images ?? []);
    const kind = dto.kind ?? 'GOOD';
    if (kind === 'GOOD' && dto.stock === undefined) {
      throw new BadRequestException('Say how many you have in stock.');
    }
    const product = await this.products.save(
      this.products.create({
        shopId: shop.id,
        name: dto.name,
        description: dto.description ?? '',
        price: dto.price,
        stock: kind === 'SERVICE' ? 0 : (dto.stock ?? 0),
        available: dto.available ?? true,
        kind,
        goodsType: dto.goodsType ?? 'GENERAL',
        images: dto.images ?? [],
        lengthCm: dto.lengthCm ?? null,
        widthCm: dto.widthCm ?? null,
        heightCm: dto.heightCm ?? null,
        weightKg: dto.weightKg ?? null,
        unitLabel: dto.unitLabel || null,
      }),
    );
    return toProductView(product);
  }

  async update(ownerId: string, id: string, dto: UpdateProductDto): Promise<ProductView> {
    const shop = await this.shopOf(ownerId);
    const product = await this.products.findOne({ where: { id, shopId: shop.id } });
    if (!product) throw new NotFoundException('Product not found.');
    this.assertAllowed(dto.name, dto.description);
    if (dto.images) await this.uploads.assertOwned(ownerId, dto.images);
    Object.assign(product, dto);
    if (dto.unitLabel !== undefined) product.unitLabel = dto.unitLabel || null;
    if (product.kind === 'SERVICE') product.stock = 0;
    return toProductView(await this.products.save(product));
  }

  async remove(ownerId: string, id: string): Promise<void> {
    const shop = await this.shopOf(ownerId);
    const result = await this.products.delete({ id, shopId: shop.id });
    if (!result.affected) throw new NotFoundException('Product not found.');
  }
}
