import { Global, Injectable, Logger, Module } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { config } from '../config/config';

export interface Mail { to: string; subject: string; text: string }

/**
 * Sends email through any SMTP server (SMTP_URL, for example smtps://user:app-password@smtp.gmail.com:465).
 * With no SMTP configured, mail is logged instead: in development the full text (so you can click the reset link),
 * in production only the subject, because a log line must never contain a working reset link.
 */
@Injectable()
export class MailService {
  private readonly log = new Logger('Mail');
  private readonly transport = config.mail.url ? nodemailer.createTransport(config.mail.url) : null;
  /** What was "sent" during tests, so they can read the reset link. Always empty outside tests. */
  readonly outbox: Mail[] = [];

  get enabled() {
    return !!this.transport;
  }

  async send(mail: Mail): Promise<void> {
    if (config.isTest) this.outbox.push(mail);
    if (!this.transport) {
      this.log.warn(config.isProduction ? `Email not sent (SMTP_URL is not set): "${mail.subject}"` : `Email not sent (SMTP_URL is not set). To ${mail.to}: ${mail.subject}\n${mail.text}`);
      return;
    }
    try {
      await this.transport.sendMail({ from: config.mail.from, to: mail.to, subject: mail.subject, text: mail.text });
    } catch (e) {
      this.log.error(`Could not send "${mail.subject}": ${(e as Error).message}`); // never fail the request over email
    }
  }
}

@Global()
@Module({ providers: [MailService], exports: [MailService] })
export class MailModule {}
