import { Controller, Get, Module } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/auth.decorators';
import { LEGAL } from './legal.content';

@ApiTags('platform')
@Controller('legal')
export class LegalController {
  @Public()
  @ApiOperation({ summary: 'Terms and privacy notice, with the version people accept at sign-up' })
  @Get()
  get() { return LEGAL; }
}

@Module({ controllers: [LegalController] })
export class LegalModule {}
