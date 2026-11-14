import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorLog } from './error-log.entity';
import {
  ClientErrorDto,
  ErrorLogQueryDto,
  MarkReviewedDto,
} from './error-log.dto';

@Injectable()
export class ErrorLogsService {
  private readonly logger = new Logger(ErrorLogsService.name);

  constructor(
    @InjectRepository(ErrorLog) private readonly errors: Repository<ErrorLog>,
  ) {}

  /** Client reports an error from the web or mobile app. */
  async record(dto: ClientErrorDto): Promise<ErrorLog> {
    const entry = this.errors.create({
      path: dto.path,
      method: dto.method,
      message: dto.message,
      stack: dto.stack ?? null,
      userAgent: dto.userAgent ?? null,
      reviewed: false,
    });
    return this.errors.save(entry);
  }

  /** Admin lists all errors with optional filters. */
  async findAll(dto: ErrorLogQueryDto): Promise<[ErrorLog[], number]> {
    const query = this.errors.createQueryBuilder('error');

    if (dto.path) {
      query.andWhere('error.path ILIKE :path', { path: `%${dto.path}%` });
    }
    if (dto.method) {
      query.andWhere('error.method = :method', { method: dto.method });
    }
    if (dto.userId) {
      query.andWhere('error.userId = :userId', { userId: dto.userId });
    }

    query.orderBy('error.createdAt', 'DESC');
    query.skip(((dto.page ?? 1) - 1) * (dto.limit ?? 20));
    query.take(Math.min(dto.limit ?? 20, 100));

    return query.getManyAndCount();
  }

  /** Get one error by ID. */
  async findOne(id: string): Promise<ErrorLog> {
    const entry = await this.errors.findOne({ where: { id } });
    if (!entry) throw new NotFoundException('Error log not found.');
    return entry;
  }

  /** Mark an error as reviewed or unreviewed (admin). */
  async markReviewed(id: string, dto: MarkReviewedDto): Promise<ErrorLog> {
    const entry = await this.findOne(id);
    entry.reviewed = dto.reviewed;
    return this.errors.save(entry);
  }

  /** Delete an error log (admin). */
  async remove(id: string): Promise<void> {
    const entry = await this.findOne(id);
    await this.errors.remove(entry);
  }
}
