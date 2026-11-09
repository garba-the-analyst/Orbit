import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { config } from '../config/config';

/**
 * Where uploaded files live. The app only ever talks to this interface.
 *
 * Two areas:
 *  - public  : pictures (avatars, logos, product photos). Each file has a URL anyone can open.
 *  - private : documents (ID, licences, vehicle papers). Never reachable by URL; only the API can read them, and
 *              only an admin is ever given them.
 */
export interface StorageProvider {
  /** Stores a public file under a relative key (like "product/abc.webp") and returns its URL. */
  put(key: string, data: Buffer, contentType?: string): Promise<string>;
  delete(key: string): Promise<void>;
  putPrivate(key: string, data: Buffer, contentType: string): Promise<void>;
  getPrivate(key: string): Promise<Buffer>;
  deletePrivate(key: string): Promise<void>;
}

export const STORAGE = Symbol('STORAGE');

/** Resolves a key under a root folder and refuses anything that would escape it (../ tricks). */
function safePath(root: string, key: string): string {
  const base = resolve(root);
  const full = resolve(join(base, key));
  if (full !== base && !full.startsWith(base + sep)) throw new Error('Invalid storage key');
  return full;
}

/** Files on this machine's disk. Simple and fine for one server with a persistent disk. */
@Injectable()
export class LocalStorageProvider implements StorageProvider {
  async put(key: string, data: Buffer): Promise<string> {
    const file = safePath(config.uploads.dir, key);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, data);
    return `${config.uploads.publicBase}/uploads/${key}`;
  }

  async delete(key: string): Promise<void> {
    await rm(safePath(config.uploads.dir, key), { force: true });
  }

  async putPrivate(key: string, data: Buffer): Promise<void> {
    const file = safePath(config.uploads.privateDir, key);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, data);
  }

  getPrivate(key: string): Promise<Buffer> {
    return readFile(safePath(config.uploads.privateDir, key));
  }

  async deletePrivate(key: string): Promise<void> {
    await rm(safePath(config.uploads.privateDir, key), { force: true });
  }
}

/** Any S3-compatible bucket: Cloudflare R2, Amazon S3, Supabase Storage, MinIO. */
@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly s3 = config.storage.s3;

  constructor() {
    const s3 = this.s3;
    if (!s3.endpoint || !s3.publicBucket || !s3.privateBucket || !s3.accessKeyId || !s3.secretAccessKey || !s3.publicBase) {
      throw new Error(
        'STORAGE_DRIVER=s3 needs S3_ENDPOINT, S3_PUBLIC_BUCKET, S3_PRIVATE_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY and S3_PUBLIC_BASE.',
      );
    }
    this.client = new S3Client({
      region: s3.region,
      endpoint: s3.endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey },
    });
  }

  async put(key: string, data: Buffer, contentType = 'image/webp'): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.s3.publicBucket, Key: key, Body: data, ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable', // file names are random and never reused
      }),
    );
    return `${this.s3.publicBase}/${key}`;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.s3.publicBucket, Key: key }));
  }

  async putPrivate(key: string, data: Buffer, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.s3.privateBucket, Key: key, Body: data, ContentType: contentType }));
  }

  async getPrivate(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.s3.privateBucket, Key: key }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }

  async deletePrivate(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.s3.privateBucket, Key: key }));
  }
}

/** Picks the provider from STORAGE_DRIVER. */
export const storageFactory = () => (config.storage.driver === 's3' ? new S3StorageProvider() : new LocalStorageProvider());
