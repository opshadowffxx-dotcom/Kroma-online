import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { validateImageUrl } from '../../services/imageService';
import {
  validateImageFile,
  processPostMedia,
  PostProcessedMedia,
} from '../../services/media/imageOptimizer';
import { uploadPostMediaBundle } from '../../services/media/mediaService';
import { toUserSafeErrorMessage } from '../../services/media/uploadStatus';
import { LazyImage } from '../common/LazyImage';
import {
  X,
  ImagePlus,
  Link,
  Tag,
  Check,
  AlertCircle,
  Upload,
  Camera,
  RefreshCw,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Calendar,
  Clock,
} from 'lucide-react';

export const CreatePostModal: React.FC = () => {
  const {
    isCreateModalOpen,
    closeCreateModal,
    createPost,
    openPostDetail,
    currentUser,
    isAuthLoading,
    openAuthModal,
  } = useApp();

  // Mode: 'upload' (direct device/camera -> R2) vs 'url' (external link)
  const [inputMode, setInputMode] = useState<'upload' | 'url'>('upload');

  // File Upload State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [processedMedia, setProcessedMedia] = useState<PostProcessedMedia | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // URL State (Fallback mode)
  const [imageUrl, setImageUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [isValidatingUrl, setIsValidatingUrl] = useState(false);

  // Core Form Fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [detectedRatio, setDetectedRatio] = useState<number>(0.75);

  // AI Content Disclosure (Standard Form Field outside Advanced Settings)
  const [isAIGenerated, setIsAIGenerated] = useState<boolean>(false);

  // Advanced Settings
  const [isAdvancedOpen, setIsAdvancedOpen] = useState<boolean>(false);
  const [imageAltText, setImageAltText] = useState<string>('');
  const [isPublishLater, setIsPublishLater] = useState<boolean>(false);
  const [scheduleDate, setScheduleDate] = useState<string>('');
  const [scheduleTime, setScheduleTime] = useState<string>('');

  // Publishing & Progress State
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [publishStep, setPublishStep] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Reset all modal fields
  const resetFullForm = () => {
    setSelectedFile(null);
    setProcessedMedia(null);
    setImageUrl('');
    setUrlError(null);
    setTitle('');
    setDescription('');
    setSourceUrl('');
    setCtaLabel('');
    setTagInput('');
    setTags([]);
    setIsAIGenerated(false);
    setIsAdvancedOpen(false);
    setImageAltText('');
    setIsPublishLater(false);
    setScheduleDate('');
    setScheduleTime('');
    setErrorMessage(null);
    setIsPublishing(false);
    setPublishStep('');
  };

  // Pre-populate sensible schedule defaults when user switches Publish Later ON
  useEffect(() => {
    if (isPublishLater && !scheduleDate && !scheduleTime) {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const yyyy = tomorrow.getFullYear();
      const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
      const dd = String(tomorrow.getDate()).padStart(2, '0');
      setScheduleDate(`${yyyy}-${mm}-${dd}`);
      setScheduleTime('20:00');
    }
  }, [isPublishLater, scheduleDate, scheduleTime]);

  const todayStr = useMemo(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const userTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';
    } catch {
      return 'Local';
    }
  }, []);

  // Scheduling validation helper
  const schedulingValidation = useMemo((): {
    isValid: boolean;
    message?: string;
    scheduledIso?: string;
    scheduledDateObj?: Date;
  } => {
    if (!isPublishLater) return { isValid: true };
    if (!scheduleDate || !scheduleTime) {
      return { isValid: false, message: 'Select both date and time for publication.' };
    }
    const scheduled = new Date(`${scheduleDate}T${scheduleTime}`);
    if (isNaN(scheduled.getTime())) {
      return { isValid: false, message: 'Invalid schedule date or time.' };
    }
    if (scheduled.getTime() <= Date.now() + 60 * 1000) {
      return { isValid: false, message: 'Scheduled time must be in the future.' };
    }
    return {
      isValid: true,
      scheduledIso: scheduled.toISOString(),
      scheduledDateObj: scheduled,
    };
  }, [isPublishLater, scheduleDate, scheduleTime]);

  // Process File Selection
  const handleFile = async (file: File) => {
    setErrorMessage(null);
    const val = validateImageFile(file);
    if (!val.valid) {
      setErrorMessage(val.error || 'Invalid image file.');
      return;
    }

    setSelectedFile(file);
    setIsProcessingFile(true);

    try {
      const processed = await processPostMedia(file);
      setProcessedMedia(processed);
      setDetectedRatio(processed.naturalAspectRatio);

      // Auto-populate title if empty from filename
      if (!title.trim()) {
        const cleanName = file.name
          .replace(/\.[^/.]+$/, '')
          .replace(/[-_]/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase());
        setTitle(cleanName);
      }
    } catch (err: any) {
      console.error('Error processing media:', err);
      setErrorMessage(err.message || 'Failed to process visual file.');
      setSelectedFile(null);
      setProcessedMedia(null);
    } finally {
      setIsProcessingFile(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  // URL change & validation (Fallback mode)
  useEffect(() => {
    if (inputMode !== 'url' || !imageUrl.trim()) {
      setUrlError(null);
      return;
    }

    const { valid, error } = validateImageUrl(imageUrl);
    if (!valid) {
      setUrlError(error || 'Invalid image URL');
      return;
    }

    setIsValidatingUrl(true);
    setUrlError(null);

    const img = new Image();
    img.onload = () => {
      setIsValidatingUrl(false);
      const ratio = img.naturalWidth / img.naturalHeight;
      setDetectedRatio(ratio > 0.3 && ratio < 3.0 ? ratio : 0.75);
    };
    img.onerror = () => {
      setIsValidatingUrl(false);
      setUrlError('Could not load image from this URL. Please verify the link is accessible.');
    };
    img.src = imageUrl;
  }, [imageUrl, inputMode]);

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  const resetUploadState = () => {
    setSelectedFile(null);
    setProcessedMedia(null);
    setImageUrl('');
    setErrorMessage(null);
    setIsPublishing(false);
    setPublishStep('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAuthLoading) {
      setErrorMessage('Please wait a moment while your session is being verified.');
      return;
    }
    if (!currentUser) {
      openAuthModal('login');
      setErrorMessage('You must be signed in to upload media. Please sign in and try again.');
      return;
    }
    if (!title.trim() || isPublishing) return;

    if (inputMode === 'upload' && !processedMedia) {
      setErrorMessage('Please select or capture a visual image first.');
      return;
    }

    if (inputMode === 'url' && (!imageUrl.trim() || urlError)) {
      setErrorMessage('Please enter a valid image URL.');
      return;
    }

    if (isPublishLater && !schedulingValidation.isValid) {
      setErrorMessage(schedulingValidation.message || 'Please provide a valid future date and time.');
      return;
    }

    setIsPublishing(true);
    setErrorMessage(null);

    try {
      let finalImageUrl = imageUrl.trim();
      let finalThumbnailUrl = imageUrl.trim();
      let imageObjectKey: string | undefined;
      let thumbnailObjectKey: string | undefined;
      let imageWidth: number | undefined;
      let imageHeight: number | undefined;
      let thumbnailWidth: number | undefined;
      let thumbnailHeight: number | undefined;
      let imageSize: number | undefined;
      let imageMimeType: string | undefined;

      const tempPostId = `post-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      if (inputMode === 'upload' && processedMedia) {
        setPublishStep('Preparing image…');

        // Upload both high-res display and feed thumbnail to R2
        const uploadResult = await uploadPostMediaBundle(
          processedMedia.main.blob,
          processedMedia.thumb.blob,
          tempPostId,
          stepText => setPublishStep(stepText)
        );

        finalImageUrl = uploadResult.imageUrl;
        finalThumbnailUrl = uploadResult.thumbnailUrl;
        imageObjectKey = uploadResult.imageObjectKey;
        thumbnailObjectKey = uploadResult.thumbnailObjectKey;

        imageWidth = processedMedia.main.width;
        imageHeight = processedMedia.main.height;
        thumbnailWidth = processedMedia.thumb.width;
        thumbnailHeight = processedMedia.thumb.height;
        imageSize = processedMedia.main.size;
        imageMimeType = processedMedia.main.mimeType;
      }

      setPublishStep(isPublishLater ? 'Scheduling post…' : 'Publishing…');

      const cleanSource = sourceUrl.trim() || undefined;
      const cleanCta = cleanSource && ctaLabel.trim() ? ctaLabel.trim().slice(0, 32) : undefined;
      const finalAltText = imageAltText.trim() || title.trim();
      const isScheduled = isPublishLater && schedulingValidation.isValid;

      const newPost = await createPost({
        id: tempPostId,
        title: title.trim(),
        description: description.trim(),
        imageUrl: finalImageUrl,
        thumbnailUrl: finalThumbnailUrl,
        aspectRatio: detectedRatio,
        imageWidth,
        imageHeight,
        thumbnailWidth,
        thumbnailHeight,
        imageObjectKey,
        thumbnailObjectKey,
        imageSize,
        imageMimeType,
        tags,
        sourceUrl: cleanSource,
        ctaLabel: cleanCta,
        isAIGenerated,
        imageAltText: finalAltText,
        publishStatus: isScheduled ? 'scheduled' : 'published',
        scheduledPublishAt: isScheduled ? schedulingValidation.scheduledIso : undefined,
        isPublished: !isScheduled,
      });

      setIsPublishing(false);
      resetFullForm();
      closeCreateModal();

      if (newPost.isPublished) {
        openPostDetail(newPost.id);
      }
    } catch (err: any) {
      console.error('Failed to publish post:', err);
      setIsPublishing(false);
      const isPermissionError =
        err?.message?.toLowerCase().includes('insufficient permissions') ||
        err?.code === 'permission-denied' ||
        err?.message?.toLowerCase().includes('permission-denied');

      const isAuthError =
        err?.message?.includes('You must be signed in') ||
        err?.message?.includes('Could not verify your session') ||
        err?.message?.includes('sign in');

      if (isAuthError) {
        setErrorMessage(err.message);
      } else if (isPermissionError) {
        setErrorMessage(
          'Missing or insufficient permissions: Please ensure you are signed in and that your Firestore security rules have been published in your Firebase Console.'
        );
      } else {
        setErrorMessage(
          toUserSafeErrorMessage(
            err,
            "We couldn't publish your post. Please check your connection and try again."
          )
        );
      }
    }
  };

  if (!isCreateModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div
        id="modal-create-post"
        className="relative w-full max-w-4xl bg-surface rounded-3xl overflow-hidden shadow-premium border border-border my-auto flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center shadow-soft">
              <ImagePlus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-text-primary">
                Create Post
              </h2>
            </div>
          </div>

          <button
            onClick={() => {
              resetFullForm();
              closeCreateModal();
            }}
            disabled={isPublishing}
            className="w-8 h-8 rounded-full bg-surface-elevated text-text-muted hover:text-text-primary flex items-center justify-center transition-colors cursor-pointer"
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Left Column: Media Asset Input & Live Preview */}
            <div className="md:col-span-5 space-y-3">
              {/* Media Section Header with Compact Upload Mode Selector */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="block text-xs font-semibold text-text-primary">
                  Visual Media Asset *
                </label>
                <div className="inline-flex items-center p-0.5 rounded-xl bg-surface-elevated border border-border text-xs font-medium">
                  <button
                    type="button"
                    id="btn-mode-upload"
                    onClick={() => setInputMode('upload')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 text-[11px] ${
                      inputMode === 'upload'
                        ? 'bg-accent text-white shadow-soft font-semibold'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <Upload className="w-3 h-3" />
                    <span>Direct Upload</span>
                  </button>
                  <button
                    type="button"
                    id="btn-mode-url"
                    onClick={() => setInputMode('url')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 text-[11px] ${
                      inputMode === 'url'
                        ? 'bg-accent text-white shadow-soft font-semibold'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <Link className="w-3 h-3" />
                    <span>External URL</span>
                  </button>
                </div>
              </div>

              {inputMode === 'upload' ? (
                <div>
                  {!processedMedia ? (
                    /* Interactive Drag & Drop Box */
                    <div
                      onDragOver={e => {
                        e.preventDefault();
                        setIsDragOver(true);
                      }}
                      onDragLeave={() => setIsDragOver(false)}
                      onDrop={handleDrop}
                      className={`border-2 border-dashed rounded-2xl p-6 text-center space-y-3 transition-colors ${
                        isDragOver
                          ? 'border-accent bg-accent/5'
                          : 'border-border bg-surface-elevated'
                      }`}
                    >
                      <div className="w-12 h-12 rounded-full bg-surface border border-border mx-auto flex items-center justify-center text-accent">
                        {isProcessingFile ? (
                          <div className="w-5 h-5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                        ) : (
                          <Upload className="w-5 h-5" />
                        )}
                      </div>

                      <div>
                        <h4 className="text-xs font-semibold text-text-primary">
                          {isProcessingFile
                            ? 'Optimizing visual media...'
                            : 'Drag & drop your visual here'}
                        </h4>
                        <p className="text-[11px] text-text-muted mt-0.5">
                          PNG, JPG, WebP, AVIF up to 20MB
                        </p>
                      </div>

                      <div className="flex items-center justify-center gap-2 pt-1">
                        <button
                          type="button"
                          id="btn-select-file"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isProcessingFile}
                          className="px-3.5 py-1.5 rounded-full bg-accent hover:bg-accent-hover text-white text-xs font-semibold transition-colors cursor-pointer shadow-soft"
                        >
                          Browse Files
                        </button>
                        <button
                          type="button"
                          id="btn-take-photo"
                          onClick={() => cameraInputRef.current?.click()}
                          disabled={isProcessingFile}
                          className="px-3.5 py-1.5 rounded-full bg-surface-elevated border border-border text-text-primary text-xs font-semibold hover:bg-surface transition-colors cursor-pointer"
                        >
                          <Camera className="w-3.5 h-3.5 inline mr-1" />
                          Photo
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Processed Preview Card */
                    <div className="rounded-2xl overflow-hidden bg-surface-elevated border border-border relative group">
                      <img
                        src={processedMedia.main.dataUrl}
                        alt="Preview"
                        className="w-full h-auto max-h-72 object-contain"
                      />

                      {/* Overlay Specs Badge */}
                      <div className="p-3 bg-surface border-t border-border text-[11px] text-text-secondary space-y-1.5">
                        <div className="flex items-center justify-between font-medium">
                          <span className="truncate max-w-[180px]">
                            {processedMedia.originalName}
                          </span>
                          <span className="text-accent font-semibold">WebP Ready</span>
                        </div>
                        <div className="flex items-center justify-between text-text-muted text-[10px]">
                          <span>
                            Display: {processedMedia.main.width}×{processedMedia.main.height} (
                            {(processedMedia.main.size / 1024).toFixed(0)} KB)
                          </span>
                          <span>
                            Thumb: {processedMedia.thumb.width}×{processedMedia.thumb.height}
                          </span>
                        </div>
                      </div>

                      {/* Replace Button */}
                      <button
                        type="button"
                        onClick={resetUploadState}
                        className="absolute top-2 right-2 px-2.5 py-1 rounded-full bg-black/70 hover:bg-black/90 backdrop-blur-md text-white text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Change</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* Fallback URL Input & Preview */
                <div className="space-y-3">
                  <div>
                    <input
                      type="url"
                      id="input-post-image-url"
                      value={imageUrl}
                      onChange={e => setImageUrl(e.target.value)}
                      placeholder="https://..."
                      required={inputMode === 'url'}
                      className={`w-full px-3.5 py-2.5 rounded-xl bg-surface-elevated border text-xs text-text-primary placeholder-text-muted focus:outline-none ${
                        urlError
                          ? 'border-rose-500'
                          : 'border-border focus:border-accent'
                      }`}
                    />
                    {urlError && (
                      <p className="text-[11px] text-rose-500 mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        <span>{urlError}</span>
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <span className="text-[11px] font-medium text-text-muted">Live Preview</span>
                    <div className="rounded-2xl overflow-hidden bg-surface-elevated border border-border min-h-56 flex items-center justify-center p-2 relative">
                      {imageUrl && !urlError ? (
                        <LazyImage
                          src={imageUrl}
                          alt="Upload Preview"
                          aspectRatio={detectedRatio}
                          className="rounded-xl w-full object-cover"
                        />
                      ) : (
                        <div className="text-center p-6 text-text-muted text-xs">
                          <ImagePlus className="w-6 h-6 mx-auto mb-2 opacity-40 text-accent" />
                          <p>Enter an image URL to preview.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Metadata fields */}
            <div className="md:col-span-7 space-y-4 text-xs">
              {/* Title */}
              <div>
                <label className="block font-medium text-text-primary mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  id="input-post-title"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Swiss Typographic Exhibition Poster"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-elevated border border-border text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block font-medium text-text-primary mb-1">
                  Description
                </label>
                <textarea
                  id="input-post-description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Briefly describe the concept, inspiration, technique, or background..."
                  rows={3}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-elevated border border-border text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                />
              </div>

              {/* Tags */}
              <div>
                <label className="block font-medium text-text-primary mb-1 flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5" />
                  <span>Tags</span>
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                    placeholder="Add tag and press enter..."
                    className="flex-1 px-3 py-1.5 rounded-xl bg-surface-elevated border border-border text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={handleAddTag}
                    className="px-3 py-1.5 rounded-xl bg-surface-elevated border border-border text-text-primary hover:bg-surface font-medium cursor-pointer transition-colors"
                  >
                    Add
                  </button>
                </div>

                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map(t => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-surface-elevated border border-border text-text-secondary text-[11px]"
                      >
                        #{t}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(t)}
                          className="hover:text-rose-500 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Source Link & Custom CTA Button System */}
              <div className="space-y-2.5">
                <div>
                  <label className="block font-medium text-text-primary mb-1">
                    External Project / Source Link (Optional)
                  </label>
                  <input
                    type="url"
                    id="input-post-source-url"
                    value={sourceUrl}
                    onChange={e => setSourceUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-surface-elevated border border-border text-text-primary placeholder-text-muted focus:outline-none focus:border-accent text-xs sm:text-sm"
                  />
                </div>

                {/* Custom CTA Label Configuration */}
                {sourceUrl.trim().length > 0 && (
                  <div className="p-3.5 rounded-2xl bg-surface-elevated border border-border space-y-2.5 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="input-post-cta-label"
                        className="block text-xs font-semibold text-text-primary"
                      >
                        CTA Button Label (Optional)
                      </label>
                      <span className="text-[11px] text-text-muted">
                        {ctaLabel.length}/32
                      </span>
                    </div>

                    <input
                      type="text"
                      id="input-post-cta-label"
                      value={ctaLabel}
                      maxLength={32}
                      onChange={e => setCtaLabel(e.target.value)}
                      placeholder="e.g. View project, Shop now, Learn more"
                      className="w-full px-3.5 py-2 rounded-xl bg-surface border border-border text-text-primary placeholder-text-muted focus:outline-none focus:border-accent text-xs sm:text-sm"
                    />

                    {/* Quick CTA Suggestions */}
                    <div className="space-y-1.5 pt-0.5">
                      <span className="text-[11px] text-text-muted font-medium">Quick suggestions:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          'View project',
                          'Shop now',
                          'Learn more',
                          'Visit website',
                          'See product',
                          'View case study',
                          'Read article',
                          'See details',
                        ].map(suggestion => (
                          <button
                            key={suggestion}
                            type="button"
                            id={`btn-cta-preset-${suggestion.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                            onClick={() => setCtaLabel(suggestion)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                              ctaLabel.trim() === suggestion
                                ? 'bg-accent text-white shadow-soft'
                                : 'bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
                            }`}
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </div>

                    <p className="text-[11px] text-text-muted leading-tight">
                      Custom call-to-action text for the external button. Defaults to &quot;Visit website&quot; if left blank.
                    </p>
                  </div>
                )}
              </div>

              {/* AI-Generated Content Disclosure (Standard field outside Advanced Settings) */}
              <div className="p-3.5 rounded-2xl bg-surface-elevated border border-border">
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    id="checkbox-ai-generated"
                    checked={isAIGenerated}
                    onChange={e => setIsAIGenerated(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-border text-accent focus:ring-accent accent-accent cursor-pointer"
                  />
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-text-primary block">
                      AI-generated content
                    </span>
                    <span className="text-[11px] text-text-muted leading-relaxed block">
                      Disclose whether this visual was created or substantially assisted by generative AI.
                    </span>
                  </div>
                </label>
              </div>

              {/* Collapsible Advanced Settings */}
              <div className="rounded-2xl border border-border bg-surface-elevated overflow-hidden transition-all">
                <button
                  type="button"
                  id="btn-toggle-advanced-settings"
                  onClick={() => setIsAdvancedOpen(prev => !prev)}
                  className="w-full p-3.5 flex items-center justify-between text-left hover:bg-surface transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2 text-text-primary font-semibold text-xs">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-accent" />
                    <span>Advanced Settings</span>
                  </div>
                  <div className="flex items-center gap-1 text-text-muted text-[11px]">
                    <span>{isAdvancedOpen ? 'Hide' : 'Show'}</span>
                    {isAdvancedOpen ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </div>
                </button>

                {isAdvancedOpen && (
                  <div className="p-4 pt-2 border-t border-border space-y-4 animate-in fade-in duration-150">
                    {/* A. Image Alt Text */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label htmlFor="input-post-alt-text" className="font-medium text-text-primary">
                          Image alt text
                        </label>
                        <span className="text-[11px] text-text-muted">Optional</span>
                      </div>
                      <input
                        type="text"
                        id="input-post-alt-text"
                        value={imageAltText}
                        onChange={e => setImageAltText(e.target.value)}
                        placeholder={
                          title.trim()
                            ? `Defaults to "${title.trim()}"`
                            : 'Image description for accessibility & SEO...'
                        }
                        className="w-full px-3.5 py-2 rounded-xl bg-surface border border-border text-text-primary placeholder-text-muted focus:outline-none focus:border-accent text-xs"
                      />
                      <p className="text-[11px] text-text-muted mt-1 leading-normal">
                        {imageAltText.trim()
                          ? 'Custom alt text will be saved for accessibility.'
                          : title.trim()
                          ? `Leaving blank will automatically use the post Title ("${title.trim()}") as the image description.`
                          : 'Leaving blank will automatically fallback to the post title.'}
                      </p>
                    </div>

                    {/* B. Publish Later */}
                    <div className="pt-2 border-t border-border/60">
                      <div className="flex items-center justify-between">
                        <div>
                          <label
                            htmlFor="toggle-publish-later"
                            className="font-medium text-text-primary block"
                          >
                            Publish later
                          </label>
                          <p className="text-[11px] text-text-muted mt-0.5">
                            Schedule this visual to publish at a future date and time.
                          </p>
                        </div>
                        <button
                          type="button"
                          id="toggle-publish-later"
                          role="switch"
                          aria-checked={isPublishLater}
                          onClick={() => setIsPublishLater(prev => !prev)}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            isPublishLater ? 'bg-accent' : 'bg-surface border border-border'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                              isPublishLater ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>

                      {isPublishLater && (
                        <div className="mt-3 p-3 rounded-xl bg-surface border border-border space-y-3 animate-in fade-in duration-150">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-medium text-text-secondary mb-1 flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-accent" />
                                <span>Date</span>
                              </label>
                              <input
                                type="date"
                                id="input-schedule-date"
                                min={todayStr}
                                value={scheduleDate}
                                onChange={e => setScheduleDate(e.target.value)}
                                className="w-full px-3 py-1.5 rounded-lg bg-surface-elevated border border-border text-text-primary text-xs focus:outline-none focus:border-accent"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-medium text-text-secondary mb-1 flex items-center gap-1">
                                <Clock className="w-3 h-3 text-accent" />
                                <span>Time ({userTimezone})</span>
                              </label>
                              <input
                                type="time"
                                id="input-schedule-time"
                                value={scheduleTime}
                                onChange={e => setScheduleTime(e.target.value)}
                                className="w-full px-3 py-1.5 rounded-lg bg-surface-elevated border border-border text-text-primary text-xs focus:outline-none focus:border-accent"
                              />
                            </div>
                          </div>

                          {!schedulingValidation.isValid && scheduleDate && scheduleTime && (
                            <p className="text-[11px] text-rose-500 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3 shrink-0" />
                              <span>{schedulingValidation.message}</span>
                            </p>
                          )}

                          {schedulingValidation.isValid &&
                            schedulingValidation.scheduledDateObj && (
                              <p className="text-[11px] text-emerald-500 flex items-center gap-1">
                                <Check className="w-3 h-3 shrink-0" />
                                <span>
                                  Scheduled for{' '}
                                  {schedulingValidation.scheduledDateObj.toLocaleDateString(
                                    undefined,
                                    {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric',
                                    }
                                  )}{' '}
                                  at{' '}
                                  {schedulingValidation.scheduledDateObj.toLocaleTimeString(
                                    undefined,
                                    {
                                      hour: 'numeric',
                                      minute: '2-digit',
                                    }
                                  )}
                                </span>
                              </p>
                            )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Progress / Status Display */}
          {isPublishing && (
            <div className="p-3.5 rounded-2xl bg-surface-elevated border border-border flex items-center gap-3">
              <div className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin shrink-0" />
              <span className="text-xs text-text-primary font-medium">
                {publishStep || (isPublishLater ? 'Scheduling post...' : 'Uploading and publishing visual asset...')}
              </span>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <div className="text-xs text-rose-500">
                <p className="font-semibold">{isPublishLater ? 'Scheduling Failed' : 'Publication Failed'}</p>
                <p className="mt-0.5">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Footer Submit Button */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={() => {
                resetFullForm();
                closeCreateModal();
              }}
              disabled={isPublishing}
              className="px-5 py-2.5 rounded-full text-xs font-medium text-text-muted hover:text-text-primary hover:bg-surface-elevated cursor-pointer transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              id="btn-publish-post"
              disabled={
                isAuthLoading ||
                !currentUser ||
                !title.trim() ||
                isPublishing ||
                (inputMode === 'upload' && !processedMedia) ||
                (inputMode === 'url' && (!imageUrl.trim() || !!urlError || isValidatingUrl)) ||
                (isPublishLater && !schedulingValidation.isValid)
              }
              className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-accent hover:bg-accent-hover text-white text-xs font-bold disabled:opacity-40 transition-colors shadow-soft cursor-pointer"
            >
              {isAuthLoading ? (
                <>
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin shrink-0" />
                  <span>Checking session...</span>
                </>
              ) : isPublishing ? (
                <span>{isPublishLater ? 'Scheduling Post...' : 'Publishing to KROMA...'}</span>
              ) : isPublishLater ? (
                <>
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Schedule Post</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  <span>Publish</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
