import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Public } from '../common/auth.decorators';
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
   * Public settings the app needs before sign-in: fees to display, and (in demo mode only)
   * one-tap demo accounts.
   */
  @Public()
  @ApiOperation({ summary: 'Public app configuration' })
  @Get('config')
  async publicConfig() {
    const demo = !config.isProduction && (await this.users.exist({ where: { email: 'admin@orbit.demo' } }));
    return {
      currency: 'NGN',
      pilotZone: config.business.pilotZone,
      commissionPct: config.business.commissionBps / 100,
      orbitDeliveryFee: config.business.orbitDeliveryFee,
      paymentProvider: config.paymentProvider,
      pendingPaymentTtlMin: config.business.pendingPaymentTtlMin,
      demo: demo ? { password: DEMO_PASSWORD, accounts: DEMO_ACCOUNTS } : null,
    };
  }
}
