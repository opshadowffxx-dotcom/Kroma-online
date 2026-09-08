/**
 * User-Safe Upload Status Abstraction & Clean Error Mapping
 *
 * Guarantees that internal backend / infrastructure details (R2, Cloudflare, S3,
 * presigned URLs, bucket names, object keys, token verifications, etc.) are strictly
 * hidden from the user-facing UI and replaced with simple, premium product language.
 */

export type UploadStage =
  | 'idle'
  | 'preparing'
  | 'optimizing'
  | 'uploading'
  | 'saving'
  | 'publishing'
  | 'complete';

export type UploadContext = 'avatar' | 'cover' | 'post' | 'general';

/**
 * Maps internal stages to clean, user-friendly labels.
 */
export function getUploadStageLabel(
  stage: UploadStage,
  context: UploadContext = 'general'
): string {
  switch (stage) {
    case 'preparing':
      return 'Preparing image…';
    case 'optimizing':
      return context === 'post' ? 'Optimizing…' : 'Optimizing image…';
    case 'uploading':
      if (context === 'cover') return 'Uploading cover…';
      return 'Uploading…';
    case 'saving':
      if (context === 'avatar') return 'Saving profile updates...';
      if (context === 'cover') return 'Saving changes...';
      if (context === 'post') return 'Saving…';
      return 'Saving changes…';
    case 'publishing':
      return 'Publishing…';
    case 'complete':
      if (context === 'post') return 'Published';
      return 'Done';
    case 'idle':
    default:
      return '';
  }
}

/**
 * Translates technical error messages into clean, user-facing error copy.
 */
export function toUserSafeErrorMessage(error: unknown, fallback?: string): string {
  if (!error) {
    return fallback || 'Something went wrong. Please try again.';
  }

  const raw =
    typeof error === 'string'
      ? error
      : (error as any)?.message || String(error);

  const lower = raw.toLowerCase();

  // Clear specific user-facing auth messages from mediaService
  if (
    raw.includes('You must be signed in') ||
    raw.includes('Could not verify your session')
  ) {
    return raw;
  }

  // Expired session / Auth token
  if (
    lower.includes('token') ||
    lower.includes('expired') ||
    lower.includes('auth') ||
    lower.includes('sign in') ||
    lower.includes('logged in') ||
    lower.includes('unauthenticated') ||
    lower.includes('unauthorized')
  ) {
    return 'Your session has expired. Please sign in again.';
  }

  // Permissions / Access
  if (
    lower.includes('permission') ||
    lower.includes('accessdenied') ||
    lower.includes('forbidden') ||
    lower.includes('security rule')
  ) {
    return "We couldn't save your changes. Please check your permissions and try again.";
  }

  // Presign / Preparation
  if (
    lower.includes('presign') ||
    lower.includes('prepare') ||
    lower.includes('credential') ||
    lower.includes('endpoint')
  ) {
    return "We couldn't prepare your upload. Please try again.";
  }

  // Storage / Uploading / S3 / R2 / Network
  if (
    lower.includes('r2') ||
    lower.includes('s3') ||
    lower.includes('cloudflare') ||
    lower.includes('putobject') ||
    lower.includes('bucket') ||
    lower.includes('object key') ||
    lower.includes('fetch') ||
    lower.includes('upload') ||
    lower.includes('network')
  ) {
    return "Your image couldn't be uploaded. Please try again.";
  }

  // File validation
  if (lower.includes('too large') || lower.includes('size')) {
    return 'File is too large. Maximum allowed upload size is 20 MB.';
  }

  if (lower.includes('unsupported') || lower.includes('format') || lower.includes('mime')) {
    return 'Unsupported file format. Please choose a JPEG, PNG, WebP, or AVIF image.';
  }

  return fallback || "We couldn't complete the upload. Please try again.";
}
