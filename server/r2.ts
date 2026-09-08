import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import { getR2Config, validateR2Config } from './config';

let s3ClientInstance: S3Client | null = null;
let cachedEndpoint = '';

export function getS3Client(): S3Client {
  const config = getR2Config();
  if (!s3ClientInstance || cachedEndpoint !== config.endpoint) {
    const validation = validateR2Config(config);
    if (!validation.valid) {
      console.error(
        `[Cloudflare R2] Configuration missing. Required environment variable(s) not set: ${validation.missing.join(', ')}`
      );
      throw new Error(
        `Cloudflare R2 storage is not configured. Missing required environment variable(s): ${validation.missing.join(', ')}`
      );
    }

    cachedEndpoint = config.endpoint;
    s3ClientInstance = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }
  return s3ClientInstance;
}

export type MediaUploadType = 'avatar' | 'cover' | 'post-main' | 'post-thumb';

export interface PresignUploadRequest {
  uid: string;
  type: MediaUploadType;
  postId?: string;
  contentType?: string;
  customFilename?: string;
}

export interface PresignedUploadResult {
  uploadUrl: string;
  objectKey: string;
  publicUrl: string;
  expiresInSeconds: number;
}

/**
 * Generates clean, predictable, safe storage paths according to KROMA architecture:
 * Profile avatars: users/{uid}/avatar/{unique-id}.webp
 * Profile covers: users/{uid}/cover/{unique-id}.webp
 * Post main images: posts/{uid}/{postId}/main-{unique-id}.webp
 * Post thumbnails: posts/{uid}/{postId}/thumb-{unique-id}.webp
 */
export function buildMediaObjectKey(
  uid: string,
  type: MediaUploadType,
  postId?: string
): string {
  const uniqueId = crypto.randomUUID();

  switch (type) {
    case 'avatar':
      return `users/${uid}/avatar/${uniqueId}.webp`;
    case 'cover':
      return `users/${uid}/cover/${uniqueId}.webp`;
    case 'post-main':
      if (!postId) {
        throw new Error('postId is required for post media uploads');
      }
      return `posts/${uid}/${postId}/main-${uniqueId}.webp`;
    case 'post-thumb':
      if (!postId) {
        throw new Error('postId is required for post media uploads');
      }
      return `posts/${uid}/${postId}/thumb-${uniqueId}.webp`;
    default:
      throw new Error(`Unsupported upload type: ${type}`);
  }
}

/**
 * Directly uploads a buffer to R2 on behalf of the user.
 * Bypasses all browser CORS and direct S3 presigned URL issues.
 */
export async function uploadBufferToR2(params: {
  uid: string;
  type: MediaUploadType;
  postId?: string;
  buffer: Buffer;
  contentType?: string;
}): Promise<{ objectKey: string; publicUrl: string }> {
  const config = getR2Config();
  const s3 = getS3Client();

  const objectKey = buildMediaObjectKey(params.uid, params.type, params.postId);
  const contentType = params.contentType || 'image/webp';

  const command = new PutObjectCommand({
    Bucket: config.bucketName,
    Key: objectKey,
    Body: params.buffer,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  });

  await s3.send(command);

  const publicUrl = `${config.publicUrl}/${objectKey}`;

  return {
    objectKey,
    publicUrl,
  };
}

/**
 * Creates a short-lived presigned upload URL for direct browser -> R2 uploads.
 */
export async function createPresignedUploadUrl(
  req: PresignUploadRequest
): Promise<PresignedUploadResult> {
  const config = getR2Config();
  const s3 = getS3Client();

  const objectKey = buildMediaObjectKey(req.uid, req.type, req.postId);
  const contentType = req.contentType || 'image/webp';
  const expiresInSeconds = 300; // 5 minutes expiration

  const command = new PutObjectCommand({
    Bucket: config.bucketName,
    Key: objectKey,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3, command, {
    expiresIn: expiresInSeconds,
  });

  const publicUrl = `${config.publicUrl}/${objectKey}`;

  return {
    uploadUrl,
    objectKey,
    publicUrl,
    expiresInSeconds,
  };
}

/**
 * Securely deletes an object from R2 after verifying ownership of the object key path.
 */
export async function deleteR2MediaObject(uid: string, objectKey: string): Promise<boolean> {
  const config = getR2Config();
  const s3 = getS3Client();

  // Strict path authorization: key MUST belong to the authenticated user's uid
  const isAllowed =
    objectKey.startsWith(`users/${uid}/`) ||
    objectKey.startsWith(`posts/${uid}/`);

  if (!isAllowed) {
    throw new Error('Unauthorized: You cannot delete media assets that you do not own.');
  }

  const command = new DeleteObjectCommand({
    Bucket: config.bucketName,
    Key: objectKey,
  });

  await s3.send(command);
  return true;
}
