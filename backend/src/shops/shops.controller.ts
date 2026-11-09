import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { Role } from '../common/enums';
import { ListShopsQuery, UpdateShopDto } from './shops.dto';
import { ShopsService, toShopView } from './shops.service';

@ApiTags('shops')
@ApiBearerAuth()
@Controller()
export class ShopsController {
  constructor(private readonly shops: ShopsService) {}

  @ApiOperation({
    summary: 'Browse approved shops. Search by shop, category or product; filter by city or distance. Total count is in X-Total-Count.',
  })
  @Get('shops')
  async list(@Query() query: ListShopsQuery, @Res({ passthrough: true }) res: Response) {
    const { items, total } = await this.shops.listPublic(query);
    res.setHeader('X-Total-Count', String(total));
    res.setHeader('Access-Control-Expose-Headers', 'X-Total-Count');
    return items;
  }

  @ApiOperation({ summary: 'Cities that have shops, with counts' })
  @Get('shops/cities')
  cities() {
    return this.shops.cities();
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
