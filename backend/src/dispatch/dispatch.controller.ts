import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { Role } from '../common/enums';
import { PinDto } from '../orders/orders.dto';
import { OrdersService } from '../orders/orders.service';
import { DispatchService } from './dispatch.service';

class AvailabilityDto {
  @IsBoolean()
  online: boolean;
}

@ApiTags('rider')
@ApiBearerAuth()
@Roles(Role.RIDER)
@Controller('rider')
export class DispatchController {
  constructor(
    private readonly dispatch: DispatchService,
    private readonly orders: OrdersService,
  ) {}

  @ApiOperation({ summary: 'Go online or offline' })
  @Put('availability')
  availability(@CurrentUser() user: AuthUser, @Body() dto: AvailabilityDto) {
    return this.dispatch.setOnline(user, dto.online);
  }

  @ApiOperation({ summary: 'Unclaimed courier jobs (customer details hidden until you accept)' })
  @Get('jobs')
  board(@CurrentUser() user: AuthUser) {
    return this.dispatch.board(user);
  }

  @ApiOperation({ summary: 'Your accepted jobs in progress' })
  @Get('active')
  active(@CurrentUser() user: AuthUser) {
    return this.dispatch.active(user);
  }

  @ApiOperation({ summary: 'Your completed deliveries' })
  @Get('history')
  history(@CurrentUser() user: AuthUser) {
    return this.dispatch.history(user);
  }

  @HttpCode(200)
  @ApiOperation({ summary: 'Accept a job. If two riders tap at once, exactly one wins.' })
  @Post('jobs/:id/claim')
  claim(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.claim(user, id);
  }

  @HttpCode(200)
  @ApiOperation({ summary: 'Give a job back before picking it up' })
  @Post('jobs/:id/release')
  release(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.release(user, id);
  }

  @HttpCode(200)
  @ApiOperation({ summary: 'Collect the parcel from the shop (after the shop marks it ready)' })
  @Post('jobs/:id/pickup')
  pickup(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.pickUp(user, id);
  }

  @HttpCode(200)
  @ApiOperation({ summary: 'Complete the delivery with the customer’s 4-digit PIN' })
  @Post('jobs/:id/deliver')
  deliver(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PinDto) {
    return this.orders.complete(user, id, dto.pin);
  }
}
