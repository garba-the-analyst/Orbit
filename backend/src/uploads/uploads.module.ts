import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Document } from './document.entity';
import { AdminDocumentsController, DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { STORAGE, storageFactory } from './storage.provider';
import { Upload } from './upload.entity';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

@Module({
  imports: [TypeOrmModule.forFeature([Upload, Document])],
  controllers: [UploadsController, DocumentsController, AdminDocumentsController],
  providers: [UploadsService, DocumentsService, { provide: STORAGE, useFactory: storageFactory }],
  exports: [UploadsService, DocumentsService],
})
export class UploadsModule {}
