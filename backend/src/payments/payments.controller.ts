import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import type { Request } from 'express';
import { AuthUser, CurrentUser, Public, Roles } from '../common/auth.decorators';
import { Role } from '../common/enums';
import { PaymentsService } from './payments.service';

class SimulateDto {
  @IsString()
  @IsIn(['success', 'failed'])
  outcome: 'success' | 'failed';
}

class InitializeDto {
  @IsString()
  @MinLength(1)
  reference: string;

  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  callbackUrl: string;
}

class ReturnQuery {
  @IsString()
  @MinLength(1)
  reference: string;

  @IsString()
  returnTo?: string;
}

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Gateway webhook. Authenticated by an HMAC signature.' })
  @Post('webhook')
  webhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-orbit-signature') orbitSignature?: string,
    @Headers('x-paystack-signature') paystackSignature?: string,
  ) {
    // Prefer the provider-specific signature; fall back to the mock/dev header.
    const signature = paystackSignature ?? orbitSignature;
    return this.payments.handleWebhook(req.rawBody, signature);
  }

  @ApiBearerAuth()
  // Shop owners and drivers can buy too; the service checks that the payer owns the order.
  @Roles(Role.CUSTOMER, Role.MERCHANT, Role.RIDER)
  @HttpCode(200)
  @ApiOperation({ summary: 'TEST MODE ONLY: complete or fail a payment as the gateway would' })
  @Post(':reference/simulate')
  simulate(@CurrentUser() user: AuthUser, @Param('reference') reference: string, @Body() dto: SimulateDto) {
    return this.payments.simulate(user, reference, dto.outcome);
  }

  @ApiBearerAuth()
  @Roles(Role.CUSTOMER, Role.MERCHANT, Role.RIDER)
  @HttpCode(200)
  @ApiOperation({ summary: 'Initialize a Paystack transaction and return the authorization URL.' })
  @Post('initialize')
  initialize(@CurrentUser() user: AuthUser, @Body() dto: InitializeDto) {
    return this.payments.initializePayment({
      userId: user.id,
      reference: dto.reference,
      customerEmail: dto.email,
      callbackUrl: dto.callbackUrl,
    });
  }

  @Public()
  @Get('return')
  @ApiOperation({ summary: 'Paystack return page: verifies the payment and redirects the customer back to the app.' })
  async returnPage(@Query() query: ReturnQuery, @Res() res: any) {
    const status = await this.payments.verifyReturn(query.reference);
    const returnTo = query.returnTo || '/';
    const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>ORBIT Payment</title></head>
<body>
<p>Payment ${status === 'success' ? 'confirmed' : 'not completed'}. Returning to your order...</p>
<script>window.location.href = ${JSON.stringify(returnTo)};</script>
</body></html>`;
    res.set('Content-Type', 'text/html');
    res.send(html);
  }
}
