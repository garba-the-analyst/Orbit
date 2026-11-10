import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Public } from '../common/auth.decorators';
import { GOODS_SPECS, SHOP_CATEGORIES, VEHICLE_SPECS } from '../common/catalog';
import { LEGAL_VERSION } from '../legal/legal.content';
import { MARKETS } from '../common/markets';
import { scaleAmount } from '../common/money';
import { config } from '../config/config';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../seed/seed.service';
import { User } from '../users/user.entity';

@ApiTags('platform')
@Controller()
export class AppController {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  @Public()
  @ApiOperation({ summary: 'Liveness and database check' })
  @Get('health')
  async health() {
    await this.db.query('SELECT 1');
    return { status: 'ok', db: 'up', uptimeSeconds: Math.round(process.uptime()), env: config.nodeEnv };
  }

  /**
   * Public settings the app needs before sign-in: the countries served, fees to display, the vehicle and goods
   * catalogues, map settings, and (in demo mode only) one-tap demo accounts.
   */
  @Public()
  @ApiOperation({ summary: 'Public app configuration' })
  @Get('config')
  async publicConfig() {
    const demo = !config.isProduction && (await this.users.exist({ where: { email: 'admin@orbit.demo' } }));
    const markets = config.markets.enabled.map((code) => MARKETS[code]);
    const main = markets[0];
    return {
      serviceArea: markets.map((m) => m.name).join(', '),
      defaultMarket: main.code,
      markets: markets.map((m) => ({
        code: m.code,
        name: m.name,
        currency: m.currency,
        symbol: m.symbol,
        dialCode: m.dialCode,
        locale: m.locale,
        center: m.center,
        centerName: m.centerName,
        orbitDeliveryFee: scaleAmount(config.business.orbitDeliveryFee, m),
      })),
      commissionPct: config.business.commissionBps / 100,
      tripCommissionPct: config.trips.commissionBps / 100,
      paymentProvider: config.paymentProvider,
      /** True while payments are simulated: the app shows a clear "test mode" banner and no real money moves. */
      testMode: config.paymentProvider === 'mock',
      categories: SHOP_CATEGORIES,
      legal: { version: LEGAL_VERSION, consentRequired: config.consent.required },
      pendingPaymentTtlMin: config.business.pendingPaymentTtlMin,
      map: {
        provider: config.geo.provider,
        tileUrl: config.geo.tileUrl,
        center: config.geo.center ?? main.center,
        attribution: '© OpenStreetMap contributors',
      },
      vehicles: Object.values(VEHICLE_SPECS).map(({ tariff: _tariff, avgKmh: _avg, searchRadiusKm: _r, ...rest }) => rest),
      goods: Object.values(GOODS_SPECS),
      demo: demo ? { password: DEMO_PASSWORD, accounts: DEMO_ACCOUNTS } : null,
    };
  }
}
