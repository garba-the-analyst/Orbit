import { Body, Controller, Delete, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { AuthUser, CurrentUser } from '../common/auth.decorators';
import { NotificationsService } from './notifications.service';

class ListQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsDateString() before?: string;
}

class MarkReadDto {
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsUUID('all', { each: true }) ids?: string[];
}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @ApiOperation({ summary: 'Your notifications, newest first. Pass `before` (an ISO time) to page back.' })
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: ListQuery) {
    return this.notifications.list(user.id, q.limit, q.before);
  }

  @ApiOperation({ summary: 'How many you have not read' })
  @Get('unread-count')
  async unread(@CurrentUser() user: AuthUser) {
    return { unread: await this.notifications.unreadCount(user.id) };
  }

  @HttpCode(200)
  @ApiOperation({ summary: 'Mark some (ids) or all notifications as read' })
  @Post('read')
  read(@CurrentUser() user: AuthUser, @Body() dto: MarkReadDto) {
    return this.notifications.markRead(user.id, dto.ids);
  }

  @HttpCode(200)
  @ApiOperation({ summary: 'Delete all your notifications' })
  @Delete()
  async clear(@CurrentUser() user: AuthUser) {
    await this.notifications.clear(user.id);
    return { ok: true };
  }
}
