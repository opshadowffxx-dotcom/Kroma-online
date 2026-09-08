import React, { useState, useRef, useCallback, useLayoutEffect, useEffect } from 'react';
import { Post } from '../../types';
import { useApp } from '../../context/AppContext';
import { LazyImage } from '../common/LazyImage';
import { Avatar } from '../common/Avatar';
import { Heart, Bookmark, MoreHorizontal } from 'lucide-react';

interface PostCardProps {
  post: Post;
  discoverySource?: 'home' | 'search' | 'related' | 'profile' | 'collection' | string;
}

export const PostCard: React.FC<PostCardProps> = ({ post, discoverySource = 'home' }) => {
  const {
    openPostDetail,
    likedPostIds,
    savedPostIds,
    toggleLikePost,
    openSaveModal,
    navigateTo,
    currentUser,
    recordPostImpression,
  } = useApp();

  const resolvedCreatorId = post.creatorId || post.creator?.id;
  const isOwner = Boolean(currentUser?.id && resolvedCreatorId && currentUser.id === resolvedCreatorId);

  // Live profile overrides for the viewer's own posts to avoid stale snapshot data
  const creatorAvatarUrl = isOwner && currentUser ? (currentUser.avatarUrl ?? post.creator?.avatarUrl) : post.creator?.avatarUrl;
  const creatorDisplayName = isOwner && currentUser ? (currentUser.displayName || post.creator?.displayName) : post.creator?.displayName;
  const creatorUsername = isOwner && currentUser ? (currentUser.username || post.creator?.username) : post.creator?.username;

  const cardRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  // Lifetime Unique Impression / Reach Tracking
  // Rule: 1 User + 1 Post = Lifetime 1 Impression
  // Requires: >= 50% in viewport, tab visible, qualifying for ~1s continuous dwell time
  useEffect(() => {
    const el = cardRef.current;
    if (!el || typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      return;
    }

    // Never count creator's own impression of their own post
    if (isOwner) {
      return;
    }

    // Fast-path client storage check
    const storageKey = currentUser?.id
      ? `kroma_user_imp_${currentUser.id}_${post.id}`
      : `kroma_guest_imp_${post.id}`;

    if (localStorage.getItem(storageKey)) {
      return;
    }

    let impressionTimer: ReturnType<typeof setTimeout> | null = null;
    let isCounted = false;

    const cancelTimer = () => {
      if (impressionTimer) {
        clearTimeout(impressionTimer);
        impressionTimer = null;
      }
    };

    const triggerImpression = () => {
      if (isCounted || document.visibilityState === 'hidden') return;
      isCounted = true;
      cancelTimer();
      recordPostImpression(post.id, resolvedCreatorId, discoverySource);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (isCounted) return;
          // Qualifies when at least 50% is visible and document tab is active
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5 && document.visibilityState !== 'hidden') {
            if (!impressionTimer) {
              // Start ~1 second continuous dwell timer
              impressionTimer = setTimeout(triggerImpression, 1000);
            }
          } else {
            // Cancel timer if card leaves >= 50% threshold before 1 second expires
            cancelTimer();
          }
        }
      },
      {
        threshold: [0, 0.5, 1.0],
      }
    );

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        cancelTimer();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    observer.observe(el);

    return () => {
      cancelTimer();
      observer.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [post.id, post.creatorId, post.creator?.id, currentUser?.id, discoverySource, recordPostImpression]);

  const checkTruncation = useCallback(() => {
    const container = containerRef.current;
    const title = titleRef.current;
    if (!container || !title) return;

    const containerWidth = container.clientWidth;
    if (containerWidth === 0) return;

    // Check if unconstrained scrollWidth of the title text exceeds the container available width
    setIsTruncated(title.scrollWidth > containerWidth + 1);
  }, []);

  useLayoutEffect(() => {
    checkTruncation();

    const container = containerRef.current;
    if (!container) return;

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        checkTruncation();
      });
      resizeObserver.observe(container);
    }

    if (typeof document !== 'undefined' && document.fonts) {
      document.fonts.ready.then(checkTruncation);
    }

    window.addEventListener('resize', checkTruncation);

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('resize', checkTruncation);
    };
  }, [checkTruncation, post.title]);

  const isLiked = likedPostIds.includes(post.id);
  const isSaved = savedPostIds.includes(post.id);

  const handleCardClick = (e: React.MouseEvent) => {
    // Only open post detail if clicking on the card itself, not on quick action buttons
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a')) return;
    openPostDetail(post.id);
  };

  const handleMoreClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    openPostDetail(post.id);
  };

  const handleCreatorClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (creatorUsername) {
      navigateTo({ type: 'profile', username: creatorUsername });
    }
  };

  return (
    <div
      ref={cardRef}
      id={`post-card-${post.id}`}
      onClick={handleCardClick}
      className="group relative mb-3 sm:mb-4 break-inside-avoid flex flex-col cursor-pointer"
    >
      {/* Visual Image Container with subtle desktop hover effect */}
      <div className="relative w-full overflow-hidden rounded-2xl bg-surface-elevated border border-border shadow-soft group-hover:shadow-premium transition-all duration-200">
        <LazyImage
          src={post.thumbnailUrl || post.imageUrl}
          alt={post.title}
          aspectRatio={post.aspectRatio}
          optimizeWidth={600}
          className="w-full h-auto group-hover:scale-[1.015] transition-transform duration-300 ease-out"
        />
      </div>

      {/* Clean Compact Metadata (Consistent layout across Desktop and Mobile) */}
      <div className="pt-2 px-1 flex flex-col gap-1">
        {/* Title Row with Truncation Detection */}
        <div
          ref={containerRef}
          className="flex items-center justify-between gap-1 min-w-0"
        >
          <h3
            ref={titleRef}
            title={post.title}
            className="font-semibold text-xs sm:text-sm text-text-primary leading-snug truncate flex-1 min-w-0 group-hover:text-text-secondary transition-colors"
          >
            {post.title}
          </h3>

          {isTruncated && (
            <button
              type="button"
              id={`btn-card-more-${post.id}`}
              onClick={handleMoreClick}
              className="flex-shrink-0 p-0.5 text-text-muted hover:text-text-primary transition-colors rounded hover:bg-surface-elevated active:scale-95 cursor-pointer"
              aria-label="View full post"
              title="View full post"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-1.5 text-xs pt-0.5">
          {/* Creator Information */}
          <div
            onClick={handleCreatorClick}
            className="flex items-center gap-1.5 min-w-0 flex-1 hover:opacity-80 transition-opacity cursor-pointer"
          >
            <Avatar
              src={creatorAvatarUrl}
              alt={creatorDisplayName || 'Creator'}
              size="xs"
            />
            <span className="font-medium text-[11px] sm:text-xs text-text-secondary truncate">
              {creatorDisplayName}
            </span>
          </div>

          {/* Action Buttons: Like with Count + Save Bookmark */}
          <div className="flex items-center gap-1 shrink-0 ml-1">
            <button
              id={`btn-card-like-${post.id}`}
              onClick={e => {
                e.stopPropagation();
                toggleLikePost(post.id);
              }}
              className="flex items-center gap-1 text-[11px] font-medium text-text-secondary hover:text-text-primary transition-colors cursor-pointer p-1 rounded-full hover:bg-surface-elevated active:scale-90"
              aria-label={isLiked ? 'Unlike post' : 'Like post'}
              title={isLiked ? 'Unlike' : 'Like'}
            >
              <Heart
                className={`w-3.5 h-3.5 transition-colors ${
                  isLiked ? 'text-accent fill-accent' : 'text-text-muted'
                }`}
              />
              <span className="text-[10px] sm:text-[11px] font-medium">{post.likesCount}</span>
            </button>

            <button
              id={`btn-card-save-${post.id}`}
              onClick={e => {
                e.stopPropagation();
                openSaveModal(post);
              }}
              className="p-1 text-text-secondary hover:text-text-primary transition-colors cursor-pointer rounded-full hover:bg-surface-elevated active:scale-90"
              aria-label={isSaved ? 'Remove from saved' : 'Save post'}
              title={isSaved ? 'Saved' : 'Save'}
            >
              <Bookmark
                className={`w-3.5 h-3.5 transition-colors ${
                  isSaved ? 'text-accent fill-accent' : 'text-text-muted'
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
