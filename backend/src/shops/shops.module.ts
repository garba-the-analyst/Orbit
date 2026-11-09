import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../products/product.entity';
import { ProductsController } from '../products/products.controller';
import { ProductsService } from '../products/products.service';
import { UploadsModule } from '../uploads/uploads.module';
import { ShopsController } from './shops.controller';
import { ShopsService } from './shops.service';
import { Shop } from './shop.entity';

/** Shops (discovery + merchant settings) and the merchant catalogue live together: they share one aggregate. */
@Module({
  imports: [TypeOrmModule.forFeature([Shop, Product]), UploadsModule],
  controllers: [ShopsController, ProductsController],
  providers: [ShopsService, ProductsService],
  exports: [ShopsService],
})
export class ShopsModule {}
