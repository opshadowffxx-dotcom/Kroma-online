import React from 'react';

interface SkeletonCardProps {
  aspectRatio?: number;
}

export const SkeletonCard: React.FC<SkeletonCardProps> = ({ aspectRatio = 0.75 }) => {
  return (
    <div className="mb-4 break-inside-avoid rounded-2xl overflow-hidden bg-surface-elevated border border-border p-2">
      <div
        className="w-full rounded-xl animate-shimmer bg-border"
        style={{ paddingBottom: `${(1 / aspectRatio) * 100}%` }}
      />
      <div className="p-2 space-y-2">
        <div className="h-4 w-3/4 animate-shimmer bg-border rounded" />
        <div className="flex items-center gap-2 pt-1">
          <div className="w-5 h-5 rounded-full animate-shimmer bg-border" />
          <div className="h-3 w-1/3 animate-shimmer bg-border rounded" />
        </div>
      </div>
    </div>
  );
};

export const SkeletonFeed: React.FC<{ count?: number }> = ({ count = 8 }) => {
  const ratios = [0.75, 1.2, 0.65, 0.85, 1.0, 0.7, 1.3, 0.8];
  return (
    <div className="columns-2 md:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6 gap-2.5 sm:gap-4 lg:gap-5">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} aspectRatio={ratios[i % ratios.length]} />
      ))}
    </div>
  );
};
