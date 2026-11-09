import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { Repository } from 'typeorm';
import { DOCUMENT_KINDS, Document, DocumentKind, DocumentStatus } from './document.entity';
import { STORAGE, StorageProvider } from './storage.provider';

const MAX_DOCS_PER_USER = 12;
export { DOCUMENT_KINDS };

export interface DocumentView {
  id: string;
  kind: DocumentKind;
  status: DocumentStatus;
  note: string | null;
  mime: string;
  createdAt: string;
}

const view = (d: Document): DocumentView => ({
  id: d.id, kind: d.kind, status: d.status, note: d.note, mime: d.mime, createdAt: new Date(d.createdAt).toISOString(),
});

/**
 * Private verification documents. They are checked by content (never by file name), kept out of public storage,
 * and only ever returned to an admin through an authenticated request.
 */
@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(Document) private readonly docs: Repository<Document>,
    @Inject(STORAGE) private readonly storage: StorageProvider,
  ) {}

  async save(ownerId: string, kind: DocumentKind, data: Buffer): Promise<DocumentView> {
    if ((await this.docs.count({ where: { ownerId } })) >= MAX_DOCS_PER_USER) {
      throw new ConflictException(`You can keep up to ${MAX_DOCS_PER_USER} documents. Delete one first.`);
    }
    let body: Buffer;
    let mime: string;
    let ext: string;
    if (data.subarray(0, 5).toString('latin1') === '%PDF-') {
      body = data;
      mime = 'application/pdf';
      ext = 'pdf';
    } else {
      try {
        const meta = await sharp(data, { limitInputPixels: 80_000_000, failOn: 'error' }).metadata();
        if (!meta.format || !['jpeg', 'png', 'webp', 'heif', 'avif'].includes(meta.format)) throw new Error('format');
        // Keep text readable: up to 2400px, high quality. EXIF (including GPS) is dropped on output.
        body = await sharp(data, { limitInputPixels: 80_000_000 }).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
        mime = 'image/jpeg';
        ext = 'jpg';
      } catch {
        throw new BadRequestException('Upload a clear photo (JPEG, PNG or WebP) or a PDF.');
      }
    }
    const storageKey = `${ownerId}/${randomUUID()}.${ext}`;
    await this.storage.putPrivate(storageKey, body, mime);
    const row = await this.docs.save(this.docs.create({ ownerId, kind, storageKey, mime, bytes: body.length, status: 'PENDING', note: null }));
    return view(row);
  }

  async list(ownerId: string): Promise<DocumentView[]> {
    return (await this.docs.find({ where: { ownerId }, order: { createdAt: 'DESC' } })).map(view);
  }

  /** Owners may delete what they uploaded, unless it has already been approved. */
  async remove(ownerId: string, id: string): Promise<void> {
    const doc = await this.docs.findOne({ where: { id, ownerId } });
    if (!doc) throw new NotFoundException('Document not found.');
    if (doc.status === 'APPROVED') throw new ConflictException('An approved document cannot be removed. Contact ORBIT support.');
    await this.storage.deletePrivate(doc.storageKey);
    await this.docs.delete({ id });
  }

  /** Admin: every document a person has submitted. */
  forUser(userId: string): Promise<DocumentView[]> {
    return this.list(userId);
  }

  /** Admin: the file itself. */
  async file(id: string): Promise<{ data: Buffer; mime: string }> {
    const doc = await this.docs.findOne({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found.');
    return { data: await this.storage.getPrivate(doc.storageKey), mime: doc.mime };
  }

  async review(id: string, status: 'APPROVED' | 'REJECTED', note?: string): Promise<DocumentView> {
    const doc = await this.docs.findOne({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found.');
    if (status === 'REJECTED' && !note?.trim()) throw new BadRequestException('Say what is wrong so the person can fix it.');
    doc.status = status;
    doc.note = status === 'REJECTED' ? note!.trim().slice(0, 200) : null;
    return view(await this.docs.save(doc));
  }

  /** Counts per owner, for the verification queue. */
  async summaryFor(ownerIds: string[]): Promise<Map<string, DocumentView[]>> {
    const out = new Map<string, DocumentView[]>();
    if (ownerIds.length === 0) return out;
    const rows = await this.docs.createQueryBuilder('d').where('d.ownerId IN (:...ids)', { ids: ownerIds }).orderBy('d.createdAt', 'DESC').getMany();
    for (const r of rows) out.set(r.ownerId, [...(out.get(r.ownerId) ?? []), view(r)]);
    return out;
  }

  async erase(ownerId: string): Promise<void> {
    for (const d of await this.docs.find({ where: { ownerId } })) await this.storage.deletePrivate(d.storageKey).catch(() => undefined);
    await this.docs.delete({ ownerId });
  }
}
