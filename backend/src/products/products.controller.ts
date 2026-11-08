import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { Role } from '../common/enums';
import { CreateProductDto, UpdateProductDto } from './products.dto';
import { ProductsService } from './products.service';

@ApiTags('merchant catalogue')
@ApiBearerAuth()
@Roles(Role.MERCHANT)
@Controller('merchant/products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @ApiOperation({ summary: 'List every product in your shop, including hidden ones' })
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.products.list(user.id);
  }

  @ApiOperation({ summary: 'Add a product' })
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProductDto) {
    return this.products.create(user.id, dto);
  }

  @ApiOperation({ summary: 'Edit price, stock, availability or details' })
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(user.id, id, dto);
  }

  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a product' })
  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.products.remove(user.id, id);
  }
}
