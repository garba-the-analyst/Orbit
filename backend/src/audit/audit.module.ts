import { Controller, Get, Global, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Roles } from '../common/auth.decorators';
import { Role } from '../common/enums';
import { User } from '../users/user.entity';
import { AuditLog } from './audit.entity';
import { AuditService } from './audit.service';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @ApiOperation({ summary: 'What ORBIT staff have done, newest first' })
  @Get()
  list(@Query('limit') limit?: string, @Query('offset') offset?: string, @Query('actor') actor?: string) {
    return this.audit.list(parseInt(limit ?? '30', 10) || 30, parseInt(offset ?? '0', 10) || 0, actor && /^[0-9a-f-]{36}$/i.test(actor) ? actor : undefined);
  }
}

@Global()
@Module({ imports: [TypeOrmModule.forFeature([AuditLog, User])], controllers: [AuditController], providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
