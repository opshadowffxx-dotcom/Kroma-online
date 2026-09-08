import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Upload,
  Camera,
  Check,
  AlertCircle,
  Sparkles,
  Move,
  RefreshCw,
} from 'lucide-react';
import { validateImageFile, loadImageElement } from '../../services/media/imageOptimizer';
import { uploadAvatarMedia, uploadCoverMedia } from '../../services/media/mediaService';
import { toUserSafeErrorMessage, getUploadStageLabel } from '../../services/media/uploadStatus';

export type CropMode = 'avatar' | 'cover';

interface ImageCropperModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: CropMode;
  initialImageFile?: File | null;
  onSaveSuccess: (result: { publicUrl: string; objectKey: string }) => Promise<void> | void;
}

export const ImageCropperModal: React.FC<ImageCropperModalProps> = ({
  isOpen,
  onClose,
  mode,
  initialImageFile,
  onSaveSuccess,
}) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [naturalWidth, setNaturalWidth] = useState<number>(0);
  const [naturalHeight, setNaturalHeight] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);

  const isAvatar = mode === 'avatar';
  const targetAspect = isAvatar ? 1.0 : 1600 / 500; // 3.2:1
  const outputWidth = isAvatar ? 512 : 1600;
  const outputHeight = isAvatar ? 512 : 500;

  // Handle Initial File Load
  useEffect(() => {
    if (initialImageFile) {
      handleFileSelected(initialImageFile);
    }
  }, [initialImageFile]);

  // Reset state on modal open/close
  useEffect(() => {
    if (!isOpen) {
      setImageSrc(null);
      setZoom(1);
      setRotation(0);
      setPosition({ x: 0, y: 0 });
      setErrorMessage(null);
      setIsProcessing(false);
      loadedImageRef.current = null;
    }
  }, [isOpen]);

  const handleFileSelected = (file: File) => {
    setErrorMessage(null);
    const val = validateImageFile(file);
    if (!val.valid) {
      setErrorMessage(val.error || 'Invalid file format.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const src = reader.result as string;
      try {
        const img = await loadImageElement(src);
        loadedImageRef.current = img;
        setNaturalWidth(img.naturalWidth);
        setNaturalHeight(img.naturalHeight);
        setImageSrc(src);
        setZoom(1);
        setRotation(0);
        setPosition({ x: 0, y: 0 });
      } catch (err: any) {
        setErrorMessage('Failed to decode image data.');
      }
    };
    reader.onerror = () => {
      setErrorMessage('Could not read selected file.');
    };
    reader.readAsDataURL(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  };

  // Drag & Reposition Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!imageSrc || isProcessing) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch Handlers for Mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!imageSrc || isProcessing || e.touches.length === 0) return;
    setIsDragging(true);
    setDragStart({
      x: e.touches[0].clientX - position.x,
      y: e.touches[0].clientY - position.y,
    });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length === 0) return;
    setPosition({
      x: e.touches[0].clientX - dragStart.x,
      y: e.touches[0].clientY - dragStart.y,
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    if (!imageSrc || isProcessing) return;
    e.preventDefault();
    const delta = e.deltaY * -0.002;
    setZoom(prev => Math.min(3.5, Math.max(0.8, prev + delta)));
  };

  // Generate Final WebP Output and Upload
  const handleSaveAndUpload = async () => {
    if (!imageSrc || !loadedImageRef.current || isProcessing) return;

    setIsProcessing(true);
    setErrorMessage(null);
    setProcessingStatus('Preparing image…');

    try {
      const img = loadedImageRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) throw new Error('Could not get canvas context');

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Fill canvas background if transparent
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, outputWidth, outputHeight);

      // Translate to canvas center
      ctx.translate(outputWidth / 2, outputHeight / 2);
      ctx.rotate((rotation * Math.PI) / 180);

      // Calculate scale
      const containerBox = containerRef.current?.getBoundingClientRect();
      const containerW = containerBox?.width || 320;
      const containerH = containerBox?.height || (isAvatar ? 320 : 100);

      const baseScale = Math.max(containerW / img.naturalWidth, containerH / img.naturalHeight);
      const scaleMultiplier = outputWidth / containerW;
      const drawScale = baseScale * zoom * scaleMultiplier;

      const drawW = img.naturalWidth * drawScale;
      const drawH = img.naturalHeight * drawScale;
      const drawX = -drawW / 2 + position.x * scaleMultiplier;
      const drawY = -drawH / 2 + position.y * scaleMultiplier;

      ctx.drawImage(img, drawX, drawY, drawW, drawH);

      // Convert to WebP blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          b => (b ? resolve(b) : reject(new Error('Failed to generate image buffer.'))),
          'image/webp',
          0.88
        );
      });

      setProcessingStatus(isAvatar ? 'Uploading…' : 'Uploading cover…');

      // Upload media
      let uploadRes: { publicUrl: string; objectKey: string };
      if (isAvatar) {
        uploadRes = await uploadAvatarMedia(blob);
      } else {
        uploadRes = await uploadCoverMedia(blob);
      }

      setProcessingStatus(isAvatar ? 'Saving profile updates...' : 'Saving changes...');
      await onSaveSuccess(uploadRes);

      setIsProcessing(false);
      onClose();
    } catch (err: any) {
      console.error('Cropper upload error:', err);
      setIsProcessing(false);
      setErrorMessage(
        toUserSafeErrorMessage(err, "Your image couldn't be uploaded. Please try again.")
      );
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div
        id="modal-image-cropper"
        className="relative w-full max-w-lg bg-surface rounded-3xl overflow-hidden shadow-premium border border-border my-auto flex flex-col"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-semibold text-text-primary">
                {isAvatar ? 'Update Profile Photo' : 'Update Profile Cover'}
              </h2>
              <p className="text-[11px] text-text-muted">
                {isAvatar
                  ? 'Reposition and crop your 512×512 creator avatar'
                  : 'Reposition and crop your 1600×500 header banner'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isProcessing}
            className="w-8 h-8 rounded-full bg-surface-elevated flex items-center justify-center text-text-muted hover:text-text-primary transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Hidden inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="hidden"
          onChange={handleFileInputChange}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="user"
          className="hidden"
          onChange={handleFileInputChange}
        />

        {/* Body Content */}
        <div className="p-4 sm:p-6 space-y-4">
          {!imageSrc ? (
            /* Upload Picker View */
            <div className="border-2 border-dashed border-border rounded-2xl p-6 sm:p-8 text-center space-y-4 bg-surface-elevated">
              <div className="w-12 h-12 rounded-full bg-surface mx-auto flex items-center justify-center text-text-secondary border border-border">
                <Upload className="w-6 h-6" />
              </div>

              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-1">
                  Choose your {isAvatar ? 'avatar' : 'banner'} image
                </h3>
                <p className="text-xs text-text-muted max-w-xs mx-auto">
                  Supports JPG, PNG, WebP up to 20MB. Automatically optimized to WebP.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  id="btn-cropper-browse"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-accent hover:bg-accent-hover text-white text-xs font-semibold transition-colors shadow-soft cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Select from Device</span>
                </button>

                <button
                  type="button"
                  id="btn-cropper-camera"
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-surface border border-border text-text-secondary hover:text-text-primary text-xs font-semibold hover:bg-surface-elevated transition-colors cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Take Photo</span>
                </button>
              </div>
            </div>
          ) : (
            /* Interactive Crop / Pan / Zoom View */
            <div className="space-y-4">
              {/* Canvas viewport container */}
              <div
                ref={containerRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onWheel={handleWheel}
                className={`relative w-full mx-auto overflow-hidden bg-neutral-950 border border-border select-none cursor-grab active:cursor-grabbing ${
                  isAvatar ? 'h-64 sm:h-72 rounded-full max-w-[288px]' : 'h-40 sm:h-48 rounded-2xl'
                }`}
              >
                {/* Guide overlay */}
                <div className="absolute inset-0 pointer-events-none border-2 border-white/20 z-10" />

                {/* Display Image Element with dynamic transform */}
                <div
                  className="w-full h-full flex items-center justify-center"
                  style={{
                    transform: `translate(${position.x}px, ${position.y}px) rotate(${rotation}deg) scale(${zoom})`,
                    transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                  }}
                >
                  <img
                    src={imageSrc}
                    alt="Crop preview"
                    className="max-w-none pointer-events-none"
                    style={{
                      width: isAvatar ? '100%' : '100%',
                      height: isAvatar ? '100%' : '100%',
                      objectFit: 'cover',
                    }}
                  />
                </div>

                {/* Reposition hint badge */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 pointer-events-none z-20 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-[10px] text-white/90 flex items-center gap-1">
                  <Move className="w-3 h-3" />
                  <span>Drag to reposition</span>
                </div>
              </div>

              {/* Controls strip */}
              <div className="p-3.5 rounded-2xl bg-surface-elevated border border-border space-y-3">
                {/* Zoom Slider */}
                <div className="flex items-center gap-3">
                  <ZoomOut className="w-4 h-4 text-text-muted shrink-0" />
                  <input
                    type="range"
                    min="0.8"
                    max="3.0"
                    step="0.05"
                    value={zoom}
                    onChange={e => setZoom(parseFloat(e.target.value))}
                    className="w-full accent-accent h-1.5 bg-surface border border-border rounded-lg appearance-none cursor-pointer"
                  />
                  <ZoomIn className="w-4 h-4 text-text-muted shrink-0" />
                </div>

                {/* Auxiliary controls: Rotate, Reset, Change Image */}
                <div className="flex items-center justify-between pt-1 text-xs">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setRotation(r => (r + 90) % 360)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors cursor-pointer text-[11px]"
                    >
                      <RotateCw className="w-3 h-3" />
                      <span>Rotate</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setZoom(1);
                        setRotation(0);
                        setPosition({ x: 0, y: 0 });
                      }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors cursor-pointer text-[11px]"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Reset</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-text-muted hover:text-text-primary underline text-[11px] cursor-pointer"
                  >
                    Choose another file
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Progress / Status / Error Banner */}
          {isProcessing && (
            <div className="p-3 rounded-2xl bg-surface-elevated border border-border flex items-center gap-3">
              <div className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin shrink-0" />
              <span className="text-xs text-text-primary font-medium">
                {processingStatus || 'Processing image...'}
              </span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <div className="text-xs text-rose-500">
                <p className="font-semibold">Upload failed</p>
                <p className="mt-0.5">{errorMessage}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-border flex items-center justify-end gap-2.5 bg-surface-elevated">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 rounded-full border border-border text-text-secondary hover:text-text-primary text-xs font-semibold hover:bg-surface transition-colors cursor-pointer"
          >
            Cancel
          </button>

          {imageSrc && (
            <button
              type="button"
              id="btn-save-crop"
              onClick={handleSaveAndUpload}
              disabled={isProcessing}
              className="flex items-center gap-1.5 px-5 py-2 rounded-full bg-accent hover:bg-accent-hover text-white text-xs font-bold disabled:opacity-50 transition-colors shadow-soft cursor-pointer"
            >
              {isProcessing ? (
                <span>Uploading...</span>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  <span>Save & Apply</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
