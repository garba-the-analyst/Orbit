import { Body, Controller, Headers, HttpCode, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import type { Request } from 'express';
import { AuthUser, CurrentUser, Public, Roles } from '../common/auth.decorators';
import { Role } from '../common/enums';
import { PaymentsService } from './payments.service';

class SimulateDto {
  @IsIn(['success', 'failed'])
  outcome: 'success' | 'failed';
}

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Gateway webhook. Authenticated by an HMAC-SHA256 signature in x-orbit-signature.' })
  @Post('webhook')
  webhook(@Req() req: Request & { rawBody?: Buffer }, @Headers('x-orbit-signature') signature?: string) {
    return this.payments.handleWebhook(req.rawBody, signature);
  }

  @ApiBearerAuth()
  @Roles(Role.CUSTOMER)
  @HttpCode(200)
  @ApiOperation({ summary: 'TEST MODE ONLY: complete or fail a payment as the gateway would' })
  @Post(':reference/simulate')
  simulate(@CurrentUser() user: AuthUser, @Param('reference') reference: string, @Body() dto: SimulateDto) {
    return this.payments.simulate(user, reference, dto.outcome);
  }
}
