import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { Role } from '../common/enums';
import { config } from '../config/config';
import { DOCUMENT_KINDS, DocumentsService } from './documents.service';
import type { DocumentKind } from './document.entity';

class ReviewDto {
  @IsIn(['APPROVED', 'REJECTED']) status: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}

/**
 * Shop owners and drivers submit documents while they are still waiting for approval, so these routes are open to
 * those roles regardless of account status (unlike most role routes, which need an approved account).
 */
@ApiTags('documents')
@ApiBearerAuth()
@Controller('documents')
export class DocumentsController {
  constructor(private readonly docs: DocumentsService) {}

  private assertCanSubmit(user: AuthUser) {
    if (user.role !== Role.RIDER && user.role !== Role.MERCHANT) throw new ForbiddenException('Only shop owners and drivers submit documents.');
  }

  @Throttle({ default: { limit: config.isTest ? 100_000 : 20, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: config.uploads.maxDocBytes, files: 1 } }))
  @ApiOperation({ summary: 'Submit a verification document (photo or PDF). Private: only ORBIT admins can open it.' })
  @ApiConsumes('multipart/form-data')
  @Post()
  upload(@CurrentUser() user: AuthUser, @Query('kind') kind: string, @UploadedFile() file?: Express.Multer.File) {
    this.assertCanSubmit(user);
    if (!(DOCUMENT_KINDS as readonly string[]).includes(kind)) throw new BadRequestException(`kind must be one of: ${DOCUMENT_KINDS.join(', ')}`);
    if (!file) throw new BadRequestException('Attach the document in the "file" field.');
    return this.docs.save(user.id, kind as DocumentKind, file.buffer);
  }

  @ApiOperation({ summary: 'Your documents and whether each was approved' })
  @Get()
  list(@CurrentUser() user: AuthUser) {
    this.assertCanSubmit(user);
    return this.docs.list(user.id);
  }

  @HttpCode(200)
  @ApiOperation({ summary: 'Delete a document you uploaded (not once it is approved)' })
  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    this.assertCanSubmit(user);
    await this.docs.remove(user.id, id);
    return { ok: true };
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/documents')
export class AdminDocumentsController {
  constructor(private readonly docs: DocumentsService) {}

  @ApiOperation({ summary: 'Documents a person has submitted' })
  @Get('user/:userId')
  forUser(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.docs.forUser(userId);
  }

  @ApiOperation({ summary: 'The document file. Sent privately, never cached, and never run as a web page.' })
  @Get(':id/file')
  async file(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { data, mime } = await this.docs.file(id);
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', String(data.length));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Content-Disposition', mime === 'application/pdf' ? 'attachment; filename="document.pdf"' : 'inline');
    res.end(data);
  }

  @HttpCode(200)
  @ApiOperation({ summary: 'Approve a document, or reject it with a note saying what to fix' })
  @Post(':id/review')
  review(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewDto) {
    return this.docs.review(id, dto.status, dto.note);
  }
}
