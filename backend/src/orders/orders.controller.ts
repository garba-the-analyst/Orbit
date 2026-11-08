import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { Role } from '../common/enums';
import { AcceptOrderDto, CreateOrderDto, PinDto, RateOrderDto, ReasonDto } from './orders.dto';
import { OrdersService } from './orders.service';

/** Customer-facing order endpoints, plus the shared "order detail" every party uses. */
@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Roles(Role.CUSTOMER)
  @ApiOperation({ summary: 'Place an order. Returns the order and a payment intent to complete.' })
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto) {
    return this.orders.create(user, dto);
  }

  @Roles(Role.CUSTOMER)
  @ApiOperation({ summary: 'Your orders, newest first' })
  @Get()
  mine(@CurrentUser() user: AuthUser) {
    return this.orders.listForCustomer(user.id);
  }

  @ApiOperation({ summary: 'One order. What you see depends on your role (customer, shop, assigned rider, admin).' })
  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.getFor(id, user);
  }

  @Roles(Role.CUSTOMER)
  @HttpCode(200)
  @ApiOperation({ summary: 'Try paying again after a failed payment' })
  @Post(':id/pay')
  retryPayment(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.retryPayment(user, id);
  }

  @Roles(Role.CUSTOMER)
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel before the shop confirms. Paid orders are refunded.' })
  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.orders.cancelByCustomer(user, id, dto.reason);
  }

  @Roles(Role.CUSTOMER)
  @HttpCode(200)
  @ApiOperation({ summary: 'Rate the shop after delivery' })
  @Post(':id/rate')
  rate(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RateOrderDto) {
    return this.orders.rate(user, id, dto);
  }
}

/** Merchant-facing order endpoints. */
@ApiTags('merchant orders')
@ApiBearerAuth()
@Roles(Role.MERCHANT)
@Controller('merchant/orders')
export class MerchantOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @ApiOperation({ summary: 'Orders for your shop (paid orders only), newest first' })
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.orders.listForMerchant(user.id);
  }

  @HttpCode(200)
  @ApiOperation({ summary: 'Accept a new order and set the preparation time' })
  @Post(':id/accept')
  accept(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AcceptOrderDto) {
    return this.orders.accept(user.id, id, dto.prepMinutes);
  }

  @HttpCode(200)
  @ApiOperation({ summary: 'Decline a new order or cancel a confirmed one. The customer is refunded.' })
  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.orders.cancelByMerchant(user.id, id, dto.reason);
  }

  @HttpCode(200)
  @ApiOperation({ summary: 'Mark the order packed and ready' })
  @Post(':id/ready')
  ready(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.markReady(user.id, id);
  }

  @HttpCode(200)
  @ApiOperation({ summary: 'Send out an order you deliver yourself' })
  @Post(':id/dispatch')
  dispatch(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.startOwnDelivery(user.id, id);
  }

  @HttpCode(200)
  @ApiOperation({ summary: 'Hand over (pickup) or complete your own delivery with the customer’s PIN' })
  @Post(':id/complete')
  complete(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PinDto) {
    return this.orders.complete(user, id, dto.pin);
  }
}
