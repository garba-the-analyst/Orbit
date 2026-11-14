import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ErrorLog } from './error-log.entity';
import { ErrorLogsController } from './error-log.controller';
import { ErrorLogsService } from './error-log.service';
import { User } from '../users/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ErrorLog, User])],
  controllers: [ErrorLogsController],
  providers: [ErrorLogsService],
  exports: [ErrorLogsService],
})
export class ErrorLogsModule {}
