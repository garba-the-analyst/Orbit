import { Body, Controller, Get, Header, HttpCode, Module, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IsString, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser } from '../common/auth.decorators';
import { config } from '../config/config';
import { LedgerEntry } from '../earnings/ledger-entry.entity';
import { Favourite } from '../favourites/favourite.entity';
import { SavedPlace } from '../geo/place.entity';
import { Notification } from '../notifications/notification.entity';
import { Order } from '../orders/order.entity';
import { Product } from '../products/product.entity';
import { ShopRider } from '../shop-riders/shop-rider.entity';
import { Shop } from '../shops/shop.entity';
import { Trip } from '../trips/trip.entities';
import { Document } from '../uploads/document.entity';
import { UploadsModule } from '../uploads/uploads.module';
import { User } from '../users/user.entity';
import { UsersModule } from '../users/users.module';
import { Vehicle } from '../vehicles/vehicle.entity';
import { AccountService } from './account.service';

class DeleteAccountDto {
  @IsString() @MaxLength(72) password: string;
}

@ApiTags('account')
@ApiBearerAuth()
@Controller('me')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @ApiOperation({ summary: 'Download everything ORBIT holds about you (JSON)' })
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: config.rateLimit.auth, ttl: 60_000 } })
  @Get('export')
  export(@CurrentUser() user: AuthUser) { return this.account.export(user.id); }

  @HttpCode(200)
  @ApiOperation({ summary: 'Delete your account. Needs your password. Refused while an order or trip is in progress.' })
  @Throttle({ default: { limit: config.rateLimit.auth, ttl: 60_000 } })
  @Post('delete')
  async remove(@CurrentUser() user: AuthUser, @Body() dto: DeleteAccountDto) { await this.account.delete(user.id, dto.password); return { ok: true }; }
}

@Module({
  imports: [TypeOrmModule.forFeature([User, Shop, Product, Order, Trip, Vehicle, LedgerEntry, Notification, Favourite, SavedPlace, ShopRider, Document]), UsersModule, UploadsModule],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
