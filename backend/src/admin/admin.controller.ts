import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { Role } from '../common/enums';
import { AdminService } from './admin.service';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @ApiOperation({ summary: 'Merchants and riders waiting for verification' })
  @Get('queue')
  queue() {
    return this.admin.queue();
  }

  @HttpCode(200)
  @ApiOperation({ summary: 'Approve a pending merchant or rider' })
  @Post('users/:id/approve')
  async approve(@Param('id', ParseUUIDPipe) id: string) {
    await this.admin.approve(id);
    return { ok: true };
  }

  @HttpCode(200)
  @ApiOperation({ summary: 'Suspend an account. Takes effect immediately.' })
  @Post('users/:id/suspend')
  async suspend(@Param('id', ParseUUIDPipe) id: string) {
    await this.admin.suspend(id);
    return { ok: true };
  }

  @ApiOperation({ summary: 'Recent orders across the platform' })
  @Get('orders')
  orders(@CurrentUser() user: AuthUser) {
    return this.admin.recentOrders(user.id);
  }

  @HttpCode(200)
  @ApiOperation({ summary: 'Unlock delivery-PIN entry after support verified the customer' })
  @Post('orders/:id/unlock-pin')
  async unlock(@Param('id', ParseUUIDPipe) id: string) {
    await this.admin.unlockPin(id);
    return { ok: true };
  }

  @ApiOperation({ summary: 'Marketplace, logistics and financial KPIs (proposal section 12)' })
  @Get('kpis')
  kpis() {
    return this.admin.kpis();
  }
}
