import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Complaint } from './complaint.entity';
import { ComplaintsController } from './complaint.controller';
import { ComplaintsService } from './complaint.service';
import { User } from '../users/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Complaint, User])],
  controllers: [ComplaintsController],
  providers: [ComplaintsService],
  exports: [ComplaintsService],
})
export class ComplaintsModule {}
