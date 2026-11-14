import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Complaint } from './complaint.entity';
import {
  ComplaintQueryDto,
  CreateComplaintDto,
  UpdateComplaintDto,
} from './complaint.dto';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class ComplaintsService {
  private readonly logger = new Logger(ComplaintsService.name);

  constructor(
    @InjectRepository(Complaint) private readonly complaints: Repository<Complaint>,
    private readonly realtime: RealtimeService,
  ) {}

  /** File a new complaint (customer). */
  async create(
    userId: string,
    dto: CreateComplaintDto,
  ): Promise<Complaint> {
    const complaint = this.complaints.create({
      userId,
      category: dto.category,
      subject: dto.subject,
      message: dto.message,
      status: 'OPEN',
    });
    const saved = await this.complaints.save(complaint);
    // Notify admins of new complaint
    void this.realtime.adminChanged();
    return saved;
  }

  /** Get complaints for a specific user (customer view). */
  async findByUser(userId: string): Promise<Complaint[]> {
    return this.complaints.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /** Get all complaints with filters (admin view). */
  async findAll(dto: ComplaintQueryDto): Promise<[Complaint[], number]> {
    const query = this.complaints.createQueryBuilder('complaint');

    if (dto.status) {
      query.andWhere('complaint.status = :status', { status: dto.status });
    }
    if (dto.userId) {
      query.andWhere('complaint.userId = :userId', { userId: dto.userId });
    }

    query.orderBy('complaint.createdAt', 'DESC');
    query.skip(((dto.page ?? 1) - 1) * (dto.limit ?? 20));
    query.take(Math.min(dto.limit ?? 20, 100));

    return query.getManyAndCount();
  }

  /** Get one complaint by ID. */
  async findOne(id: string): Promise<Complaint> {
    const complaint = await this.complaints.findOne({ where: { id } });
    if (!complaint) throw new NotFoundException('Complaint not found.');
    return complaint;
  }

  /** Update complaint status and admin response (admin only). */
  async update(
    id: string,
    adminId: string,
    dto: UpdateComplaintDto,
  ): Promise<Complaint> {
    const complaint = await this.findOne(id);

    if (dto.status !== undefined) {
      complaint.status = dto.status;
      if (dto.status === 'RESOLVED' || dto.status === 'REJECTED') {
        complaint.resolvedAt = new Date();
        complaint.handledById = adminId;
      }
    }
    if (dto.adminResponse !== undefined) {
      complaint.adminResponse = dto.adminResponse;
    }

    const saved = await this.complaints.save(complaint);
    // Notify admins of update
    void this.realtime.adminChanged();
    return saved;
  }

  /** Delete a complaint (admin only). */
  async remove(id: string): Promise<void> {
    const complaint = await this.findOne(id);
    await this.complaints.remove(complaint);
    void this.realtime.adminChanged();
  }
}
