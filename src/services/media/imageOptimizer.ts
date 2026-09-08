/**
 * Client-Side Image Processing & Optimization Engine
 * 
 * Provides high-fidelity canvas processing, cropping, downscaling, and WebP compression
 * in the browser before direct upload to Cloudflare R2.
 */

export interface CropArea {
  x: number; // In pixels relative to natural image
  y: number;
  width: number;
  height: number;
}

export interface OptimizedResult {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  size: number;
  mimeType: string;
  aspectRatio: number;
}

export interface PostProcessedMedia {
  main: OptimizedResult;
  thumb: OptimizedResult;
  naturalAspectRatio: number;
  originalName: string;
  originalSize: number;
}

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/jpg',
];

const MAX_SOURCE_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB max source file

/**
 * Validates file format and size
 */
export function validateImageFile(file: File): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'No file selected.' };
  }

  const fileType = (file.type || '').toLowerCase();
  const fileName = file.name || '';
  const isAllowedType = ALLOWED_MIME_TYPES.includes(fileType) ||
    /\.(jpe?g|png|webp|avif)$/i.test(fileName);

  if (!isAllowedType) {
    return {
      valid: false,
      error: `Unsupported image format (${file.type || 'unknown'}). Please choose a JPEG, PNG, WebP, or AVIF image.`,
    };
  }

  if (file.size > MAX_SOURCE_FILE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File is too large (${sizeMb} MB). Maximum allowed upload size is 20 MB.`,
    };
  }

  return { valid: true };
}

/**
 * Loads an image from a File, Blob, or URL into an HTMLImageElement
 */
export function loadImageElement(source: File | Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    let objectUrl: string | null = null;
    if (typeof source === 'string') {
      img.src = source;
    } else {
      objectUrl = URL.createObjectURL(source);
      img.src = objectUrl;
    }

    img.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(img);
    };

    img.onerror = (err) => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to decode image data. Please ensure the file is not corrupted.'));
    };
  });
}

/**
 * Helper to convert canvas to WebP Blob (with JPEG fallback for legacy browsers)
 */
function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.85, mimeType = 'image/webp'): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          // Fallback to jpeg if webp canvas export is unsupported
          canvas.toBlob(
            (fallbackBlob) => {
              if (fallbackBlob) resolve(fallbackBlob);
              else reject(new Error('Failed to generate image buffer from canvas.'));
            },
            'image/jpeg',
            quality
          );
        }
      },
      mimeType,
      quality
    );
  });
}

/**
 * Crops and exports an exact rectangular area from an image to WebP format
 */
export async function cropAndExportWebP(
  img: HTMLImageElement,
  cropArea: CropArea,
  targetWidth: number,
  targetHeight: number,
  quality = 0.85
): Promise<OptimizedResult> {
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context is unavailable.');
  }

  // Smooth resampling
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(
    img,
    cropArea.x,
    cropArea.y,
    cropArea.width,
    cropArea.height,
    0,
    0,
    targetWidth,
    targetHeight
  );

  const blob = await canvasToBlob(canvas, quality, 'image/webp');
  const dataUrl = canvas.toDataURL('image/webp', quality);

  return {
    blob,
    dataUrl,
    width: targetWidth,
    height: targetHeight,
    size: blob.size,
    mimeType: blob.type || 'image/webp',
    aspectRatio: targetWidth / targetHeight,
  };
}

/**
 * Optimizes an Avatar to a 512x512 WebP image
 */
export async function optimizeAvatarImage(
  source: File | Blob | string,
  cropArea?: CropArea
): Promise<OptimizedResult> {
  const img = await loadImageElement(source);

  // If no explicit crop given, center square crop
  const naturalWidth = img.naturalWidth;
  const naturalHeight = img.naturalHeight;
  const side = Math.min(naturalWidth, naturalHeight);

  const finalCrop: CropArea = cropArea || {
    x: (naturalWidth - side) / 2,
    y: (naturalHeight - side) / 2,
    width: side,
    height: side,
  };

  return cropAndExportWebP(img, finalCrop, 512, 512, 0.88);
}

/**
 * Optimizes a Profile Cover / Banner to a 1600x500 WebP image (3.2:1 ratio)
 */
export async function optimizeCoverImage(
  source: File | Blob | string,
  cropArea?: CropArea
): Promise<OptimizedResult> {
  const img = await loadImageElement(source);

  const naturalWidth = img.naturalWidth;
  const naturalHeight = img.naturalHeight;
  const targetRatio = 1600 / 500; // 3.2

  let cropWidth = naturalWidth;
  let cropHeight = naturalWidth / targetRatio;

  if (cropHeight > naturalHeight) {
    cropHeight = naturalHeight;
    cropWidth = naturalHeight * targetRatio;
  }

  const finalCrop: CropArea = cropArea || {
    x: (naturalWidth - cropWidth) / 2,
    y: (naturalHeight - cropHeight) / 2,
    width: cropWidth,
    height: cropHeight,
  };

  return cropAndExportWebP(img, finalCrop, 1600, 500, 0.88);
}

/**
 * Processes a creative visual post:
 * 1. Generates high-resolution Display image (max long edge 2048px, preserving aspect ratio, WebP)
 * 2. Generates Feed Thumbnail (width 640px or natural width if smaller, preserving aspect ratio, WebP)
 * 3. Does not upscale smaller images
 */
export async function processPostMedia(file: File): Promise<PostProcessedMedia> {
  const validation = validateImageFile(file);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid image file.');
  }

  const img = await loadImageElement(file);
  const naturalWidth = img.naturalWidth;
  const naturalHeight = img.naturalHeight;
  const naturalAspectRatio = naturalWidth / naturalHeight;

  // --- 1. Main Display Asset ---
  const maxMainLongEdge = 2048;
  let mainWidth = naturalWidth;
  let mainHeight = naturalHeight;

  if (naturalWidth > maxMainLongEdge || naturalHeight > maxMainLongEdge) {
    if (naturalWidth >= naturalHeight) {
      mainWidth = maxMainLongEdge;
      mainHeight = Math.round(maxMainLongEdge / naturalAspectRatio);
    } else {
      mainHeight = maxMainLongEdge;
      mainWidth = Math.round(maxMainLongEdge * naturalAspectRatio);
    }
  }

  const mainCanvas = document.createElement('canvas');
  mainCanvas.width = mainWidth;
  mainCanvas.height = mainHeight;
  const mainCtx = mainCanvas.getContext('2d');
  if (!mainCtx) throw new Error('Failed to create canvas context.');

  mainCtx.imageSmoothingEnabled = true;
  mainCtx.imageSmoothingQuality = 'high';
  mainCtx.drawImage(img, 0, 0, naturalWidth, naturalHeight, 0, 0, mainWidth, mainHeight);

  const mainBlob = await canvasToBlob(mainCanvas, 0.85, 'image/webp');
  const mainDataUrl = mainCanvas.toDataURL('image/webp', 0.85);

  const mainResult: OptimizedResult = {
    blob: mainBlob,
    dataUrl: mainDataUrl,
    width: mainWidth,
    height: mainHeight,
    size: mainBlob.size,
    mimeType: mainBlob.type || 'image/webp',
    aspectRatio: naturalAspectRatio,
  };

  // --- 2. Feed Thumbnail Asset ---
  const targetThumbWidth = 640;
  let thumbWidth = Math.min(naturalWidth, targetThumbWidth);
  let thumbHeight = Math.round(thumbWidth / naturalAspectRatio);

  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = thumbWidth;
  thumbCanvas.height = thumbHeight;
  const thumbCtx = thumbCanvas.getContext('2d');
  if (!thumbCtx) throw new Error('Failed to create thumbnail context.');

  thumbCtx.imageSmoothingEnabled = true;
  thumbCtx.imageSmoothingQuality = 'high';
  thumbCtx.drawImage(img, 0, 0, naturalWidth, naturalHeight, 0, 0, thumbWidth, thumbHeight);

  const thumbBlob = await canvasToBlob(thumbCanvas, 0.80, 'image/webp');
  const thumbDataUrl = thumbCanvas.toDataURL('image/webp', 0.80);

  const thumbResult: OptimizedResult = {
    blob: thumbBlob,
    dataUrl: thumbDataUrl,
    width: thumbWidth,
    height: thumbHeight,
    size: thumbBlob.size,
    mimeType: thumbBlob.type || 'image/webp',
    aspectRatio: naturalAspectRatio,
  };

  return {
    main: mainResult,
    thumb: thumbResult,
    naturalAspectRatio,
    originalName: file.name,
    originalSize: file.size,
  };
}
