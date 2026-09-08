import React, { useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { DEFAULT_FALLBACK_IMAGE, getOptimizedImageUrl } from '../../services/imageService';
import { ImageOff } from 'lucide-react';

interface LazyImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  aspectRatio?: number;
  className?: string;
  containerClassName?: string;
  optimizeWidth?: number;
}

export const LazyImage: React.FC<LazyImageProps> = ({
  src,
  alt,
  aspectRatio,
  className = '',
  containerClassName = '',
  optimizeWidth = 800,
  ...props
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  const optimizedSrc = getOptimizedImageUrl(src, { width: optimizeWidth, quality: 85 });

  const defaultImgClasses = `${
    aspectRatio ? 'absolute inset-0 h-full w-full' : 'w-full h-auto'
  } object-cover transition-opacity duration-300 ${
    isLoaded ? 'opacity-100' : 'opacity-0'
  }`;

  return (
    <div
      className={twMerge('relative overflow-hidden bg-surface-elevated', containerClassName)}
      style={aspectRatio ? { paddingBottom: `${(1 / aspectRatio) * 100}%` } : undefined}
    >
      {/* Loading Skeleton */}
      {!isLoaded && !hasError && (
        <div className="absolute inset-0 animate-shimmer bg-surface" />
      )}

      {/* Error Fallback State */}
      {hasError ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-elevated text-text-muted p-4 text-center">
          <ImageOff className="w-8 h-8 mb-2 stroke-[1.5]" />
          <span className="text-xs font-medium">Image unavailable</span>
        </div>
      ) : (
        <img
          src={optimizedSrc}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setIsLoaded(true)}
          onError={() => {
            setHasError(true);
            setIsLoaded(true);
          }}
          className={twMerge(defaultImgClasses, className)}
          {...props}
        />
      )}
    </div>
  );
};
