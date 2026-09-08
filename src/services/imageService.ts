/**
 * Provider-Independent Image Architecture
 *
 * Provides utilities for handling images from any source (direct links, Google Drive,
 * Cloudinary, AWS S3/Cloudflare R2, Unsplash, etc.) without coupling the frontend to any single host.
 */

export interface ImageFormatOptions {
  width?: number;
  quality?: number;
  format?: 'webp' | 'auto' | 'jpg';
}

/**
 * Standard placeholder when an image fails to load or while loading.
 */
export const DEFAULT_FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1000&auto=format&fit=crop';

/**
 * Generates an optimized thumbnail or delivery URL depending on the source host.
 * If the provider supports dynamic resizing (e.g. Unsplash, Cloudinary), it applies optimization.
 * Otherwise, it returns the direct URL safely.
 */
export function getOptimizedImageUrl(
  url: string,
  options: ImageFormatOptions = { width: 600, quality: 80, format: 'auto' }
): string {
  if (!url) return DEFAULT_FALLBACK_IMAGE;

  try {
    const parsedUrl = new URL(url);

    // Unsplash dynamic optimization support
    if (parsedUrl.hostname.includes('unsplash.com')) {
      parsedUrl.searchParams.set('auto', options.format || 'format');
      if (options.width) parsedUrl.searchParams.set('w', options.width.toString());
      if (options.quality) parsedUrl.searchParams.set('q', options.quality.toString());
      return parsedUrl.toString();
    }

    // Google Drive direct view conversion (if a user shares a Google Drive file link)
    if (parsedUrl.hostname.includes('drive.google.com')) {
      const fileIdMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
      if (fileIdMatch && fileIdMatch[1]) {
        return `https://drive.google.com/uc?export=view&id=${fileIdMatch[1]}`;
      }
    }

    // Default provider-independent passthrough
    return url;
  } catch {
    return url;
  }
}

/**
 * Validates whether a provided string is a syntactically valid URL and likely an image.
 */
export function validateImageUrl(url: string): { valid: boolean; error?: string } {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'Image URL is required' };
  }

  const trimmed = url.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return { valid: false, error: 'URL must start with http:// or https://' };
  }

  try {
    new URL(trimmed);
    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Calculates estimated aspect ratio (width / height) or returns a sensible default (0.75 for portrait).
 */
export function estimateAspectRatio(aspectRatio?: number): number {
  if (aspectRatio && aspectRatio > 0.2 && aspectRatio < 4.0) {
    return aspectRatio;
  }
  return 0.75; // Standard 3:4 portrait default for creative posts
}
