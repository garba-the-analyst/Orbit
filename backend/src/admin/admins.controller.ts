import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles, SuperAdminOnly } from '../common/auth.decorators';
import { Role } from '../common/enums';
import { AdminsService } from './admins.service';
import { CreateAdminDto, ResetAdminPasswordDto } from './admins.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@SuperAdminOnly()
@Controller('admin/admins')
export class AdminsController {
  constructor(private readonly admins: AdminsService) {}

  @ApiOperation({ summary: 'All admins, and how many of the allowed slots are used' })
  @Get()
  list() {
    return this.admins.list();
  }

  @ApiOperation({ summary: 'Create another admin with a temporary password (they must change it at first sign-in)' })
  @Post()
  create(@CurrentUser() me: AuthUser, @Body() dto: CreateAdminDto) {
    return this.admins.create(me.id, dto);
  }

  @HttpCode(200)
  @ApiOperation({ summary: 'Suspend an admin. Takes effect on their next request.' })
  @Post(':id/suspend')
  suspend(@Param('id', ParseUUIDPipe) id: string) {
    return this.admins.setSuspended(id, true);
  }

  @HttpCode(200)
  @ApiOperation({ summary: 'Reactivate a suspended admin' })
  @Post(':id/reactivate')
  reactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.admins.setSuspended(id, false);
  }

  @HttpCode(200)
  @ApiOperation({ summary: 'Set a new temporary password; the admin must change it at next sign-in' })
  @Post(':id/reset-password')
  reset(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ResetAdminPasswordDto) {
    return this.admins.resetPassword(id, dto.temporaryPassword);
  }

  @HttpCode(200)
  @ApiOperation({ summary: 'Remove an admin and free their slot' })
  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.admins.remove(id);
    return { ok: true };
  }
}
