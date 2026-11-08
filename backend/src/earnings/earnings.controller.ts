import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { Role } from '../common/enums';
import { EarningsService } from './earnings.service';

@ApiTags('earnings')
@ApiBearerAuth()
@Controller()
export class EarningsController {
  constructor(private readonly earnings: EarningsService) {}

  @Roles(Role.MERCHANT)
  @ApiOperation({ summary: 'Your sales net of ORBIT commission (merchant)' })
  @Get('merchant/earnings')
  merchant(@CurrentUser() user: AuthUser) {
    return this.earnings.summary(user);
  }

  @Roles(Role.RIDER)
  @ApiOperation({ summary: 'Your delivery earnings (rider)' })
  @Get('rider/earnings')
  rider(@CurrentUser() user: AuthUser) {
    return this.earnings.summary(user);
  }
}
