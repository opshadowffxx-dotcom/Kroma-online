import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { LazyImage } from '../common/LazyImage';
import { Avatar } from '../common/Avatar';
import { PostCard } from '../feed/PostCard';
import {
  ArrowLeft,
  Heart,
  Bookmark,
  Share2,
  MoreHorizontal,
  Download,
  Copy,
  ExternalLink,
  Flag,
  Trash2,
  MessageCircle,
  Check,
  Send,
  Sparkles,
  X,
  Loader2,
  BarChart2,
} from 'lucide-react';
import { Post, Comment } from '../../types';
import {
  subscribeToPostComments,
  fetchRelatedFirestorePosts,
} from '../../services/firebase/postService';

interface PostDetailViewProps {
  postId: string;
}

export const PostDetailView: React.FC<PostDetailViewProps> = ({ postId }) => {
  const {
    getPostById,
    posts,
    currentUser,
    likedPostIds,
    savedPostIds,
    followingUserIds,
    toggleLikePost,
    toggleFollowUser,
    openSaveModal,
    addComment,
    deleteComment,
    deletePost,
    comments,
    navigateTo,
    recordPostView,
    recordPostLinkClick,
    isFirebaseConnected,
    isMockMode,
  } = useApp();

  const [post, setPost] = useState<Post | null>(null);
  const [isLoadingPost, setIsLoadingPost] = useState(true);
  const [postError, setPostError] = useState<string | null>(null);

  // Interaction states
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isCommentsSheetOpen, setIsCommentsSheetOpen] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [justLiked, setJustLiked] = useState(false);

  // Data states
  const [realtimeComments, setRealtimeComments] = useState<Comment[] | null>(null);
  const [relatedPosts, setRelatedPosts] = useState<Post[]>([]);
  const [isLoadingRelated, setIsLoadingRelated] = useState(false);

  const moreMenuRef = useRef<HTMLDivElement>(null);
  const sheetInputRef = useRef<HTMLInputElement>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordedViewPostIdRef = useRef<string | null>(null);

  const showToast = useCallback((msg: string, duration = 3000) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, duration);
  }, []);

  // Lock background scroll when comments bottom sheet is open
  useEffect(() => {
    if (isCommentsSheetOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      // Autofocus input when sheet opens
      setTimeout(() => {
        sheetInputRef.current?.focus();
      }, 150);
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isCommentsSheetOpen]);

  // Close more menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setIsMoreMenuOpen(false);
      }
    };
    if (isMoreMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMoreMenuOpen]);

  // Fetch target post by ID on mount or when postId changes
  useEffect(() => {
    let isMounted = true;
    recordedViewPostIdRef.current = null;
    setIsLoadingPost(true);
    setPostError(null);
    setIsDescriptionExpanded(false);
    setIsMoreMenuOpen(false);
    setIsCommentsSheetOpen(false);

    const loadTargetPost = async () => {
      try {
        const found = await getPostById(postId);
        if (!isMounted) return;

        if (found) {
          setPost(found);
        } else {
          setPost(null);
          setPostError('This visual is no longer available.');
        }
      } catch (err: any) {
        if (!isMounted) return;
        setPost(null);
        setPostError(err?.message || 'Failed to load visual post. Please check your connection.');
      } finally {
        if (isMounted) {
          setIsLoadingPost(false);
        }
      }
    };

    loadTargetPost();

    return () => {
      isMounted = false;
    };
  }, [postId, getPostById]);

  // Record unique view only after genuine visible dwell time (~2 seconds)
  useEffect(() => {
    if (!post || post.id !== postId) return;

    // Never count creator viewing their own post
    if (currentUser?.id && currentUser.id === post.creatorId) return;

    // Already recorded for this post in this view session
    if (recordedViewPostIdRef.current === post.id) return;

    // Must be in visible document state
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return;
    }

    let isEligible = true;

    // 2-second dwell timer
    const dwellTimer = setTimeout(() => {
      if (!isEligible) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      recordedViewPostIdRef.current = post.id;
      recordPostView(post.id, post.creatorId);
    }, 2000);

    // Cancel pending view immediately if page/tab becomes hidden before threshold
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        isEligible = false;
        clearTimeout(dwellTimer);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isEligible = false;
      clearTimeout(dwellTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [post?.id, postId, currentUser?.id, post?.creatorId, recordPostView]);

  // Real-time comments listener for this post
  useEffect(() => {
    if (!postId) {
      setRealtimeComments(null);
      return;
    }

    if (isFirebaseConnected && !isMockMode) {
      const unsub = subscribeToPostComments(postId, fetchedComments => {
        setRealtimeComments(fetchedComments);
      });
      return () => unsub();
    } else {
      setRealtimeComments(null);
    }
  }, [postId, isFirebaseConnected, isMockMode]);

  // Fetch candidate related visuals when post is resolved
  useEffect(() => {
    let isMounted = true;
    if (!post) {
      setRelatedPosts([]);
      return;
    }

    setIsLoadingRelated(true);

    const loadRelated = async () => {
      try {
        if (isFirebaseConnected && !isMockMode) {
          const results = await fetchRelatedFirestorePosts(post, 12);
          if (isMounted) {
            setRelatedPosts(results);
          }
        } else {
          // In-memory candidate fallback for mock mode / local dev
          const basePosts = posts.length > 0 ? posts : [];
          const candidates = basePosts.filter(p => p.id !== post.id);
          const targetTags = new Set((post.tags || []).map(t => t.toLowerCase()));
          const scored = candidates.map(cand => {
            let score = 0;
            if (cand.category && cand.category === post.category) score += 3;
            (cand.tags || []).forEach(t => {
              if (targetTags.has(t.toLowerCase())) score += 2;
            });
            score += Math.min(cand.likesCount || 0, 50) * 0.02;
            return { post: cand, score };
          });
          scored.sort((a, b) => b.score - a.score);
          if (isMounted) {
            setRelatedPosts(scored.slice(0, 12).map(s => s.post));
          }
        }
      } catch (err) {
        console.warn('Could not load related visuals:', err);
      } finally {
        if (isMounted) {
          setIsLoadingRelated(false);
        }
      }
    };

    loadRelated();

    return () => {
      isMounted = false;
    };
  }, [post, posts, isFirebaseConnected, isMockMode]);

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history && window.history.length > 1) {
      window.history.back();
    } else {
      navigateTo({ type: 'home' });
    }
  };

  const isLiked = post ? likedPostIds.includes(post.id) : false;

  const handleLikeToggle = () => {
    if (!post) return;
    if (!isLiked) {
      // Trigger bottom-to-top fill pop micro-animation
      setJustLiked(true);
      setTimeout(() => setJustLiked(false), 450);
    }
    toggleLikePost(post.id);
  };

  const handleShare = async () => {
    if (!post) return;
    const shareUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/post/${post.id}`
        : `/post/${post.id}`;

    // Prefer native device share sheet if supported
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: post.title || 'KROMA Visual',
          text: post.description ? post.description.slice(0, 120) : 'Check out this visual on KROMA',
          url: shareUrl,
        });
        return;
      } catch (err: any) {
        // User cancelled native share sheet (AbortError) - ignore silently
        if (err && err.name === 'AbortError') {
          return;
        }
        // Non-abort error: fallback to clipboard
      }
    }

    // Fallback to clipboard
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        showToast('Link copied to clipboard');
      } catch {
        showToast('Could not copy link');
      }
    }
  };

  const sanitizeDownloadFilename = (title: string, imageUrl: string): string => {
    const base = (title || 'kroma-visual')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'kroma-visual';
    let ext = 'jpg';
    const lower = imageUrl.toLowerCase();
    if (lower.includes('.webp')) ext = 'webp';
    else if (lower.includes('.png')) ext = 'png';
    else if (lower.includes('.avif')) ext = 'avif';
    else if (lower.includes('.jpeg') || lower.includes('.jpg')) ext = 'jpg';
    return `${base}.${ext}`;
  };

  const handleDownload = async () => {
    if (!post || isDownloading) return;
    setIsDownloading(true);
    showToast('Downloading...');
    setIsMoreMenuOpen(false);

    const filename = sanitizeDownloadFilename(post.title, post.imageUrl);

    try {
      // 1. Attempt direct client-side blob fetch
      let blob: Blob | null = null;
      try {
        const directRes = await fetch(post.imageUrl, { mode: 'cors' });
        if (directRes.ok) {
          blob = await directRes.blob();
        }
      } catch {
        // Direct fetch failed (e.g. cross-origin CORS) - fall through to server proxy
      }

      // 2. Fallback to same-origin secure media download endpoint
      if (!blob) {
        const proxyUrl = `/api/media/download?url=${encodeURIComponent(post.imageUrl)}&filename=${encodeURIComponent(filename)}`;
        const proxyRes = await fetch(proxyUrl);
        if (!proxyRes.ok) {
          throw new Error('Server download stream failed');
        }
        blob = await proxyRes.blob();
      }

      // 3. Trigger true file download without navigation
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.style.display = 'none';
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl);
      }, 2000);

      showToast('Download started');
    } catch (err) {
      console.warn('Download error:', err);
      showToast("Couldn't download image. Try again.");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleReport = () => {
    setIsMoreMenuOpen(false);
    showToast('Visual reported. Thank you for keeping KROMA safe.');
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!post || !commentText.trim() || isSubmittingComment) return;

    setIsSubmittingComment(true);
    try {
      await addComment(post.id, commentText.trim());
      setCommentText('');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleDeletePost = async () => {
    if (!post) return;
    setIsMoreMenuOpen(false);
    if (window.confirm('Are you sure you want to delete this visual post? This action cannot be undone.')) {
      await deletePost(post.id);
      navigateTo({ type: 'home' });
    }
  };

  if (isLoadingPost) {
    return (
      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="fixed top-4 left-4 z-40 sm:top-6 sm:left-6">
          <div className="w-10 h-10 rounded-full bg-surface-elevated border border-border animate-pulse" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start pt-6">
          <div className="lg:col-span-7 xl:col-span-7 aspect-[3/4] sm:aspect-[4/3] rounded-3xl bg-surface-elevated border border-border animate-pulse" />
          <div className="lg:col-span-5 xl:col-span-5 space-y-4">
            <div className="h-10 w-full rounded-2xl bg-surface-elevated border border-border animate-pulse" />
            <div className="h-6 w-3/4 rounded-lg bg-surface-elevated border border-border animate-pulse" />
            <div className="h-4 w-1/2 rounded-lg bg-surface-elevated border border-border animate-pulse" />
            <div className="h-16 w-full rounded-2xl bg-surface-elevated border border-border animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (postError || !post) {
    return (
      <div className="w-full max-w-md mx-auto px-4 py-16 text-center">
        {/* Fixed Back Button */}
        <button
          id="btn-post-detail-error-back"
          onClick={handleBack}
          className="fixed top-4 left-4 z-40 sm:top-6 sm:left-6 w-10 h-10 rounded-full bg-surface/90 text-text-primary backdrop-blur-md border border-border shadow-soft flex items-center justify-center hover:scale-105 active:scale-95 transition-all cursor-pointer"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="p-8 rounded-3xl bg-surface border border-border shadow-soft mt-8">
          <div className="w-12 h-12 rounded-2xl bg-surface-elevated text-accent flex items-center justify-center mx-auto mb-4 border border-border">
            <Sparkles className="w-6 h-6" />
          </div>
          <h2 className="text-base sm:text-lg font-bold text-text-primary mb-2">
            Visual Not Available
          </h2>
          <p className="text-xs sm:text-sm text-text-secondary mb-6 leading-relaxed">
            {postError || 'This visual is no longer available.'}
          </p>
          <button
            onClick={() => navigateTo({ type: 'home' })}
            className="px-5 py-2.5 rounded-full bg-accent hover:bg-accent-hover text-white text-xs font-semibold transition-colors cursor-pointer shadow-soft"
          >
            Return to Discover
          </button>
        </div>
      </div>
    );
  }

  const isSaved = savedPostIds.includes(post.id);
  const resolvedCreatorId = post.creatorId || post.creator?.id;
  const isFollowing = resolvedCreatorId ? followingUserIds.includes(resolvedCreatorId) : false;
  const isOwner = currentUser?.id === post.creatorId || currentUser?.isAdmin;
  const isCreatorSelf = Boolean(currentUser?.id && resolvedCreatorId && currentUser.id === resolvedCreatorId);

  // Live profile overrides for the viewer's own posts to avoid stale snapshot data
  const creatorAvatarUrl = isCreatorSelf && currentUser ? (currentUser.avatarUrl ?? post.creator?.avatarUrl) : post.creator?.avatarUrl;
  const creatorDisplayName = isCreatorSelf && currentUser ? (currentUser.displayName || post.creator?.displayName) : post.creator?.displayName;
  const creatorUsername = isCreatorSelf && currentUser ? (currentUser.username || post.creator?.username) : post.creator?.username;

  const postComments =
    realtimeComments !== null
      ? realtimeComments
      : comments.filter(c => c.postId === post.id);

  // Custom CTA setup
  const rawSourceUrl = post.sourceUrl?.trim() || '';
  const isSafeUrl = rawSourceUrl && !/^(javascript|data|vbscript):/i.test(rawSourceUrl);
  const finalCtaUrl = isSafeUrl
    ? /^https?:\/\//i.test(rawSourceUrl)
      ? rawSourceUrl
      : `https://${rawSourceUrl}`
    : '';
  const ctaButtonLabel = post.ctaLabel?.trim() || 'Visit website';

  return (
    <div
      id={`post-detail-page-${post.id}`}
      className="relative w-full max-w-5xl mx-auto px-3.5 sm:px-6 lg:px-8 py-3 sm:py-6 pb-28 sm:pb-20 space-y-6 sm:space-y-10"
    >
      {/* 1. FIXED TOP-LEFT BACK BUTTON */}
      <button
        id="btn-post-detail-back"
        onClick={handleBack}
        className="fixed top-4 left-4 z-40 sm:top-6 sm:left-6 w-10 h-10 rounded-full bg-surface/90 text-text-primary backdrop-blur-md border border-border shadow-soft flex items-center justify-center hover:scale-105 active:scale-95 transition-all cursor-pointer"
        aria-label="Back to previous page"
        title="Back"
      >
        <ArrowLeft className="w-5 h-5" />
      </button>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-surface-elevated text-text-primary text-xs font-semibold shadow-premium backdrop-blur-md animate-fade-in flex items-center gap-2 border border-border">
          <Check className="w-3.5 h-3.5 text-accent stroke-[3]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Post Grid Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8 items-start">
        {/* Left Column: Visual Container (Preserving Exact Natural Aspect Ratio) */}
        <div className="lg:col-span-7 xl:col-span-7 w-full flex flex-col items-center">
          <div className="relative w-full rounded-2xl sm:rounded-3xl bg-surface-elevated border border-border shadow-soft overflow-hidden flex items-center justify-center p-2 sm:p-4 min-h-[260px] sm:min-h-[420px]">
            {/* Ambient blurred backdrop glow */}
            <div
              className="absolute inset-0 bg-cover bg-center opacity-25 blur-3xl scale-125 pointer-events-none transition-all duration-700"
              style={{ backgroundImage: `url(${post.imageUrl})` }}
            />

            {/* Main Visual Asset */}
            <div className="relative z-10 w-full flex items-center justify-center">
              <LazyImage
                src={post.imageUrl}
                alt={post.title}
                aspectRatio={post.aspectRatio}
                optimizeWidth={1600}
                className="max-h-[75vh] w-auto max-w-full rounded-xl sm:rounded-2xl object-contain shadow-elevated"
                containerClassName="w-full rounded-xl sm:rounded-2xl flex items-center justify-center"
              />
            </div>
          </div>
        </div>

        {/* Right Column: Actions, Creator, Title, Short Description, CTA */}
        <div className="lg:col-span-5 xl:col-span-5 w-full space-y-4 sm:space-y-5">
          {/* Action Row Directly Below Image */}
          <div className="flex items-center justify-between gap-2 py-1">
            {/* Left Icons: Heart (no circle), Comment, Share, More */}
            <div className="flex items-center gap-1 sm:gap-1.5">
              {/* Like Icon Button */}
              <button
                id="btn-post-action-like"
                onClick={handleLikeToggle}
                className={`relative p-2 rounded-full flex items-center justify-center gap-1.5 text-xs font-semibold bg-transparent transition-transform active:scale-90 cursor-pointer ${
                  justLiked ? 'animate-heart-pop' : ''
                } ${
                  isLiked
                    ? 'text-accent'
                    : 'text-text-secondary hover:text-accent'
                }`}
                title={isLiked ? 'Unlike' : 'Like'}
                aria-label={isLiked ? 'Unlike' : 'Like'}
              >
                <div className="relative w-6 h-6 flex items-center justify-center">
                  {/* Outline Heart (Always underneath) */}
                  <Heart
                    className={`w-6 h-6 stroke-[1.8] transition-colors ${
                      isLiked ? 'text-accent' : 'text-current'
                    }`}
                  />
                  {/* Filled Heart with bottom-to-top clip-path animation */}
                  {isLiked && (
                    <Heart
                      className={`absolute inset-0 w-6 h-6 fill-accent text-accent ${
                        justLiked ? 'animate-heart-fill' : ''
                      }`}
                    />
                  )}
                </div>
                {post.likesCount > 0 && (
                  <span className="text-xs font-semibold select-none">
                    {post.likesCount}
                  </span>
                )}
              </button>

              {/* Comment Icon Button - Opens Bottom Sheet */}
              <button
                id="btn-post-action-comment"
                onClick={() => setIsCommentsSheetOpen(true)}
                className="p-2 rounded-full flex items-center justify-center gap-1.5 text-text-secondary hover:text-text-primary text-xs font-semibold bg-transparent transition-transform active:scale-90 cursor-pointer"
                title="Comments"
                aria-label="Comments"
              >
                <MessageCircle className="w-6 h-6 stroke-[1.8]" />
                {postComments.length > 0 && (
                  <span className="text-xs font-semibold select-none">
                    {postComments.length}
                  </span>
                )}
              </button>

              {/* Native Share Icon Button */}
              <button
                id="btn-post-action-share"
                onClick={handleShare}
                className="p-2 rounded-full flex items-center justify-center text-text-secondary hover:text-text-primary bg-transparent transition-transform active:scale-90 cursor-pointer"
                title="Share visual"
                aria-label="Share"
              >
                <Share2 className="w-6 h-6 stroke-[1.8]" />
              </button>

              {/* More (…) Menu Button & Popover */}
              <div className="relative" ref={moreMenuRef}>
                <button
                  id="btn-post-action-more"
                  onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
                  className="p-2 rounded-full flex items-center justify-center text-text-secondary hover:text-text-primary bg-transparent transition-transform active:scale-90 cursor-pointer"
                  title="More actions"
                  aria-label="More actions"
                >
                  <MoreHorizontal className="w-6 h-6 stroke-[1.8]" />
                </button>

                {isMoreMenuOpen && (
                  <div className="absolute left-0 mt-2 w-48 rounded-2xl bg-surface border border-border shadow-premium py-1.5 z-40 animate-fade-in text-xs font-medium">
                    {/* Download Image */}
                    <button
                      onClick={handleDownload}
                      disabled={isDownloading}
                      className="w-full px-3.5 py-2.5 text-left text-text-secondary hover:text-text-primary hover:bg-surface-elevated flex items-center gap-2.5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isDownloading ? (
                        <Loader2 className="w-4 h-4 text-accent animate-spin" />
                      ) : (
                        <Download className="w-4 h-4 text-text-muted" />
                      )}
                      <span>{isDownloading ? 'Downloading...' : 'Download image'}</span>
                    </button>

                    {/* Copy Link */}
                    <button
                      onClick={() => {
                        handleShare();
                        setIsMoreMenuOpen(false);
                      }}
                      className="w-full px-3.5 py-2.5 text-left text-text-secondary hover:text-text-primary hover:bg-surface-elevated flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <Copy className="w-4 h-4 text-text-muted" />
                      <span>Copy link</span>
                    </button>

                    {/* Open External Link if available */}
                    {finalCtaUrl && (
                      <a
                        href={finalCtaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => {
                          setIsMoreMenuOpen(false);
                          recordPostLinkClick(post.id, post.creatorId, 'more_menu');
                        }}
                        className="w-full px-3.5 py-2.5 text-left text-text-secondary hover:text-text-primary hover:bg-surface-elevated flex items-center gap-2.5 transition-colors cursor-pointer"
                      >
                        <ExternalLink className="w-4 h-4 text-text-muted" />
                        <span>Open website</span>
                      </a>
                    )}

                    {/* View Analytics (Owner only) */}
                    {isOwner && (
                      <button
                        onClick={() => {
                          setIsMoreMenuOpen(false);
                          navigateTo({ type: 'post-analytics', postId: post.id });
                        }}
                        className="w-full px-3.5 py-2.5 text-left text-text-secondary hover:text-text-primary hover:bg-surface-elevated flex items-center gap-2.5 transition-colors cursor-pointer"
                      >
                        <BarChart2 className="w-4 h-4 text-text-muted" />
                        <span>View analytics</span>
                      </button>
                    )}

                    {/* Report Visual */}
                    <button
                      onClick={handleReport}
                      className="w-full px-3.5 py-2.5 text-left text-text-secondary hover:text-text-primary hover:bg-surface-elevated flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <Flag className="w-4 h-4 text-text-muted" />
                      <span>Report visual</span>
                    </button>

                    {/* Delete Visual (Owner / Admin only) */}
                    {isOwner && (
                      <button
                        onClick={handleDeletePost}
                        className="w-full px-3.5 py-2.5 text-left text-rose-500 hover:bg-rose-500/10 flex items-center gap-2.5 transition-colors cursor-pointer border-t border-border mt-1 pt-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Delete visual</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right Action: Save Button */}
            <button
              id="btn-post-action-save"
              onClick={() => openSaveModal(post)}
              className={`px-4.5 py-2 rounded-full text-xs font-bold transition-all shadow-soft active:scale-95 cursor-pointer shrink-0 flex items-center gap-1.5 ${
                isSaved
                  ? 'bg-accent text-white hover:bg-accent-hover'
                  : 'bg-surface border border-border text-text-primary hover:bg-surface-elevated'
              }`}
            >
              {isSaved ? (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  <span>Saved</span>
                </>
              ) : (
                <>
                  <Bookmark className="w-3.5 h-3.5" />
                  <span>Save</span>
                </>
              )}
            </button>
          </div>

          {/* Compact Creator Row */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <div
              onClick={() => creatorUsername && navigateTo({ type: 'profile', username: creatorUsername })}
              className="flex items-center gap-2.5 cursor-pointer group min-w-0"
            >
              <Avatar
                src={creatorAvatarUrl}
                alt={creatorDisplayName || 'Creator'}
                size="md"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <h3 className="font-bold text-xs sm:text-sm text-text-primary truncate group-hover:underline leading-tight">
                    {creatorDisplayName}
                  </h3>
                </div>
                <p className="text-[11px] text-text-muted truncate">
                  @{creatorUsername}
                </p>
              </div>
            </div>

            {currentUser?.id !== resolvedCreatorId && (
              <button
                id="btn-post-creator-follow"
                onClick={() => resolvedCreatorId && toggleFollowUser(resolvedCreatorId)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95 cursor-pointer shrink-0 ${
                  isFollowing
                    ? 'bg-surface-elevated border border-border text-text-primary'
                    : 'bg-accent hover:bg-accent-hover text-white'
                }`}
              >
                {isFollowing ? 'Following' : 'Follow'}
              </button>
            )}
          </div>

          {/* Title */}
          <div className="pt-1">
            <h1 className="text-lg sm:text-xl font-bold text-text-primary leading-snug break-words">
              {post.title}
            </h1>
          </div>

          {/* Description */}
          {post.description && (
            <div className="text-xs sm:text-sm text-text-secondary leading-relaxed">
              <p className={isDescriptionExpanded ? 'whitespace-pre-line break-words' : 'line-clamp-1 break-words'}>
                {post.description}
              </p>
              {post.description.length > 60 && (
                <button
                  id="btn-toggle-description"
                  onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                  className="text-xs font-semibold text-text-primary hover:underline mt-0.5 cursor-pointer"
                >
                  {isDescriptionExpanded ? 'Show less' : 'View more'}
                </button>
              )}
            </div>
          )}

          {/* Preserved Custom CTA */}
          {finalCtaUrl && (
            <div className="pt-1">
              <a
                id={`btn-post-cta-${post.id}`}
                href={finalCtaUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => recordPostLinkClick(post.id, post.creatorId, 'cta_button')}
                className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 sm:py-3 rounded-2xl bg-accent hover:bg-accent-hover text-white font-bold text-xs sm:text-sm active:scale-[0.98] transition-all shadow-soft cursor-pointer min-h-[42px]"
              >
                <span className="truncate">{ctaButtonLabel}</span>
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Discovery Section: More to explore */}
      <div className="pt-6 sm:pt-10 border-t border-border space-y-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-text-primary">
            More to explore
          </h2>
          <p className="text-xs text-text-secondary">
            Related visuals & creative craft
          </p>
        </div>

        {/* Related Posts Grid */}
        {isLoadingRelated ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 sm:gap-3.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[3/4] rounded-2xl bg-surface-elevated border border-border animate-pulse"
              />
            ))}
          </div>
        ) : relatedPosts.length > 0 ? (
          <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-2.5 sm:gap-3.5 space-y-2.5 sm:space-y-3.5">
            {relatedPosts.map(relatedPost => (
              <PostCard key={relatedPost.id} post={relatedPost} discoverySource="related" />
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-text-muted">
            No related visuals found.
          </div>
        )}
      </div>

      {/* COMMENTS BOTTOM SHEET / DIALOG */}
      {isCommentsSheetOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
          onClick={e => {
            if (e.target === e.currentTarget) {
              setIsCommentsSheetOpen(false);
            }
          }}
        >
          <div
            className="w-full sm:max-w-lg bg-surface rounded-t-3xl sm:rounded-3xl shadow-premium flex flex-col h-[88dvh] sm:h-[650px] max-h-[92dvh] overflow-hidden border border-border animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            {/* Sheet Header */}
            <div className="px-5 py-3.5 border-b border-border flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base text-text-primary">
                  Comments
                </h3>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-surface-elevated text-text-secondary border border-border">
                  {postComments.length}
                </span>
              </div>
              <button
                id="btn-close-comments-sheet"
                onClick={() => setIsCommentsSheetOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
                aria-label="Close comments"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Comments List */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5 overscroll-contain">
              {postComments.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 my-auto">
                  <div className="w-12 h-12 rounded-2xl bg-surface-elevated flex items-center justify-center mx-auto mb-3 text-accent shadow-soft border border-border">
                    <MessageCircle className="w-5 h-5 text-accent" />
                  </div>
                  <h3 className="text-base font-semibold text-text-primary mb-1">
                    No comments yet
                  </h3>
                  <p className="text-xs text-text-secondary leading-relaxed max-w-xs">
                    Be the first to share your thoughts or appreciation with the creator!
                  </p>
                </div>
              ) : (
                postComments.map(c => (
                  <div key={c.id} className="flex items-start gap-3 text-xs group/comment">
                    <Avatar
                      src={c.user.avatarUrl}
                      alt={c.user.displayName}
                      size="sm"
                      onClick={() => c.user.username && navigateTo({ type: 'profile', username: c.user.username })}
                      className={c.user.username ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}
                    />
                    <div className="bg-surface-elevated border border-border p-3 rounded-2xl flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-bold text-text-primary truncate">
                          {c.user.displayName}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-text-muted">
                            {new Date(c.createdAt).toLocaleDateString()}
                          </span>
                          {(currentUser?.id === c.userId || currentUser?.isAdmin) && (
                            <button
                              onClick={() => deleteComment(post.id, c.id)}
                              className="text-text-muted hover:text-rose-500 opacity-80 sm:opacity-0 sm:group-hover/comment:opacity-100 transition-opacity cursor-pointer"
                              title="Delete comment"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-text-secondary leading-relaxed break-words">
                        {c.content}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Fixed Bottom Input in Sheet */}
            <div className="p-3.5 sm:p-4 border-t border-border bg-surface pb-[max(0.875rem,env(safe-area-inset-bottom))] shrink-0">
              <form onSubmit={handleCommentSubmit} className="flex items-center gap-2">
                <input
                  ref={sheetInputRef}
                  type="text"
                  id="input-sheet-comment"
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  placeholder={currentUser ? "Add a supportive comment..." : "Sign in to leave a comment..."}
                  disabled={!currentUser || isSubmittingComment}
                  className="flex-1 px-4 py-2.5 rounded-full bg-surface-elevated border border-border text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent disabled:opacity-60"
                />
                <button
                  type="submit"
                  id="btn-sheet-submit-comment"
                  disabled={!commentText.trim() || !currentUser || isSubmittingComment}
                  className="w-9 h-9 rounded-full bg-accent hover:bg-accent-hover text-white flex items-center justify-center disabled:opacity-30 transition-all shrink-0 cursor-pointer shadow-soft"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
