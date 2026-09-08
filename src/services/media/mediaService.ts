/**
 * Client Media Service & Cloudflare R2 Abstraction Layer
 * 
 * Provides a clean API for components to upload avatars, banners, and posts
 * without knowing low-level S3/R2 details.
 */

import { getFirebaseAuth } from '../firebase';

export interface MediaUploadResponse {
  publicUrl: string;
  objectKey: string;
}

export interface PostMediaUploadResponse {
  imageUrl: string;
  thumbnailUrl: string;
  imageObjectKey: string;
  thumbnailObjectKey: string;
}

export interface PresignApiResponse {
  success: boolean;
  uploadUrl: string;
  objectKey: string;
  publicUrl: string;
  expiresInSeconds: number;
}

/**
 * Central Media Base URL abstraction.
 * To point to a custom domain (e.g. https://media.kroma.art),
 * update this or provide VITE_MEDIA_PUBLIC_URL.
 */
export const MEDIA_PUBLIC_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_MEDIA_PUBLIC_URL) ||
  'https://pub-cc332a1606c04148a3143d3d40e7ba52.r2.dev';

/**
 * Returns a normalized public media URL for an object key or returns the full URL if already absolute.
 */
export function getPublicMediaUrl(keyOrUrl: string): string {
  if (!keyOrUrl) return '';
  if (keyOrUrl.startsWith('http://') || keyOrUrl.startsWith('https://')) {
    return keyOrUrl;
  }
  const cleanKey = keyOrUrl.replace(/^\//, '');
  return `${MEDIA_PUBLIC_BASE_URL.replace(/\/$/, '')}/${cleanKey}`;
}

/**
 * Retrieves the current Firebase Auth ID token or safe session token
 */
async function getAuthToken(): Promise<string> {
  const auth = getFirebaseAuth();
  if (!auth?.currentUser) {
    throw new Error('You must be signed in to upload media. Please sign in and try again.');
  }
  try {
    return await auth.currentUser.getIdToken(true); // force refresh to avoid stale/expired tokens
  } catch {
    throw new Error('Could not verify your session. Please sign in again and retry.');
  }
}

/**
 * Converts a Blob to a base64 Data URL string
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read media buffer'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to parse file into buffer'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Requests a short-lived presigned upload URL from the secure server endpoint
 */
export async function requestPresignedUrl(
  type: 'avatar' | 'cover' | 'post-main' | 'post-thumb',
  postId?: string,
  contentType = 'image/webp'
): Promise<PresignApiResponse> {
  const token = await getAuthToken();

  const response = await fetch('/api/media/presign', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      type,
      postId,
      contentType,
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(
      errData.message || `Failed to prepare secure upload (${response.status} ${response.statusText})`
    );
  }

  return response.json();
}

/**
 * Uploads a Blob directly to Cloudflare R2 using the presigned URL
 */
export async function uploadBlobToPresignedUrl(
  uploadUrl: string,
  blob: Blob,
  contentType = 'image/webp'
): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
    body: blob,
  });

  if (!response.ok) {
    throw new Error(
      `Direct media upload to storage failed with status ${response.status} (${response.statusText}).`
    );
  }
}

/**
 * Direct Server-Side Upload to Cloudflare R2
 * Bypasses all browser CORS and presigned PUT restrictions.
 */
export async function uploadMediaDirectly(
  type: 'avatar' | 'cover' | 'post-main' | 'post-thumb',
  blob: Blob,
  postId?: string
): Promise<MediaUploadResponse> {
  const token = await getAuthToken();
  const base64Data = await blobToBase64(blob);

  const response = await fetch('/api/media/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      type,
      postId,
      contentType: blob.type || 'image/webp',
      base64Data,
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(
      errData.message || `Upload failed with status ${response.status}`
    );
  }

  const data = await response.json();
  return {
    publicUrl: data.publicUrl,
    objectKey: data.objectKey,
  };
}

const ALLOW_LOCAL_MEDIA_FALLBACK =
  typeof import.meta !== 'undefined' &&
  Boolean(import.meta.env?.DEV) &&
  import.meta.env?.VITE_ALLOW_LOCAL_MEDIA_FALLBACK === 'true';

/**
 * Uploads a user Profile Avatar to R2 with controlled fallback
 */
export async function uploadAvatarMedia(blob: Blob): Promise<MediaUploadResponse> {
  try {
    const presign = await requestPresignedUrl('avatar', undefined, blob.type || 'image/webp');
    await uploadBlobToPresignedUrl(presign.uploadUrl, blob, blob.type || 'image/webp');
    return {
      publicUrl: presign.publicUrl,
      objectKey: presign.objectKey,
    };
  } catch (presignErr: any) {
    const isAuthError =
      presignErr?.message?.includes('signed in') ||
      presignErr?.message?.includes('session') ||
      presignErr?.message?.includes('Unauthorized') ||
      presignErr?.message?.includes('ID token');

    if (isAuthError) {
      throw presignErr;
    }

    console.warn('Presigned avatar upload failed, trying direct upload:', presignErr);
    try {
      return await uploadMediaDirectly('avatar', blob);
    } catch (directErr: any) {
      console.warn('Direct avatar upload also failed:', directErr);
      if (ALLOW_LOCAL_MEDIA_FALLBACK) {
        const dataUrl = await blobToBase64(blob);
        return {
          publicUrl: dataUrl,
          objectKey: `local/avatar-${Date.now()}.webp`,
        };
      }
      throw new Error(directErr?.message || presignErr?.message || "We couldn't upload your image. Please try again.");
    }
  }
}

/**
 * Uploads a user Profile Cover / Banner to R2 with controlled fallback
 */
export async function uploadCoverMedia(blob: Blob): Promise<MediaUploadResponse> {
  try {
    const presign = await requestPresignedUrl('cover', undefined, blob.type || 'image/webp');
    await uploadBlobToPresignedUrl(presign.uploadUrl, blob, blob.type || 'image/webp');
    return {
      publicUrl: presign.publicUrl,
      objectKey: presign.objectKey,
    };
  } catch (presignErr: any) {
    const isAuthError =
      presignErr?.message?.includes('signed in') ||
      presignErr?.message?.includes('session') ||
      presignErr?.message?.includes('Unauthorized') ||
      presignErr?.message?.includes('ID token');

    if (isAuthError) {
      throw presignErr;
    }

    console.warn('Presigned cover upload failed, trying direct upload:', presignErr);
    try {
      return await uploadMediaDirectly('cover', blob);
    } catch (directErr: any) {
      console.warn('Direct cover upload also failed:', directErr);
      if (ALLOW_LOCAL_MEDIA_FALLBACK) {
        const dataUrl = await blobToBase64(blob);
        return {
          publicUrl: dataUrl,
          objectKey: `local/cover-${Date.now()}.webp`,
        };
      }
      throw new Error(directErr?.message || presignErr?.message || "We couldn't upload your image. Please try again.");
    }
  }
}

/**
 * Uploads both Main display image and Feed Thumbnail for a Post directly to R2.
 * Prefers direct client-to-R2 presigned upload to avoid proxying large media through serverless functions.
 */
export async function uploadPostMediaBundle(
  mainBlob: Blob,
  thumbBlob: Blob,
  postId: string,
  onStatusChange?: (statusText: string) => void
): Promise<PostMediaUploadResponse> {
  onStatusChange?.('Uploading…');

  try {
    // 1. Direct browser-to-R2 presigned upload (fastest, avoids proxying media through serverless)
    const [mainPresign, thumbPresign] = await Promise.all([
      requestPresignedUrl('post-main', postId, mainBlob.type || 'image/webp'),
      requestPresignedUrl('post-thumb', postId, thumbBlob.type || 'image/webp'),
    ]);

    onStatusChange?.('Uploading…');
    await Promise.all([
      uploadBlobToPresignedUrl(mainPresign.uploadUrl, mainBlob, mainBlob.type || 'image/webp'),
      uploadBlobToPresignedUrl(thumbPresign.uploadUrl, thumbBlob, thumbBlob.type || 'image/webp'),
    ]);

    return {
      imageUrl: mainPresign.publicUrl,
      thumbnailUrl: thumbPresign.publicUrl,
      imageObjectKey: mainPresign.objectKey,
      thumbnailObjectKey: thumbPresign.objectKey,
    };
  } catch (presignErr: any) {
    const isAuthError =
      presignErr?.message?.includes('signed in') ||
      presignErr?.message?.includes('session') ||
      presignErr?.message?.includes('Unauthorized') ||
      presignErr?.message?.includes('ID token');

    if (isAuthError) {
      throw presignErr;
    }

    console.warn('Presigned bundle upload failed, falling back to server-side upload:', presignErr);
    try {
      onStatusChange?.('Uploading…');
      const [mainRes, thumbRes] = await Promise.all([
        uploadMediaDirectly('post-main', mainBlob, postId),
        uploadMediaDirectly('post-thumb', thumbBlob, postId),
      ]);

      return {
        imageUrl: mainRes.publicUrl,
        thumbnailUrl: thumbRes.publicUrl,
        imageObjectKey: mainRes.objectKey,
        thumbnailObjectKey: thumbRes.objectKey,
      };
    } catch (directErr: any) {
      console.warn('Server upload also failed:', directErr);
      if (ALLOW_LOCAL_MEDIA_FALLBACK) {
        const [mainDataUrl, thumbDataUrl] = await Promise.all([
          blobToBase64(mainBlob),
          blobToBase64(thumbBlob),
        ]);
        return {
          imageUrl: mainDataUrl,
          thumbnailUrl: thumbDataUrl,
          imageObjectKey: `local/${postId}/main.webp`,
          thumbnailObjectKey: `local/${postId}/thumb.webp`,
        };
      }
      throw new Error(directErr?.message || presignErr?.message || "We couldn't upload your image. Please try again.");
    }
  }
}

/**
 * Securely requests deletion of a media asset from R2
 */
export async function deleteMediaAsset(objectKey: string): Promise<void> {
  if (!objectKey) return;
  try {
    const token = await getAuthToken();

    const response = await fetch('/api/media/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ objectKey }),
    });

    if (!response.ok) {
      console.warn(`Media asset deletion error: ${response.status}`);
    }
  } catch (err) {
    console.warn('Could not delete media asset:', err);
  }
}
