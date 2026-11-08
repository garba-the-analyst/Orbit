/**
 * Merchant catalogue management. Every query is scoped to the merchant's own shop, so a merchant can
 * never read or change another shop's products even by guessing ids.
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { findProhibitedTerm } from '../common/prohibited-goods.policy';
import { Shop } from '../shops/shop.entity';
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
}

export function toProductView(p: Product): ProductView {
  return {
    id: p.id,
    shopId: p.shopId,
    name: p.name,
    description: p.description,
    price: p.price,
    stock: p.stock,
    available: p.available,
    soldOut: p.stock <= 0,
  };
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(Shop) private readonly shops: Repository<Shop>,
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
    const product = await this.products.save(
      this.products.create({
        shopId: shop.id,
        name: dto.name,
        description: dto.description ?? '',
        price: dto.price,
        stock: dto.stock,
        available: dto.available ?? true,
      }),
    );
    return toProductView(product);
  }

  async update(ownerId: string, id: string, dto: UpdateProductDto): Promise<ProductView> {
    const shop = await this.shopOf(ownerId);
    const product = await this.products.findOne({ where: { id, shopId: shop.id } });
    if (!product) throw new NotFoundException('Product not found.');
    this.assertAllowed(dto.name, dto.description);
    Object.assign(product, dto);
    return toProductView(await this.products.save(product));
  }

  async remove(ownerId: string, id: string): Promise<void> {
    const shop = await this.shopOf(ownerId);
    const result = await this.products.delete({ id, shopId: shop.id });
    if (!result.affected) throw new NotFoundException('Product not found.');
  }
}
