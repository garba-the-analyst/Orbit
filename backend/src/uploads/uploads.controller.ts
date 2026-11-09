import {
  BadRequestException,
  Controller,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { AuthUser, CurrentUser } from '../common/auth.decorators';
import { config } from '../config/config';
import { UPLOAD_KINDS, UploadKind, UploadsService } from './uploads.service';

@ApiTags('uploads')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Throttle({ default: { limit: config.isTest ? 100_000 : 40, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: config.uploads.maxBytes, files: 1 } }),
  )
  @ApiOperation({ summary: 'Upload a picture (JPEG, PNG or WebP). Returns the URL to use in a profile, shop or product.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @Post()
  async upload(
    @CurrentUser() user: AuthUser,
    @Query('kind') kind: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!UPLOAD_KINDS.includes(kind as UploadKind)) {
      throw new BadRequestException(`kind must be one of: ${UPLOAD_KINDS.join(', ')}`);
    }
    if (!file) throw new BadRequestException('Attach a picture in the "file" field.');
    return this.uploads.save(user.id, kind as UploadKind, file.buffer);
  }
}
