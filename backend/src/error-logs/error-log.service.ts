import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { ErrorLog } from './error-log.entity';
import { ClientErrorDto, ErrorLogQueryDto, MarkReviewedDto } from './error-log.dto';

/** Basic info about the user who hit the error, attached for admin screens. */
export type ErrorLogPerson = { name: string; phone: string; role: string };

/** An error log with the reporting user's info attached. */
export type ErrorLogWithPerson = ErrorLog & { person: ErrorLogPerson | null };

@Injectable()
export class ErrorLogsService {
  constructor(
    @InjectRepository(ErrorLog) private readonly errors: Repository<ErrorLog>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  /** Client reports an error from the web or mobile app. */
  async record(dto: ClientErrorDto): Promise<ErrorLog> {
    const entry = this.errors.create({
      path: dto.path,
      method: dto.method,
      message: dto.message,
      stack: dto.stack ?? null,
      userAgent: dto.userAgent ?? null,
      userId: dto.userId ?? null,
      role: dto.role ?? null,
      reviewed: false,
    });
    return this.errors.save(entry);
  }

  /** Admin lists all errors with optional filters (path, method, userId, reviewed). */
  async findAll(dto: ErrorLogQueryDto): Promise<[ErrorLogWithPerson[], number]> {
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
    if (dto.reviewed !== undefined) {
      query.andWhere('error.reviewed = :reviewed', { reviewed: dto.reviewed });
    }

    query.orderBy('error.createdAt', 'DESC');
    query.skip(((dto.page ?? 1) - 1) * (dto.limit ?? 20));
    query.take(Math.min(dto.limit ?? 20, 100));

    const [rows, total] = await query.getManyAndCount();
    return [await this.withPerson(rows), total];
  }

  /** Get one error by ID. */
  async findOne(id: string): Promise<ErrorLogWithPerson> {
    const entry = await this.errors.findOne({ where: { id } });
    if (!entry) throw new NotFoundException('Error log not found.');
    const [row] = await this.withPerson([entry]);
    return row;
  }

  /** Mark an error as reviewed or unreviewed (admin). */
  async markReviewed(id: string, dto: MarkReviewedDto): Promise<ErrorLogWithPerson> {
    const entry = await this.findOne(id);
    entry.reviewed = dto.reviewed;
    const saved = await this.errors.save(entry);
    const [row] = await this.withPerson([saved]);
    return row;
  }

  /** Delete an error log (admin). */
  async remove(id: string): Promise<void> {
    const entry = await this.errors.findOne({ where: { id } });
    if (!entry) throw new NotFoundException('Error log not found.');
    await this.errors.remove(entry);
  }

  /** Attach the reporting user's name/phone/role in one batched query. */
  private async withPerson(rows: ErrorLog[]): Promise<ErrorLogWithPerson[]> {
    const ids = [...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x))];
    const users = ids.length
      ? await this.users.find({
          where: { id: In(ids) },
          select: { id: true, name: true, phone: true, role: true },
        })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    return rows.map((r) => {
      const u = r.userId ? byId.get(r.userId) : undefined;
      return { ...r, person: u ? { name: u.name, phone: u.phone, role: u.role } : null };
    });
  }
}
