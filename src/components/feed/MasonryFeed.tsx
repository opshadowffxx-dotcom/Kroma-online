import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Post } from '../../types';
import { PostCard } from './PostCard';
import { SkeletonFeed } from '../common/Skeleton';
import { Sparkles, RefreshCw, PlusCircle, LogIn, LayoutGrid } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface MasonryFeedProps {
  posts: Post[];
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: React.ReactNode;
  emptyActionLabel?: string;
  emptyActionIcon?: React.ReactNode;
  onEmptyAction?: () => void;
  onLoadMore?: () => Promise<void> | void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  containerClassName?: string;
  discoverySource?: 'home' | 'search' | 'related' | 'profile' | 'collection' | string;
}

export const MasonryFeed: React.FC<MasonryFeedProps> = ({
  posts,
  isLoading = false,
  emptyTitle = 'Nothing has been published yet',
  emptyDescription = 'Be the first to add something worth discovering.',
  emptyIcon,
  emptyActionLabel,
  emptyActionIcon,
  onEmptyAction,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false,
  containerClassName,
  discoverySource = 'home',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { currentUser, openCreateModal, openAuthModal, activeCategory } = useApp();
  const [columnCount, setColumnCount] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const width = window.innerWidth;
      if (width < 768) return 2; // Mobile (360px–767px): 2 columns
      if (width < 1024) return 3; // Tablet (768px–1023px): 3 columns
      if (width < 1280) return 4; // Large Tablet / Small Desktop (1024px–1279px): 4 columns
      if (width < 1600) return 5; // Desktop (1280px–1599px): 5 columns
      return 6; // Large Desktop (1600px+): 6 columns
    }
    return 2; // Default to mobile-first 2 columns to prevent 4-column initial flash on mobile
  });

  // Dynamic responsive column calculation for discovery density (mobile: 2 columns, tablet: 3, small desktop: 4, desktop: 5, wide: 6)
  useEffect(() => {
    const updateColumns = () => {
      if (!containerRef.current) return;
      const width = containerRef.current.offsetWidth || window.innerWidth;
      if (width < 768) {
        setColumnCount(2); // Mobile (360px–767px): 2 columns
      } else if (width < 1024) {
        setColumnCount(3); // Tablet (768px–1023px): 3 columns
      } else if (width < 1280) {
        setColumnCount(4); // Large Tablet / Small Desktop (1024px–1279px): 4 columns
      } else if (width < 1600) {
        setColumnCount(5); // Desktop (1280px–1599px): 5 columns
      } else {
        setColumnCount(6); // Large Desktop (1600px+): 6 columns
      }
    };

    updateColumns();
    const observer = new ResizeObserver(updateColumns);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    window.addEventListener('resize', updateColumns);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateColumns);
    };
  }, []);

  // Distribute posts across all responsive column tracks by height
  // Crucial: ALWAYS create columnCount tracks so card width is stable and determined strictly by viewport columnCount, never by posts.length.
  const columns = useMemo(() => {
    if (posts.length === 0) return [];
    const cols: Post[][] = Array.from({ length: columnCount }, () => []);
    const heights = Array.from({ length: columnCount }, () => 0);

    posts.forEach(post => {
      let minCol = 0;
      let minHeight = heights[0];
      for (let i = 1; i < columnCount; i++) {
        if (heights[i] < minHeight) {
          minHeight = heights[i];
          minCol = i;
        }
      }

      cols[minCol].push(post);
      const itemHeight = (1 / (post.aspectRatio || 0.75)) + 0.35;
      heights[minCol] += itemHeight;
    });

    return cols;
  }, [posts, columnCount]);

  if (isLoading) {
    return (
      <div className="w-full max-w-[1920px] mx-auto px-3 sm:px-4 md:px-6 lg:px-8 xl:px-10 py-2.5 sm:py-6">
        <SkeletonFeed count={12} />
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className={containerClassName || "w-full max-w-[1920px] mx-auto px-3 sm:px-4 md:px-6 lg:px-8 xl:px-10 text-center"}>
        <div className="max-w-md mx-auto py-16 px-4 text-center">
          <div className="w-12 h-12 rounded-2xl bg-surface-elevated flex items-center justify-center mx-auto mb-3 text-accent shadow-soft border border-border">
            {emptyIcon || <Sparkles className="w-5 h-5 text-accent" />}
          </div>
          <h3 className="text-base font-semibold text-text-primary mb-1">
            {emptyTitle}
          </h3>
          <p className="text-xs text-text-secondary mb-6 leading-relaxed">
            {activeCategory !== 'all' && !emptyActionLabel
              ? `No creative projects found in "${activeCategory}". Try exploring other categories or create the first post.`
              : emptyDescription}
          </p>

          <div className="flex items-center justify-center gap-3">
            {onEmptyAction ? (
              <button
                id="btn-empty-feed-action"
                onClick={onEmptyAction}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent hover:bg-accent-hover text-white font-medium text-xs shadow-soft cursor-pointer transition-colors"
              >
                {emptyActionIcon || <LayoutGrid className="w-4 h-4 text-white" />}
                <span>{emptyActionLabel || 'Browse Posts'}</span>
              </button>
            ) : currentUser ? (
              <button
                id="btn-empty-feed-create"
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent hover:bg-accent-hover text-white font-medium text-xs shadow-soft cursor-pointer transition-colors"
              >
                <PlusCircle className="w-4 h-4 text-white" />
                <span>Create Post</span>
              </button>
            ) : (
              <button
                id="btn-empty-feed-login"
                onClick={() => openAuthModal('signup')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent hover:bg-accent-hover text-white font-medium text-xs shadow-soft cursor-pointer transition-colors"
              >
                <LogIn className="w-4 h-4 text-white" />
                <span>Join & Publish Work</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={
        containerClassName ||
        'w-full max-w-[1920px] mx-auto px-3 sm:px-4 md:px-6 lg:px-8 xl:px-10 py-2.5 sm:py-6'
      }
    >
      {/* Stable Masonry Columns */}
      <div className="flex gap-2.5 sm:gap-3.5 md:gap-4 lg:gap-5 items-start">
        {columns.map((colPosts, colIndex) => (
          <div
            key={colIndex}
            className="flex-1 flex flex-col min-w-0 gap-2.5 sm:gap-3.5 md:gap-4 lg:gap-5"
          >
            {colPosts.map(post => (
              <PostCard key={post.id} post={post} discoverySource={discoverySource} />
            ))}
          </div>
        ))}
      </div>

      {/* Infinite Scroll / Load More Trigger */}
      {hasMore && (
        <div className="flex justify-center mt-12 mb-8">
          <button
            id="btn-load-more-posts"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="flex items-center gap-2 px-7 py-3 rounded-full bg-surface border border-border text-xs font-medium text-text-primary hover:bg-surface-elevated transition-all shadow-soft cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingMore ? 'animate-spin' : ''}`} />
            <span>{isLoadingMore ? 'Loading More Visuals...' : 'Discover More Visuals'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
