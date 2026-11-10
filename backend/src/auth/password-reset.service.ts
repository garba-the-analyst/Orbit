/**
 * "Forgot password" by email.
 * - The emailed token is random (256 bits) and only its SHA-256 hash is stored, so a database leak cannot be used to take over accounts.
 * - Tokens last 30 minutes and work once. Asking again voids the earlier one.
 * - The answer to "forgot" is always the same, whether or not the email has an account.
 * - A reset signs out every device (the same mechanism as changing your password).
 */
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { IsNull, LessThan, MoreThan, Repository } from 'typeorm';
import { AccountStatus } from '../common/enums';
import { config } from '../config/config';
import { MailService } from '../mail/mail.service';
import { User } from '../users/user.entity';
import { PasswordReset } from './password-reset.entity';

const LIFETIME_MS = 30 * 60_000;
const MAX_PER_HOUR = 3;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

@Injectable()
export class PasswordResetService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(PasswordReset) private readonly resets: Repository<PasswordReset>,
    private readonly mail: MailService,
  ) {}

  async request(email: string): Promise<void> {
    const user = await this.users.findOne({ where: { email } });
    if (!user || user.status === AccountStatus.DELETED) return;
    const recent = await this.resets.count({ where: { userId: user.id, createdAt: MoreThan(new Date(Date.now() - 3_600_000)) } });
    if (recent >= MAX_PER_HOUR) return; // quietly: do not reveal that the address exists, and do not let anyone flood someone's inbox
    // An earlier unused link stops working (it is marked used, not deleted, so the hourly limit above can count it).
    await this.resets.update({ userId: user.id, usedAt: IsNull() }, { usedAt: new Date() });
    void this.resets.delete({ createdAt: LessThan(new Date(Date.now() - 86_400_000)) }).catch(() => undefined);
    const token = randomBytes(32).toString('base64url');
    await this.resets.save(this.resets.create({ userId: user.id, tokenHash: sha(token), expiresAt: new Date(Date.now() + LIFETIME_MS) }));
    const link = `${config.mail.appUrl}/reset-password?token=${token}`;
    await this.mail.send({
      to: user.email,
      subject: 'Reset your ORBIT password',
      text: `Hello ${user.name.split(' ')[0]},\n\nSomeone asked to reset the password for your ORBIT account. If it was you, open this link within 30 minutes:\n\n${link}\n\nIf it was not you, ignore this email: your password has not changed.\n\n— ORBIT`,
    });
  }

  async reset(token: string, newPassword: string): Promise<void> {
    const row = await this.resets.findOne({ where: { tokenHash: sha(token), usedAt: IsNull(), expiresAt: MoreThan(new Date()) } });
    if (!row) throw new BadRequestException('This reset link is invalid or has expired. Ask for a new one.');
    // Claim the token first: a second request with the same link finds nothing to claim.
    const claimed = await this.resets.update({ id: row.id, usedAt: IsNull() }, { usedAt: new Date() });
    if (!claimed.affected) throw new BadRequestException('This reset link is invalid or has expired. Ask for a new one.');
    await this.users.update({ id: row.userId }, {
      passwordHash: await bcrypt.hash(newPassword, 10), passwordChangedAt: new Date(), mustChangePassword: false, failedLogins: 0, lockedUntil: null,
    });
  }
}
