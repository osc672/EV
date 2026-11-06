import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env';
import { logger } from './logger';

export interface StoredFile {
  key: string;
  url: string;
  size: number;
  contentType: string;
}

const s3Enabled = Boolean(env.S3_ENDPOINT && env.S3_ACCESS_KEY && env.S3_SECRET_KEY);

let s3: S3Client | null = null;
if (s3Enabled) {
  s3 = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY!,
      secretAccessKey: env.S3_SECRET_KEY!,
    },
  });
}

function makeKey(folder: string, ext: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const id = crypto.randomUUID();
  return `${folder}/${date}/${id}.${ext}`;
}

/** Upload a processed buffer to S3-compatible storage, or local disk in dev. */
export async function uploadBuffer(
  buffer: Buffer,
  folder: string,
  contentType: string,
  ext: string,
  customBaseUrl?: string,
): Promise<StoredFile> {
  const key = makeKey(folder, ext);

  if (s3) {
    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: env.S3_BUCKET,
          Key: key,
          Body: buffer,
          ContentType: contentType,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
      const base = env.S3_PUBLIC_BASE_URL || `${env.S3_ENDPOINT}/${env.S3_BUCKET}`;
      return { key, url: `${base}/${key}`, size: buffer.length, contentType };
    } catch (s3Error) {
      logger.warn('s3_upload_failed_falling_back_to_local', { error: (s3Error as Error)?.message });
    }
  }

  // Local disk storage fallback for development
  const localPath = path.join(process.cwd(), 'uploads', key);
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  await fs.writeFile(localPath, buffer);
  const base = customBaseUrl || `http://localhost:${env.PORT}/uploads`;
  logger.info('file_stored_local', { key, url: `${base}/${key}` });
  return { key, url: `${base}/${key}`, size: buffer.length, contentType };
}

export const storageBackend = s3Enabled ? 's3' : 'local';
