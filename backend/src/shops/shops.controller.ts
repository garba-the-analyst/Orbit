import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { Role } from '../common/enums';
import { UpdateShopDto } from './shops.dto';
import { ShopsService, toShopView } from './shops.service';

@ApiTags('shops')
@ApiBearerAuth()
@Controller()
export class ShopsController {
  constructor(private readonly shops: ShopsService) {}

  @ApiOperation({ summary: 'Browse approved shops; search by shop, category or product name' })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'category', required: false })
  @Get('shops')
  list(@Query('q') q?: string, @Query('category') category?: string) {
    return this.shops.listPublic({ q, category });
  }

  @ApiOperation({ summary: 'A shop and its available products' })
  @Get('shops/:id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.shops.getPublic(id);
  }

  @Roles(Role.MERCHANT)
  @ApiOperation({ summary: 'Your own shop (merchant)' })
  @Get('merchant/shop')
  async mine(@CurrentUser() user: AuthUser) {
    return toShopView(await this.shops.getOwned(user.id));
  }

  @Roles(Role.MERCHANT)
  @ApiOperation({ summary: 'Update your shop: open/closed, prep time, delivery settings (merchant)' })
  @Patch('merchant/shop')
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateShopDto) {
    return this.shops.updateOwned(user.id, dto);
  }
}
