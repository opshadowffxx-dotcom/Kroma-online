import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Avatar } from '../common/Avatar';
import { MasonryFeed } from '../feed/MasonryFeed';
import { CollectionsGrid } from '../collections/CollectionsGrid';
import { AboutBottomSheet } from './AboutBottomSheet';
import { CreatorAnalyticsView } from './CreatorAnalyticsView';
import { AnalyticsErrorBoundary } from '../analytics/AnalyticsErrorBoundary';
import {
  fetchPostsByCreator,
  fetchFirestorePostsByIds,
  fetchCreatorTotalViews,
  fetchScheduledPostsByCreator,
  publishScheduledPostNow,
  cancelScheduledPost,
} from '../../services/firebase/postService';
import { formatCompactNumber } from '../../utils/numberFormatter';
import {
  MapPin,
  Globe,
  Grid,
  Bookmark,
  Heart,
  Settings,
  Share2,
  Check,
  Sparkles,
  Camera,
  Image as ImageIcon,
  Trash2,
  Upload,
  AlertCircle,
  RefreshCw,
  Eye,
  BarChart3,
  Lock,
  X,
  Plus,
  LayoutGrid,
  Clock,
  Calendar,
  Send,
  Loader2,
  ImageOff,
} from 'lucide-react';
import { User, Post } from '../../types';

interface CreatorProfileViewProps {
  username: string;
}

export const CreatorProfileView: React.FC<CreatorProfileViewProps> = ({ username }) => {
  const {
    getUserByUsername,
    posts,
    currentUser,
    followingUserIds,
    likedPostIds,
    toggleFollowUser,
    getCollectionsByUserId,
    navigateTo,
    updateUserProfile,
    createCollection,
    isMockMode,
    isFirebaseConnected,
    activeRoute,
    openCreateModal,
  } = useApp();

  const [creator, setCreator] = useState<User | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [activeTab, setActiveTab] = useState<'posts' | 'collections' | 'liked' | 'scheduled'>(() => {
    if (activeRoute.type === 'profile' && activeRoute.tab) {
      return activeRoute.tab;
    }
    return 'posts';
  });
  const [copiedLink, setCopiedLink] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);

  // Sync activeTab with activeRoute.tab changes
  useEffect(() => {
    if (activeRoute.type === 'profile' && activeRoute.tab && activeRoute.tab !== activeTab) {
      setActiveTab(activeRoute.tab);
    }
  }, [activeRoute]);

  // Create Collection Modal State
  const [isCreateCollectionOpen, setIsCreateCollectionOpen] = useState(false);
  const [newColTitle, setNewColTitle] = useState('');
  const [newColDesc, setNewColDesc] = useState('');
  const [isColPrivate, setIsColPrivate] = useState(false);
  const [isCreatingCol, setIsCreatingCol] = useState(false);

  // Creator Published Posts State (Independent from global home feed)
  const [creatorPosts, setCreatorPosts] = useState<Post[]>([]);
  const [isLoadingCreatorPosts, setIsLoadingCreatorPosts] = useState<boolean>(true);
  const [creatorPostsError, setCreatorPostsError] = useState<string | null>(null);

  // Scheduled Posts State (Owner-Only)
  const [scheduledPosts, setScheduledPosts] = useState<Post[]>([]);
  const [isLoadingScheduledPosts, setIsLoadingScheduledPosts] = useState<boolean>(false);
  const [scheduledActionInProgress, setScheduledActionInProgress] = useState<string | null>(null);

  // Liked Posts State (Independent from global home feed)
  const [likedPosts, setLikedPosts] = useState<Post[]>([]);
  const [isLoadingLikedPosts, setIsLoadingLikedPosts] = useState<boolean>(false);

  // About Bottom Sheet State
  const [isAboutSheetOpen, setIsAboutSheetOpen] = useState(false);

  // Total Post Views across ALL published posts for this creator
  const [totalViews, setTotalViews] = useState<number>(0);

  const isSelf = Boolean(
    currentUser?.id &&
      creator?.id &&
      (currentUser.id === creator.id ||
        (currentUser.username && creator.username && currentUser.username.toLowerCase() === creator.username.toLowerCase()))
  );

  useEffect(() => {
    let isMounted = true;
    if (!creator?.id) {
      setTotalViews(0);
      return;
    }

    const loadTotalViews = async () => {
      if (isMockMode || !isFirebaseConnected) {
        const creatorPublishedPosts = posts.filter(
          p => p.creatorId === creator.id && p.isPublished !== false && p.publishStatus !== 'scheduled'
        );
        const sum = creatorPublishedPosts.reduce(
          (acc, p) => acc + (typeof p.viewsCount === 'number' ? Math.max(0, p.viewsCount) : 0),
          0
        );
        if (isMounted) setTotalViews(sum);
        return;
      }

      try {
        const sum = await fetchCreatorTotalViews(creator.id);
        if (isMounted) setTotalViews(sum);
      } catch (err) {
        console.warn('Failed to fetch total creator views:', err);
      }
    };

    loadTotalViews();

    return () => {
      isMounted = false;
    };
  }, [creator?.id, posts, isMockMode, isFirebaseConnected]);

  useEffect(() => {
    let isMounted = true;
    setIsLoadingUser(true);

    const loadUser = async () => {
      setShowAnalytics(false);
      // First check if current user matches
      if (
        currentUser?.username &&
        username &&
        currentUser.username.toLowerCase() === username.toLowerCase()
      ) {
        if (isMounted) {
          setCreator(currentUser);
          setIsLoadingUser(false);
        }
        return;
      }

      const res = username ? await getUserByUsername(username) : null;
      if (isMounted) {
        setCreator(res || null);
        setIsLoadingUser(false);
      }
    };

    loadUser();

    return () => {
      isMounted = false;
    };
  }, [username, currentUser, getUserByUsername]);

  // Fetch Published Creator Posts independently whenever creator.id changes
  useEffect(() => {
    let isMounted = true;
    if (!creator?.id) {
      setCreatorPosts([]);
      setIsLoadingCreatorPosts(false);
      return;
    }

    const loadCreatorPosts = async () => {
      setIsLoadingCreatorPosts(true);
      setCreatorPostsError(null);

      if (isMockMode || !isFirebaseConnected) {
        if (isMounted) {
          setCreatorPosts(
            posts.filter(
              p => p.creatorId === creator.id && p.isPublished !== false && p.publishStatus !== 'scheduled'
            )
          );
          setIsLoadingCreatorPosts(false);
        }
        return;
      }

      try {
        const fetched = await fetchPostsByCreator(creator.id, 50);
        if (isMounted) {
          // Strictly ensure only published visuals appear in published feed
          setCreatorPosts(fetched.filter(p => p.isPublished !== false && p.publishStatus !== 'scheduled'));
          setCreatorPostsError(null);
        }
      } catch (err: any) {
        console.error('Failed to load creator posts:', err);
        if (isMounted) {
          setCreatorPostsError("We couldn't load these visuals. Please try again.");
        }
      } finally {
        if (isMounted) {
          setIsLoadingCreatorPosts(false);
        }
      }
    };

    loadCreatorPosts();

    return () => {
      isMounted = false;
    };
  }, [creator?.id, isMockMode, isFirebaseConnected]);

  // Support local real-time additions when current user publishes a post (STRICTLY filter out scheduled/unpublished posts to prevent 4->3 flicker)
  useEffect(() => {
    if (isSelf && currentUser?.id) {
      const myNewPublishedPosts = posts.filter(
        p => p.creatorId === currentUser.id && p.isPublished !== false && p.publishStatus !== 'scheduled'
      );
      if (myNewPublishedPosts.length > 0) {
        setCreatorPosts(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const toAdd = myNewPublishedPosts.filter(p => !existingIds.has(p.id));
          if (toAdd.length === 0) return prev;
          return [...toAdd, ...prev];
        });
      }
    }
  }, [posts, isSelf, currentUser?.id]);

  // Fetch Scheduled Posts independently when current user views their own profile
  useEffect(() => {
    let isMounted = true;
    if (!isSelf || !creator?.id) {
      setScheduledPosts([]);
      setIsLoadingScheduledPosts(false);
      return;
    }

    const loadScheduled = async () => {
      setIsLoadingScheduledPosts(true);
      if (isMockMode || !isFirebaseConnected) {
        if (isMounted) {
          const mockScheduled = posts.filter(
            p => p.creatorId === creator.id && (p.isPublished === false || p.publishStatus === 'scheduled')
          );
          setScheduledPosts(prev => {
            const combined = [...prev, ...mockScheduled];
            const map = new Map<string, Post>();
            for (const p of combined) {
              map.set(p.id, p);
            }
            const res = Array.from(map.values());
            res.sort((a, b) => {
              const timeA = a.scheduledPublishAt ? new Date(a.scheduledPublishAt).getTime() : 0;
              const timeB = b.scheduledPublishAt ? new Date(b.scheduledPublishAt).getTime() : 0;
              return timeA - timeB;
            });
            return res;
          });
          setIsLoadingScheduledPosts(false);
        }
        return;
      }

      try {
        const targetCreatorId = currentUser?.id || creator.id;
        const fetched = await fetchScheduledPostsByCreator(targetCreatorId, 50);
        if (isMounted) {
          setScheduledPosts(fetched);
        }
      } catch (err) {
        console.error('Failed to load scheduled posts:', err);
      } finally {
        if (isMounted) {
          setIsLoadingScheduledPosts(false);
        }
      }
    };

    loadScheduled();

    return () => {
      isMounted = false;
    };
  }, [creator?.id, currentUser?.id, isSelf, activeTab, isMockMode, isFirebaseConnected]);

  // Real-time listener for newly scheduled posts created by the owner
  useEffect(() => {
    if (!isSelf) return;

    const handlePostCreated = (event: Event) => {
      const customEvent = event as CustomEvent<Post>;
      const newPost = customEvent.detail;
      if (!newPost) return;

      const currentUid = currentUser?.id || creator?.id;
      const isOwnerPost =
        newPost.creatorId === currentUid ||
        (currentUser?.username && newPost.creator?.username?.toLowerCase() === currentUser.username.toLowerCase());

      if ((newPost.publishStatus === 'scheduled' || newPost.isPublished === false) && isOwnerPost) {
        setScheduledPosts(prev => {
          if (prev.some(p => p.id === newPost.id)) return prev;
          const updated = [newPost, ...prev];
          updated.sort((a, b) => {
            const timeA = a.scheduledPublishAt ? new Date(a.scheduledPublishAt).getTime() : 0;
            const timeB = b.scheduledPublishAt ? new Date(b.scheduledPublishAt).getTime() : 0;
            return timeA - timeB;
          });
          return updated;
        });
      }
    };

    window.addEventListener('kroma-post-created', handlePostCreated);
    return () => {
      window.removeEventListener('kroma-post-created', handlePostCreated);
    };
  }, [isSelf, currentUser?.id, currentUser?.username, creator?.id]);

  // Handle Publish Scheduled Post Now
  const handlePublishNow = async (postId: string) => {
    if (!creator?.id || scheduledActionInProgress) return;
    setScheduledActionInProgress(postId);
    try {
      if (isMockMode || !isFirebaseConnected) {
        const target = scheduledPosts.find(p => p.id === postId);
        setScheduledPosts(prev => prev.filter(p => p.id !== postId));
        if (target) {
          const publishedTarget: Post = {
            ...target,
            isPublished: true,
            publishStatus: 'published',
            publishedAt: new Date().toISOString(),
          };
          setCreatorPosts(prev => [publishedTarget, ...prev]);
        }
      } else {
        await publishScheduledPostNow(postId, creator.id);
        const target = scheduledPosts.find(p => p.id === postId);
        setScheduledPosts(prev => prev.filter(p => p.id !== postId));
        if (target) {
          const publishedTarget: Post = {
            ...target,
            isPublished: true,
            publishStatus: 'published',
            publishedAt: new Date().toISOString(),
          };
          setCreatorPosts(prev => [publishedTarget, ...prev]);
        }
      }
    } catch (err) {
      console.error('Error publishing scheduled post now:', err);
    } finally {
      setScheduledActionInProgress(null);
    }
  };

  // Handle Cancel / Delete Scheduled Post
  const handleCancelSchedule = async (postId: string) => {
    if (!creator?.id || scheduledActionInProgress) return;
    if (!window.confirm('Are you sure you want to cancel and delete this scheduled post?')) {
      return;
    }
    setScheduledActionInProgress(postId);
    try {
      if (isMockMode || !isFirebaseConnected) {
        setScheduledPosts(prev => prev.filter(p => p.id !== postId));
      } else {
        await cancelScheduledPost(postId, creator.id);
        setScheduledPosts(prev => prev.filter(p => p.id !== postId));
      }
    } catch (err) {
      console.error('Error canceling scheduled post:', err);
    } finally {
      setScheduledActionInProgress(null);
    }
  };

  // Fetch Liked Posts independently when liked tab active
  useEffect(() => {
    let isMounted = true;
    if (activeTab !== 'liked' || likedPostIds.length === 0) {
      setLikedPosts([]);
      setIsLoadingLikedPosts(false);
      return;
    }

    const loadLikedPosts = async () => {
      setIsLoadingLikedPosts(true);
      if (isMockMode || !isFirebaseConnected) {
        if (isMounted) {
          setLikedPosts(posts.filter(p => likedPostIds.includes(p.id)));
          setIsLoadingLikedPosts(false);
        }
        return;
      }

      try {
        const cachedMap = new Map<string, Post>(posts.map(p => [p.id, p]));
        const missingIds: string[] = [];
        const resolved: Post[] = [];

        for (const id of likedPostIds) {
          if (cachedMap.has(id)) {
            resolved.push(cachedMap.get(id)!);
          } else {
            missingIds.push(id);
          }
        }

        if (missingIds.length > 0) {
          const fetchedMissing = await fetchFirestorePostsByIds(missingIds);
          resolved.push(...fetchedMissing);
        }

        if (isMounted) {
          setLikedPosts(resolved);
        }
      } catch (err) {
        console.error('Failed to load liked posts:', err);
      } finally {
        if (isMounted) {
          setIsLoadingLikedPosts(false);
        }
      }
    };

    loadLikedPosts();

    return () => {
      isMounted = false;
    };
  }, [activeTab, likedPostIds, posts, isMockMode, isFirebaseConnected]);

  const handleTabChange = (newTab: 'posts' | 'collections' | 'liked' | 'scheduled') => {
    setActiveTab(newTab);
    if (creator?.username) {
      navigateTo({ type: 'profile', username: creator.username, tab: newTab });
    }
  };

  const handleRetryCreatorPosts = () => {
    if (!creator?.id) return;
    setIsLoadingCreatorPosts(true);
    setCreatorPostsError(null);
    fetchPostsByCreator(creator.id, 50)
      .then(fetched => {
        setCreatorPosts(fetched.filter(p => p.isPublished !== false && p.publishStatus !== 'scheduled'));
        setCreatorPostsError(null);
      })
      .catch(err => {
        console.error('Failed on retry creator posts:', err);
        setCreatorPostsError("We couldn't load these visuals. Please try again.");
      })
      .finally(() => {
        setIsLoadingCreatorPosts(false);
      });
  };

  const handleShareProfile = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${creator?.displayName || 'Creator'} (@${creator?.username || username}) on KROMA`,
          text: `Check out ${creator?.displayName || 'this creator'}'s visual portfolio on KROMA.`,
          url,
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColTitle.trim() || isCreatingCol) return;

    setIsCreatingCol(true);
    try {
      await createCollection(newColTitle.trim(), newColDesc.trim(), isColPrivate);
      setIsCreateCollectionOpen(false);
      setNewColTitle('');
      setNewColDesc('');
      setIsColPrivate(false);
    } catch (err) {
      console.error('Failed to create collection:', err);
    } finally {
      setIsCreatingCol(false);
    }
  };

  if (isLoadingUser) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-pulse space-y-6">
        <div className="h-44 sm:h-64 bg-surface-elevated rounded-3xl w-full" />
        <div className="flex items-center gap-6 px-4">
          <div className="w-24 h-24 rounded-full bg-surface-elevated -mt-12" />
          <div className="space-y-2 flex-1">
            <div className="h-6 bg-surface-elevated rounded w-48" />
            <div className="h-4 bg-surface-elevated rounded w-28" />
          </div>
        </div>
      </div>
    );
  }

  if (!creator) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-surface-elevated text-text-muted flex items-center justify-center mx-auto">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-text-primary">Creator Not Found</h2>
        <p className="text-sm text-text-secondary">
          The creator profile @{username} does not exist or has been removed.
        </p>
        <button
          onClick={() => navigateTo({ type: 'home' })}
          className="px-6 py-2.5 rounded-full bg-accent text-white font-semibold text-xs hover:bg-accent-hover transition-colors shadow-soft cursor-pointer"
        >
          Return Home
        </button>
      </div>
    );
  }

  const isFollowing = followingUserIds.includes(creator.id);
  const creatorCollections = getCollectionsByUserId(creator.id);

  // If Creator Analytics view is active
  if (showAnalytics && isSelf) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <AnalyticsErrorBoundary
          onBack={() => setShowAnalytics(false)}
          title="Creator Analytics"
        >
          {isLoadingCreatorPosts && creatorPosts.length === 0 ? (
            <div className="py-20 text-center flex flex-col items-center justify-center space-y-4">
              <Loader2 className="w-8 h-8 text-accent animate-spin" />
              <p className="text-sm text-text-muted">Loading creator analytics...</p>
            </div>
          ) : (
            <CreatorAnalyticsView
              creator={creator}
              posts={creatorPosts || []}
              totalViews={totalViews}
              onBack={() => setShowAnalytics(false)}
            />
          )}
        </AnalyticsErrorBoundary>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-5 sm:space-y-7">
      {/* Cover Image Banner */}
      <div className="relative h-40 sm:h-64 md:h-72 rounded-3xl bg-surface-elevated overflow-hidden border border-border group">
        {creator.coverImageUrl || creator.bannerUrl ? (
          <img
            src={creator.coverImageUrl || creator.bannerUrl}
            alt={`${creator.displayName} cover`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-r from-accent/15 via-surface-elevated to-accent/10 flex items-center justify-center">
            <span className="text-text-muted text-xs sm:text-sm font-medium tracking-wider uppercase opacity-40">
              KROMA VISUAL CREATOR
            </span>
          </div>
        )}
      </div>

      {/* Header Profile Section */}
      <div className="relative -mt-14 sm:-mt-16 lg:-mt-20 px-4 sm:px-6 space-y-4">
        <div className="flex flex-row items-end justify-between gap-3 sm:gap-4 w-full">
          {/* Profile Avatar */}
          <div className="relative inline-block self-start sm:self-end shrink-0">
            <Avatar
              src={creator.avatarUrl}
              alt={creator.displayName}
              size="2xl"
              className="w-20 h-20 sm:w-28 sm:h-28 lg:w-32 lg:h-32 rounded-full ring-4 ring-surface shadow-soft"
            />
          </div>

          {/* Action Buttons (Right Aligned on Mobile, Tablet & Desktop) */}
          <div className="flex items-center justify-end gap-1.5 sm:gap-2 lg:gap-2.5 shrink-0 self-end pb-1 sm:pb-1.5">
            <button
              type="button"
              id="btn-share-profile"
              onClick={handleShareProfile}
              aria-label={copiedLink ? "Profile link copied" : "Share profile"}
              className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 lg:w-auto lg:h-auto p-0 lg:px-3.5 lg:py-2 rounded-full bg-surface border border-border text-text-secondary text-xs font-semibold hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer shadow-soft shrink-0"
              title="Share profile"
            >
              {copiedLink ? (
                <>
                  <Check className="w-4 h-4 sm:w-4 sm:h-4 lg:w-3.5 lg:h-3.5 text-accent shrink-0" />
                  <span className="hidden lg:inline text-accent">Copied</span>
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4 sm:w-4 sm:h-4 lg:w-3.5 lg:h-3.5 shrink-0" />
                  <span className="hidden lg:inline">Share</span>
                </>
              )}
            </button>

            {isSelf ? (
              <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-2 shrink-0">
                <button
                  type="button"
                  id="btn-creator-analytics"
                  onClick={() => setShowAnalytics(true)}
                  aria-label="View analytics"
                  className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 lg:w-auto lg:h-auto p-0 lg:px-3.5 lg:py-2 rounded-full bg-surface border border-border text-text-secondary text-xs font-semibold hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer shadow-soft shrink-0"
                  title="View analytics for your published visuals"
                >
                  <BarChart3 className="w-4 h-4 sm:w-4 sm:h-4 lg:w-3.5 lg:h-3.5 shrink-0" />
                  <span className="hidden lg:inline">Analytics</span>
                </button>

                <button
                  type="button"
                  id="btn-edit-profile"
                  onClick={() => navigateTo({ type: 'settings' })}
                  aria-label="Settings"
                  className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 lg:w-auto lg:h-auto p-0 lg:px-3.5 lg:py-2 rounded-full bg-surface border border-border text-text-secondary text-xs font-semibold hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer shadow-soft shrink-0"
                  title="Account Settings"
                >
                  <Settings className="w-4 h-4 sm:w-4 sm:h-4 lg:w-3.5 lg:h-3.5 shrink-0" />
                  <span className="hidden lg:inline">Settings</span>
                </button>
              </div>
            ) : (
              <button
                id="btn-follow-profile"
                onClick={() => toggleFollowUser(creator.id)}
                className={`px-4 py-2 sm:px-5 sm:py-2 rounded-full text-xs font-semibold transition-all active:scale-95 cursor-pointer shadow-soft shrink-0 ${
                  isFollowing
                    ? 'bg-surface-elevated border border-border text-text-primary'
                    : 'bg-accent hover:bg-accent-hover text-white'
                }`}
              >
                {isFollowing ? 'Following' : 'Follow'}
              </button>
            )}
          </div>
        </div>

        {/* User Details & Stats */}
        <div className="px-0 space-y-3 pt-1">
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-text-primary tracking-tight break-words">
                {creator.displayName}
              </h1>
            </div>
            <div className="flex items-center gap-1.5 pt-0.5">
              <p className="text-xs sm:text-sm font-medium text-text-secondary">@{creator.username}</p>
            </div>
          </div>

          {/* Primary Compact Stats Row: Published Posts | Followers | Following | Views */}
          <div className="flex items-center gap-3.5 sm:gap-5 text-xs sm:text-sm text-text-secondary pt-0.5 flex-wrap">
            <div className="flex items-center gap-1 shrink-0 whitespace-nowrap">
              <strong className="font-bold text-text-primary">
                {Math.max(0, isLoadingCreatorPosts
                  ? (creator.postsCount || 0)
                  : (creatorPosts.length > 0 ? creatorPosts.length : (creator.postsCount || 0)))}
              </strong>
              <span className="text-text-muted whitespace-nowrap">
                {Math.max(0, (isLoadingCreatorPosts ? (creator.postsCount || 0) : (creatorPosts.length > 0 ? creatorPosts.length : (creator.postsCount || 0)))) === 1
                  ? 'Post'
                  : 'Posts'}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0 whitespace-nowrap">
              <strong className="font-bold text-text-primary">
                {formatCompactNumber(Math.max(0, creator.followersCount || 0))}
              </strong>
              <span className="text-text-muted whitespace-nowrap">
                {Math.max(0, creator.followersCount || 0) === 1 ? 'Follower' : 'Followers'}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0 whitespace-nowrap">
              <strong className="font-bold text-text-primary">
                {formatCompactNumber(Math.max(0, creator.followingCount || 0))}
              </strong>
              <span className="text-text-muted whitespace-nowrap">Following</span>
            </div>

            <div className="flex items-center gap-1 shrink-0 whitespace-nowrap">
              <strong className="font-bold text-text-primary">
                {formatCompactNumber(Math.max(0, totalViews))}
              </strong>
              <span className="text-text-muted whitespace-nowrap">Views</span>
            </div>
          </div>

          {/* Compact About Area (Preview Bio, Location, Website) */}
          {(() => {
            const DEFAULT_ABOUT = 'Sharing visual ideas and creative inspiration on KROMA.';
            const bioText = creator.bio && creator.bio.trim().length > 0 ? creator.bio.trim() : DEFAULT_ABOUT;
            const isLongBio = bioText.length > 120;
            const previewText = isLongBio ? `${bioText.slice(0, 120).trim()}...` : bioText;
            const rawWebsite = creator.websiteUrl || (creator as any).website || '';

            return (
              <div className="space-y-2 pt-2 border-t border-border max-w-2xl">
                <div className="text-xs sm:text-sm text-text-secondary leading-relaxed">
                  <span>{previewText} </span>
                  <button
                    id="btn-view-all-about"
                    type="button"
                    onClick={() => setIsAboutSheetOpen(true)}
                    className="font-semibold text-text-primary underline underline-offset-2 hover:text-accent transition-colors cursor-pointer inline-block ml-0.5"
                  >
                    View all
                  </button>
                </div>

                {(creator.location || rawWebsite) && (
                  <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted pt-0.5">
                    {creator.location && (
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-text-muted shrink-0" />
                        <span>{creator.location}</span>
                      </div>
                    )}

                    {rawWebsite && (
                      <a
                        href={rawWebsite.startsWith('http') ? rawWebsite : `https://${rawWebsite}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-text-secondary hover:text-text-primary transition-colors"
                      >
                        <Globe className="w-3.5 h-3.5 text-text-muted shrink-0" />
                        <span className="truncate max-w-[180px]">
                          {rawWebsite.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                        </span>
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Profile Tabs: Posts | Scheduled (Owner-Only) | Collections | Liked */}
      <div className="flex items-center gap-1.5 sm:gap-2 border-b border-border pb-3 overflow-x-auto no-scrollbar overscroll-x-contain">
        <button
          id="tab-profile-posts"
          onClick={() => handleTabChange('posts')}
          className={`flex items-center gap-1.5 px-3 sm:px-4.5 py-1.5 sm:py-2 rounded-full text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
            activeTab === 'posts'
              ? 'bg-accent text-white shadow-soft'
              : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary'
          }`}
        >
          <Grid className="w-3.5 h-3.5" />
          <span>Posts</span>
        </button>

        {isSelf && (
          <button
            id="tab-profile-scheduled"
            onClick={() => handleTabChange('scheduled')}
            className={`flex items-center gap-1.5 px-3 sm:px-4.5 py-1.5 sm:py-2 rounded-full text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'scheduled'
                ? 'bg-accent text-white shadow-soft'
                : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Scheduled</span>
            {scheduledPosts.length > 0 && (
              <span
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeTab === 'scheduled'
                    ? 'bg-white text-accent'
                    : 'bg-accent/15 text-accent dark:bg-accent/25'
                }`}
              >
                {scheduledPosts.length}
              </span>
            )}
          </button>
        )}

        <button
          id="tab-profile-collections"
          onClick={() => handleTabChange('collections')}
          className={`flex items-center gap-1.5 px-3 sm:px-4.5 py-1.5 sm:py-2 rounded-full text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
            activeTab === 'collections'
              ? 'bg-accent text-white shadow-soft'
              : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary'
          }`}
        >
          <Bookmark className="w-3.5 h-3.5" />
          <span>Collections</span>
        </button>

        {isSelf && (
          <button
            id="tab-profile-liked"
            onClick={() => handleTabChange('liked')}
            className={`flex items-center gap-1.5 px-3 sm:px-4.5 py-1.5 sm:py-2 rounded-full text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'liked'
                ? 'bg-accent text-white shadow-soft'
                : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary'
            }`}
          >
            <Heart className="w-3.5 h-3.5" />
            <span>Liked</span>
          </button>
        )}
      </div>

      {/* Tab Contents */}
      <div>
        {/* Tab 1: Published Posts */}
        {activeTab === 'posts' && (
          <>
            {isLoadingCreatorPosts ? (
              <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div
                    key={i}
                    className="break-inside-avoid rounded-2xl bg-surface-elevated border border-border animate-pulse h-64 w-full mb-4"
                  />
                ))}
              </div>
            ) : creatorPostsError ? (
              <div className="py-16 text-center max-w-md mx-auto space-y-4">
                <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <h3 className="text-base font-semibold text-text-primary">
                  Unable to load visuals
                </h3>
                <p className="text-xs text-text-secondary">
                  {creatorPostsError}
                </p>
                <button
                  type="button"
                  id="btn-retry-creator-posts"
                  onClick={handleRetryCreatorPosts}
                  className="px-4 py-2 rounded-full bg-accent hover:bg-accent-hover text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-soft transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Try Again</span>
                </button>
              </div>
            ) : (
              <MasonryFeed
                posts={creatorPosts}
                emptyTitle={isSelf ? 'No visuals published yet' : `${creator.displayName} has not published visuals yet`}
                emptyDescription={
                  isSelf
                    ? 'Upload and publish your visual work.'
                    : 'Check back later to see new posts from this creator.'
                }
                emptyIcon={<ImageOff className="w-5 h-5 text-accent" />}
                containerClassName="w-full py-2.5 sm:py-6"
                discoverySource="profile"
              />
            )}
          </>
        )}

        {/* Tab 2: Scheduled Posts (Owner-Only) */}
        {activeTab === 'scheduled' && isSelf && (
          <div className="py-2.5 sm:py-6 space-y-6">
            {isLoadingScheduledPosts ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {[1, 2, 3].map(i => (
                  <div
                    key={i}
                    className="rounded-3xl bg-surface-elevated border border-border animate-pulse h-80 w-full"
                  />
                ))}
              </div>
            ) : scheduledPosts.length === 0 ? (
              <div className="py-16 text-center max-w-md mx-auto space-y-4">
                <div className="w-14 h-14 rounded-full bg-accent/10 text-accent flex items-center justify-center mx-auto">
                  <Clock className="w-7 h-7" />
                </div>
                <h3 className="text-base font-semibold text-text-primary">
                  No Scheduled Posts
                </h3>
                <p className="text-xs text-text-secondary leading-relaxed">
                  Posts you schedule for future publication will appear here. Only you can view your scheduled queue.
                </p>
                <button
                  type="button"
                  id="btn-create-scheduled-post"
                  onClick={openCreateModal}
                  className="px-5 py-2.5 rounded-full bg-accent hover:bg-accent-hover text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer shadow-soft transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create a Post</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
                {scheduledPosts.map(post => {
                  const isBusy = scheduledActionInProgress === post.id;
                  const schedDate = post.scheduledPublishAt ? new Date(post.scheduledPublishAt) : null;
                  const formattedDate = schedDate && !isNaN(schedDate.getTime())
                    ? schedDate.toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })
                    : 'Scheduled';

                  return (
                    <div
                      key={post.id}
                      className="group rounded-3xl bg-surface border border-border overflow-hidden shadow-soft flex flex-col hover:border-accent/40 transition-all"
                    >
                      {/* Thumbnail Container */}
                      <div className="relative aspect-[4/3] bg-surface-elevated overflow-hidden">
                        <img
                          src={post.thumbnailUrl || post.imageUrl}
                          alt={post.imageAltText || post.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        {/* Status Tag */}
                        <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-black/70 backdrop-blur-md text-white text-[11px] font-semibold flex items-center gap-1.5 shadow-soft">
                          <Clock className="w-3.5 h-3.5 text-accent" />
                          <span>Scheduled</span>
                        </div>
                        {post.isAIGenerated && (
                          <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md text-amber-300 text-[10px] font-medium flex items-center gap-1">
                            <Sparkles className="w-3 h-3" />
                            <span>AI</span>
                          </div>
                        )}
                      </div>

                      {/* Card Content */}
                      <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-4">
                        <div className="space-y-1.5">
                          <h4 className="font-semibold text-text-primary text-sm line-clamp-1">
                            {post.title || 'Untitled Visual'}
                          </h4>
                          {post.description && (
                            <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed">
                              {post.description}
                            </p>
                          )}
                        </div>

                        {/* Scheduled Timing Notice */}
                        <div className="p-3 rounded-2xl bg-surface-elevated border border-border/80 flex items-center gap-2.5 text-xs text-text-secondary">
                          <Calendar className="w-4 h-4 text-accent shrink-0" />
                          <div className="flex-1 truncate">
                            <span className="text-text-muted text-[10px] uppercase font-bold block tracking-wider">
                              Publishing At
                            </span>
                            <span className="font-medium text-text-primary text-xs">
                              {formattedDate}
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            id={`btn-publish-now-${post.id}`}
                            disabled={isBusy}
                            onClick={() => handlePublishNow(post.id)}
                            className="flex-1 px-3.5 py-2 rounded-full bg-accent hover:bg-accent-hover text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-soft disabled:opacity-50"
                          >
                            {isBusy ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>Publishing...</span>
                              </>
                            ) : (
                              <>
                                <Send className="w-3.5 h-3.5" />
                                <span>Publish Now</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            id={`btn-cancel-schedule-${post.id}`}
                            disabled={isBusy}
                            onClick={() => handleCancelSchedule(post.id)}
                            aria-label="Cancel scheduled post"
                            title="Cancel and delete post"
                            className="p-2 rounded-full bg-surface-elevated border border-border text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Collections */}
        {activeTab === 'collections' && (
          <CollectionsGrid
            collections={creatorCollections}
            emptyTitle="No Collections Found"
            emptyDescription={
              isSelf
                ? 'Save posts into collections to organize your visuals.'
                : `${creator.displayName} has no public collections yet.`
            }
            onOpenCreate={isSelf ? () => setIsCreateCollectionOpen(true) : undefined}
          />
        )}

        {/* Tab 4: Liked Posts */}
        {activeTab === 'liked' && isSelf && (
          <>
            {isLoadingLikedPosts ? (
              <div className="columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-2.5 sm:gap-4 lg:gap-5 space-y-2.5 sm:space-y-4">
                {[1, 2, 3, 4].map(i => (
                  <div
                    key={i}
                    className="break-inside-avoid rounded-2xl bg-surface-elevated border border-border animate-pulse h-64 w-full mb-2.5 sm:mb-4"
                  />
                ))}
              </div>
            ) : (
              <MasonryFeed
                posts={likedPosts}
                emptyTitle="No Liked Visuals Yet"
                emptyDescription="Find posts you like and save them here."
                emptyIcon={<Heart className="w-5 h-5 text-accent" />}
                emptyActionLabel="Browse Posts"
                emptyActionIcon={<LayoutGrid className="w-4 h-4 text-white" />}
                onEmptyAction={() => navigateTo({ type: 'home' })}
                containerClassName="w-full py-2.5 sm:py-6"
                discoverySource="profile"
              />
            )}
          </>
        )}
      </div>

      {/* Create Collection Modal */}
      {isCreateCollectionOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            id="modal-create-collection-profile"
            className="w-full max-w-md bg-surface rounded-3xl p-6 border border-border shadow-premium space-y-5 animate-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-text-primary">
                Create New Collection
              </h3>
              <button
                type="button"
                onClick={() => setIsCreateCollectionOpen(false)}
                className="w-8 h-8 rounded-full bg-surface-elevated flex items-center justify-center text-text-muted hover:text-text-primary transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCollection} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-text-primary mb-1">
                  Collection Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Brand Identity Inspiration"
                  value={newColTitle}
                  onChange={e => setNewColTitle(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl bg-surface-elevated border border-border focus:border-accent text-text-primary outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block font-semibold text-text-primary mb-1">
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="What is this collection about?"
                  value={newColDesc}
                  onChange={e => setNewColDesc(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl bg-surface-elevated border border-border focus:border-accent text-text-primary outline-none transition-colors resize-none"
                />
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer py-1">
                <input
                  type="checkbox"
                  checked={isColPrivate}
                  onChange={e => setIsColPrivate(e.target.checked)}
                  className="w-4 h-4 rounded text-accent focus:ring-accent border-border"
                />
                <span className="text-text-secondary font-medium flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  Make this collection private
                </span>
              </label>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateCollectionOpen(false)}
                  className="px-4 py-2 rounded-full text-text-secondary hover:bg-surface-elevated transition-colors cursor-pointer font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newColTitle.trim() || isCreatingCol}
                  className="px-5 py-2 rounded-full bg-accent hover:bg-accent-hover text-white transition-colors cursor-pointer font-semibold shadow-soft disabled:opacity-50"
                >
                  {isCreatingCol ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* About Bottom Sheet */}
      <AboutBottomSheet
        isOpen={isAboutSheetOpen}
        onClose={() => setIsAboutSheetOpen(false)}
        user={creator}
        postsCount={
          isLoadingCreatorPosts
            ? (creator.postsCount || 0)
            : (creatorPosts.length > 0 ? creatorPosts.length : (creator.postsCount || 0))
        }
        totalViews={totalViews}
      />
    </div>
  );
};

