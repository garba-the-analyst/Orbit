import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthUser, CurrentUser, Public, Roles } from '../common/auth.decorators';
import { Role } from '../common/enums';
import { CancelTripDto, CheckPromoDto, CreatePromoDto, CreateTripDto, PinDto, QuoteTripDto, RateTripDto, ResolveSosDto, SosDto, TipTripDto } from './trips.dto';
import { TripsAdminService } from './trips-admin.service';
import { TripsService } from './trips.service';

const page = (v?: string, fallback = 20) => { const n = parseInt(v ?? '', 10); return Number.isFinite(n) && n >= 0 ? n : fallback; };

/** Customers and merchants request rides, parcels and freight. */
@ApiTags('trips')
@ApiBearerAuth()
@Controller('trips')
export class TripsController {
  constructor(private readonly trips: TripsService) {}

  @Roles(Role.CUSTOMER, Role.MERCHANT)
  @HttpCode(200)
  @ApiOperation({ summary: 'Price a trip for every suitable vehicle: fare, surge, driver ETA and the route to draw' })
  @Post('quote')
  quote(@Body() dto: QuoteTripDto) { return this.trips.quote(dto); }

  @Roles(Role.CUSTOMER, Role.MERCHANT)
  @ApiOperation({ summary: 'Request a ride, parcel delivery or freight job. Send acceptedSurge from the quote so the price cannot change under you.' })
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTripDto) { return this.trips.create(user, dto); }

  @Roles(Role.CUSTOMER, Role.MERCHANT)
  @HttpCode(200)
  @ApiOperation({ summary: 'Check a promo code' })
  @Post('promo/check')
  promo(@CurrentUser() user: AuthUser, @Body() dto: CheckPromoDto) { return this.trips.checkPromo(user.id, dto.code, dto.currency); }

  @Roles(Role.CUSTOMER, Role.MERCHANT)
  @ApiOperation({ summary: 'Your trip in progress, or null' })
  @Get('active')
  async active(@CurrentUser() user: AuthUser) { return (await this.trips.activeFor(user)) ?? { none: true }; }

  @Roles(Role.CUSTOMER, Role.MERCHANT)
  @ApiOperation({ summary: 'Your trips. scope=active|past (default past). Total in X-Total-Count.' })
  @Get()
  async list(@CurrentUser() user: AuthUser, @Query('scope') scope: string | undefined, @Query('limit') limit: string | undefined, @Query('offset') offset: string | undefined, @Res({ passthrough: true }) res: Response) {
    const { items, total } = await this.trips.list(user, scope === 'active' ? 'active' : 'past', page(limit), page(offset, 0));
    res.setHeader('X-Total-Count', String(total));
    return items;
  }

  @ApiOperation({ summary: 'One trip (customer, assigned driver or admin)' })
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.trips.get(user, id); }

  @ApiOperation({ summary: 'Where the driver is right now' })
  @Get(':id/tracking')
  tracking(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.trips.tracking(user, id); }

  @Roles(Role.CUSTOMER, Role.MERCHANT)
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel. Free while searching and for a short time after a driver accepts; later it can cost a fee (card) and counts towards a limit.' })
  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelTripDto) { return this.trips.cancel(user.id, id, dto); }

  @HttpCode(200)
  @ApiOperation({ summary: 'Rate the other person, 1 to 5 (customer rates the driver; the driver rates the customer from the driver app)' })
  @Post(':id/rate')
  rate(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RateTripDto) { return this.trips.rate(user, id, dto); }

  @Roles(Role.CUSTOMER, Role.MERCHANT)
  @HttpCode(200)
  @ApiOperation({ summary: 'Tip the driver (card trips, within 24 hours)' })
  @Post(':id/tip')
  tip(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TipTripDto) { return this.trips.tip(user.id, id, dto.amount); }

  @Roles(Role.CUSTOMER, Role.MERCHANT)
  @HttpCode(200)
  @ApiOperation({ summary: 'Get a link to share your live trip with someone you trust' })
  @Post(':id/share')
  share(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.trips.share(user.id, id); }

  @Roles(Role.CUSTOMER, Role.MERCHANT)
  @ApiOperation({ summary: 'Stop sharing' })
  @Delete(':id/share')
  unshare(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.trips.unshare(user.id, id); }

  @HttpCode(200)
  @ApiOperation({ summary: 'Safety alert: tells ORBIT staff at once. Available to the customer and the driver while the trip is under way.' })
  @Post(':id/sos')
  sos(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SosDto) { return this.trips.raiseSos(user, id, dto); }
}

/** Anyone with the link can follow a shared trip. No account, no phone numbers. */
@ApiTags('trips')
@Controller('track')
export class PublicTrackController {
  constructor(private readonly trips: TripsService) {}

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Follow a shared trip' })
  @Get(':token')
  track(@Param('token') token: string) { return this.trips.publicTrack(token); }
}

/** The driver's side: offers, progress and history. */
@ApiTags('driver')
@ApiBearerAuth()
@Roles(Role.RIDER)
@Controller('driver')
export class DriverTripsController {
  constructor(private readonly trips: TripsService) {}

  @ApiOperation({ summary: 'Requests offered to you right now (go online first). They expire in seconds.' })
  @Get('offers')
  offers(@CurrentUser() user: AuthUser) { return this.trips.offersFor(user.id); }

  @HttpCode(200)
  @ApiOperation({ summary: 'Take a request. The first driver to accept gets it.' })
  @Post('offers/:tripId/accept')
  accept(@CurrentUser() user: AuthUser, @Param('tripId', ParseUUIDPipe) id: string) { return this.trips.accept(user.id, id); }

  @HttpCode(200)
  @Post('offers/:tripId/decline')
  decline(@CurrentUser() user: AuthUser, @Param('tripId', ParseUUIDPipe) id: string) { return this.trips.decline(user.id, id); }

  @ApiOperation({ summary: 'Your trip in progress, or { none: true }' })
  @Get('trips/active')
  async active(@CurrentUser() user: AuthUser) { return (await this.trips.activeFor(user)) ?? { none: true }; }

  @ApiOperation({ summary: 'Your finished trips. Total in X-Total-Count.' })
  @Get('trips')
  async history(@CurrentUser() user: AuthUser, @Query('limit') limit: string | undefined, @Query('offset') offset: string | undefined, @Res({ passthrough: true }) res: Response) {
    const { items, total } = await this.trips.list(user, 'past', page(limit), page(offset, 0));
    res.setHeader('X-Total-Count', String(total));
    return items;
  }

  @HttpCode(200)
  @ApiOperation({ summary: 'You are at the pickup point (checked against your GPS position)' })
  @Post('trips/:id/arrived')
  arrived(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.trips.arrived(user.id, id); }

  @HttpCode(200)
  @ApiOperation({ summary: 'Start the trip. Rides need the passenger’s start PIN.' })
  @Post('trips/:id/start')
  start(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PinDto) { return this.trips.start(user.id, id, dto.pin); }

  @HttpCode(200)
  @ApiOperation({ summary: 'Finish the trip. Parcels need the recipient’s delivery PIN.' })
  @Post('trips/:id/complete')
  complete(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PinDto) { return this.trips.complete(user.id, id, dto.pin); }

  @HttpCode(200)
  @ApiOperation({ summary: 'Give up a trip you accepted but have not started. It goes back to searching.' })
  @Post('trips/:id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.trips.driverCancel(user.id, id); }
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin')
export class TripsAdminController {
  constructor(private readonly admin: TripsAdminService) {}

  @ApiOperation({ summary: 'All trips. ?status=active|SEARCHING|COMPLETED… Total in X-Total-Count.' })
  @Get('trips')
  async trips(@Query('status') status: string | undefined, @Query('limit') limit: string | undefined, @Query('offset') offset: string | undefined, @Res({ passthrough: true }) res: Response) {
    const { items, total } = await this.admin.list(status, page(limit, 30), page(offset, 0));
    res.setHeader('X-Total-Count', String(total));
    return items;
  }

  @HttpCode(200)
  @ApiOperation({ summary: 'Clear the wrong-PIN lock on a trip' })
  @Post('trips/:id/unlock-pin')
  async unlock(@Param('id', ParseUUIDPipe) id: string) { await this.admin.unlockPin(id); return { ok: true }; }

  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel a stuck or unsafe trip with no fee' })
  @Post('trips/:id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelTripDto) { return this.admin.cancel(id, dto.reason); }

  @Get('promos') promos() { return this.admin.listPromos(); }

  @ApiOperation({ summary: 'Create a promo code. Discounts are paid from ORBIT’s commission, never from the driver’s earnings.' })
  @Post('promos') createPromo(@Body() dto: CreatePromoDto) { return this.admin.createPromo(dto); }

  @HttpCode(200) @Post('promos/:id/deactivate') deactivate(@Param('id', ParseUUIDPipe) id: string) { return this.admin.setPromoActive(id, false); }
  @HttpCode(200) @Post('promos/:id/activate') activate(@Param('id', ParseUUIDPipe) id: string) { return this.admin.setPromoActive(id, true); }

  @ApiOperation({ summary: 'Safety alerts (?status=OPEN|RESOLVED)' })
  @Get('sos')
  sos(@Query('status') status?: string) { return this.admin.listSos(status === 'RESOLVED' ? 'RESOLVED' : 'OPEN'); }

  @HttpCode(200)
  @Post('sos/:id/resolve')
  resolve(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ResolveSosDto) { return this.admin.resolveSos(id, dto.note); }
}
