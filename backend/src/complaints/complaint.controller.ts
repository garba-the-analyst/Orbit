import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Public, Roles } from '../common/auth.decorators';
import { Role } from '../common/enums';
import { JwtAuthGuard } from '../common/auth.guards';
import { ComplaintsService } from './complaint.service';
import {
  ComplaintQueryDto,
  CreateComplaintDto,
  UpdateComplaintDto,
} from './complaint.dto';

@ApiTags('complaints')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('complaints')
export class ComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  /** Customer files a new complaint. */
  @Post()
  @ApiOperation({ summary: 'File a customer complaint' })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateComplaintDto,
  ) {
    return this.complaints.create(user.id, dto);
  }

  /** Customer views their own complaints. */
  @Get('mine')
  @ApiOperation({ summary: 'List my complaints' })
  findByUser(@CurrentUser() user: AuthUser) {
    return this.complaints.findByUser(user.id);
  }

  /** Admin lists all complaints with filters. */
  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List all complaints (admin)' })
  findAll(@Query() dto: ComplaintQueryDto) {
    return this.complaints.findAll(dto);
  }

  /** Admin gets one complaint. */
  @Get(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get one complaint (admin)' })
  findOne(@Param('id') id: string) {
    return this.complaints.findOne(id);
  }

  /** Admin updates complaint status/response. */
  @Put(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update complaint status and response (admin)' })
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateComplaintDto,
  ) {
    return this.complaints.update(id, user.id, dto);
  }

  /** Admin deletes a complaint. */
  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a complaint (admin)' })
  remove(@Param('id') id: string) {
    return this.complaints.remove(id);
  }
}
