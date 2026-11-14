import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Public, Roles } from '../common/auth.decorators';
import { Role } from '../common/enums';
import { JwtAuthGuard } from '../common/auth.guards';
import { ErrorLogsService } from './error-log.service';
import {
  ClientErrorDto,
  ErrorLogQueryDto,
  MarkReviewedDto,
} from './error-log.dto';

@ApiTags('error-logs')
@Controller('error-logs')
export class ErrorLogsController {
  constructor(private readonly errors: ErrorLogsService) {}

  /** Client reports a frontend error. No auth required - anyone can report. */
  @Public()
  @Post()
  @ApiOperation({ summary: 'Client reports a frontend error' })
  record(@Body() dto: ClientErrorDto) {
    return this.errors.record(dto);
  }

  /** Admin lists all errors with filters. */
  @Get()
  @UseGuards(JwtAuthGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List all client errors (admin)' })
  findAll(@Query() dto: ErrorLogQueryDto) {
    return this.errors.findAll(dto);
  }

  /** Admin gets one error detail. */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get one error log (admin)' })
  findOne(@Param('id') id: string) {
    return this.errors.findOne(id);
  }

  /** Admin marks an error as reviewed/unreviewed. */
  @Put(':id/reviewed')
  @UseGuards(JwtAuthGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Mark error as reviewed (admin)' })
  markReviewed(
    @Param('id') id: string,
    @Body() dto: MarkReviewedDto,
  ) {
    return this.errors.markReviewed(id, dto);
  }

  /** Admin deletes an error log. */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete an error log (admin)' })
  remove(@Param('id') id: string) {
    return this.errors.remove(id);
  }
}
