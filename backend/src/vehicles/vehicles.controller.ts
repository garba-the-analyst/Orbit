import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { Role } from '../common/enums';
import { CreateVehicleDto, RejectVehicleDto, UpdateVehicleDto } from './vehicles.dto';
import { VehiclesService } from './vehicles.service';

/**
 * Drivers register vehicles while they are still waiting for approval, so this controller checks the role itself
 * instead of using @Roles (which would also require an approved account).
 */
@ApiTags('vehicles')
@ApiBearerAuth()
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  private driver(user: AuthUser) {
    if (user.role !== Role.RIDER) throw new ForbiddenException('Only drivers and hauliers register vehicles.');
  }

  @ApiOperation({ summary: 'Your vehicles' })
  @Get()
  list(@CurrentUser() user: AuthUser) { this.driver(user); return this.vehicles.list(user.id); }

  @ApiOperation({ summary: 'Register a vehicle (car, bike, keke, van, truck, lorry, long-haul). It is reviewed before use.' })
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateVehicleDto) { this.driver(user); return this.vehicles.create(user.id, dto); }

  @ApiOperation({ summary: 'Edit a vehicle. Changing the plate sends it back for review.' })
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVehicleDto) { this.driver(user); return this.vehicles.update(user.id, id, dto); }

  @HttpCode(200)
  @ApiOperation({ summary: 'Use this vehicle for jobs and trips (it must be approved)' })
  @Post(':id/activate')
  activate(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) { this.driver(user); return this.vehicles.activate(user.id, id); }

  @HttpCode(200)
  @ApiOperation({ summary: 'Remove a vehicle' })
  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) { this.driver(user); await this.vehicles.remove(user.id, id); return { ok: true }; }
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/vehicles')
export class AdminVehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @ApiOperation({ summary: 'Vehicles waiting for review (or ?status=APPROVED / REJECTED)' })
  @Get()
  queue(@Query('status') status?: string) { return this.vehicles.queue(['PENDING', 'APPROVED', 'REJECTED'].includes(status ?? '') ? status : 'PENDING'); }

  @HttpCode(200)
  @Post(':id/approve')
  approve(@Param('id', ParseUUIDPipe) id: string) { return this.vehicles.approve(id); }

  @HttpCode(200)
  @ApiOperation({ summary: 'Reject a vehicle with a note saying what to fix' })
  @Post(':id/reject')
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectVehicleDto) { return this.vehicles.reject(id, dto.note); }
}
