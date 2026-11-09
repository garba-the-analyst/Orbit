import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { In, Repository } from 'typeorm';
import { STORAGE, StorageProvider } from './storage.provider';
import { Upload } from './upload.entity';

export type UploadKind = 'avatar' | 'logo' | 'cover' | 'product' | 'vehicle';
export const UPLOAD_KINDS: UploadKind[] = ['avatar', 'logo', 'cover', 'product', 'vehicle'];

/** How each kind of picture is shaped. "cover" crops to fill the frame; "inside" keeps the whole picture. */
const SHAPES: Record<UploadKind, { w: number; h: number; fit: 'cover' | 'inside' }> = {
  avatar: { w: 512, h: 512, fit: 'cover' },
  logo: { w: 512, h: 512, fit: 'cover' },
  cover: { w: 1600, h: 640, fit: 'cover' },
  product: { w: 1600, h: 1600, fit: 'inside' },
  vehicle: { w: 1600, h: 1200, fit: 'inside' },
};
const THUMB = 480;

export interface UploadResult {
  url: string;
  thumb: string;
  width: number;
  height: number;
}

/** The smaller copy of an image sits next to it with a _t suffix. */
export const thumbOf = (url: string): string => url.replace(/\.webp$/, '_t.webp');

@Injectable()
export class UploadsService {
  constructor(
    @InjectRepository(Upload) private readonly uploads: Repository<Upload>,
    @Inject(STORAGE) private readonly storage: StorageProvider,
  ) {}

  /**
   * Validates that the bytes really are a supported image (we trust the content, never the filename or the
   * declared type), auto-rotates it, shrinks it, strips location and camera metadata, and stores a full-size and
   * a thumbnail copy as WebP.
   */
  async save(ownerId: string, kind: UploadKind, data: Buffer): Promise<UploadResult> {
    let format: string | undefined;
    try {
      format = (await sharp(data, { limitInputPixels: 50_000_000, failOn: 'error' }).metadata()).format;
    } catch {
      throw new BadRequestException('That file is not a picture we can read. Use a JPEG, PNG or WebP image.');
    }
    if (!format || !['jpeg', 'png', 'webp', 'gif', 'avif'].includes(format)) {
      throw new BadRequestException('Use a JPEG, PNG or WebP image.');
    }

    const shape = SHAPES[kind];
    const id = randomUUID();
    const folder = kind === 'avatar' || kind === 'logo' || kind === 'cover' ? 'profile' : kind;
    try {
      // .rotate() with no argument applies the EXIF orientation, then the metadata is dropped on output.
      const full = await sharp(data, { limitInputPixels: 50_000_000 })
        .rotate()
        .resize({ width: shape.w, height: shape.h, fit: shape.fit, withoutEnlargement: shape.fit === 'inside' })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true });
      const thumb = await sharp(full.data)
        .resize({ width: THUMB, height: THUMB, fit: kind === 'cover' ? 'cover' : 'inside', withoutEnlargement: true })
        .webp({ quality: 74 })
        .toBuffer();

      const url = await this.storage.put(`${folder}/${id}.webp`, full.data, 'image/webp');
      await this.storage.put(`${folder}/${id}_t.webp`, thumb, 'image/webp');
      await this.uploads.save(
        this.uploads.create({ ownerId, url, kind, width: full.info.width, height: full.info.height, bytes: full.data.length }),
      );
      return { url, thumb: thumbOf(url), width: full.info.width, height: full.info.height };
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException('We could not process that picture. Try a different one.');
    }
  }

  /**
   * Every image URL a client submits must be one this person uploaded. That stops anyone pointing a product or
   * profile at an outside address (tracking pixels, offensive content, or someone else's pictures).
   */
  async assertOwned(ownerId: string, urls: Array<string | null | undefined>): Promise<void> {
    const wanted = [...new Set(urls.filter((u): u is string => !!u))];
    if (wanted.length === 0) return;
    const found = await this.uploads.find({ where: { ownerId, url: In(wanted) }, select: { url: true } });
    const ok = new Set(found.map((f) => f.url));
    const bad = wanted.find((u) => !ok.has(u));
    if (bad) throw new BadRequestException('One of the pictures was not uploaded from your account. Upload it again.');
  }
}
