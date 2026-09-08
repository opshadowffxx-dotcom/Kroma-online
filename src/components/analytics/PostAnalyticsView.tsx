import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Post, User, DailyAnalyticsBucket } from '../../types';
import { fetchFirestorePostById, fetchPostDailyBuckets } from '../../services/firebase/postService';
import {
  ArrowLeft,
  Eye,
  Heart,
  Bookmark,
  MessageCircle,
  ExternalLink,
  MousePointerClick,
  Lock,
  Smartphone,
  Tablet,
  Laptop,
  Globe,
  Compass,
  TrendingUp,
  Share2,
  Check,
  Calendar,
  ShieldCheck,
  Activity,
  Percent,
  Radio,
  Layers,
} from 'lucide-react';
import { formatCompactNumber } from '../../utils/numberFormatter';
import {
  extractCanonicalDeviceCounts,
  getCountryFlagEmoji,
  getCountryDisplayName,
} from '../../utils/trafficTracker';
import { AnalyticsTrendChart, ChartDataPoint } from './AnalyticsTrendChart';
import {
  fetchBreakdownsFromGA4,
  GA4BreakdownsReport,
  selectGA4BreakdownsRange,
} from '../../services/analytics/ga4ReportService';

interface PostAnalyticsViewProps {
  postId: string;
}

type TimeRangeOption = '7d' | '30d' | '90d' | 'all';
type MetricOption = 'views' | 'impressions' | 'linkClicks' | 'likes' | 'saves' | 'comments' | 'engagement';

export const PostAnalyticsView: React.FC<PostAnalyticsViewProps> = ({ postId }) => {
  const {
    currentUser,
    posts,
    getPostById,
    getUserById,
    navigateTo,
    previousRoute,
    openAuthModal,
  } = useApp();

  const [post, setPost] = useState<Post | null>(() => {
    return Array.isArray(posts) ? posts.find(p => p.id === postId) || null : null;
  });
  const [creator, setCreator] = useState<User | Post['creator'] | null>(() => post?.creator || null);
  const [isLoading, setIsLoading] = useState<boolean>(!post);
  const [error, setError] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);

  // Time Range & Metric State for Daily Trend Chart
  const [timeRange, setTimeRange] = useState<TimeRangeOption>('30d');
  const [selectedMetric, setSelectedMetric] = useState<MetricOption>('views');
  const [dailyBuckets, setDailyBuckets] = useState<DailyAnalyticsBucket[]>([]);
  const [isLoadingBuckets, setIsLoadingBuckets] = useState<boolean>(true);

  // GA4 Server-Side Combined Breakdowns Report
  const [ga4DailyReport, setGa4DailyReport] = useState<GA4BreakdownsReport | null>(null);
  const [isLoadingGa4Report, setIsLoadingGa4Report] = useState<boolean>(false);
  const ga4Report = useMemo(
    () => (ga4DailyReport ? selectGA4BreakdownsRange(ga4DailyReport, timeRange) : null),
    [ga4DailyReport, timeRange]
  );

  // Load post if not already available in cache
  useEffect(() => {
    let isMounted = true;

    const loadPostData = async () => {
      if (!postId) {
        setError('Post ID not specified.');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        // 1. Try AppContext
        let found: Post | null | undefined = await getPostById(postId);

        // 2. Fallback to Firestore direct fetch
        if (!found) {
          found = await fetchFirestorePostById(postId);
        }

        if (!isMounted) return;

        if (found) {
          setPost(found);
          if (found.creator) {
            setCreator(found.creator);
          } else if (found.creatorId) {
            const user = await getUserById(found.creatorId);
            if (isMounted && user) {
              setCreator(user);
            }
          }
        } else {
          setError('This post could not be found or has been removed.');
        }
      } catch (err: any) {
        console.error('Failed to load post analytics:', err);
        if (isMounted) {
          setError('Failed to load post analytics. Please try again.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadPostData();

    return () => {
      isMounted = false;
    };
  }, [postId, getPostById, getUserById]);

  // Keep local post updated if context posts update
  useEffect(() => {
    if (!Array.isArray(posts)) return;
    const livePost = posts.find(p => p.id === postId);
    if (livePost) {
      setPost(livePost);
    }
  }, [posts, postId]);

  // Check ownership
  const isOwner = useMemo(() => {
    if (!currentUser || !post) return false;
    return currentUser.id === post.creatorId || currentUser.id === post.creator?.id;
  }, [currentUser, post]);

  // Date range calculation for time range
  const { startDateStr, endDateStr } = useMemo(() => {
    const today = new Date();
    const endDate = today.toISOString().slice(0, 10);
    if (timeRange === 'all') {
      return { startDateStr: undefined, endDateStr: endDate };
    }
    const days = timeRange === '7d' ? 6 : timeRange === '30d' ? 29 : 89;
    const past = new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
    return { startDateStr: past.toISOString().slice(0, 10), endDateStr: endDate };
  }, [timeRange]);

  // Fetch daily buckets for this post
  useEffect(() => {
    if (!post?.id) return;
    let isCancelled = false;
    setIsLoadingBuckets(true);

    fetchPostDailyBuckets(post.id, startDateStr, endDateStr)
      .then(buckets => {
        if (!isCancelled) {
          setDailyBuckets(buckets);
          setIsLoadingBuckets(false);
        }
      })
      .catch(err => {
        console.warn('Could not load post daily buckets:', err);
        if (!isCancelled) {
          setDailyBuckets([]);
          setIsLoadingBuckets(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [post?.id, startDateStr, endDateStr]);

  // Process Daily Buckets into chart data
  const { chartData, earliestTrackedDate } = useMemo(() => {
    if (!dailyBuckets || dailyBuckets.length === 0) {
      return { chartData: [], earliestTrackedDate: undefined };
    }

    const earliest = dailyBuckets[0].date;
    const bucketMap = new Map<string, DailyAnalyticsBucket>();
    dailyBuckets.forEach(b => bucketMap.set(b.date, b));

    const startCandidate = startDateStr && startDateStr > earliest ? startDateStr : earliest;
    const points: ChartDataPoint[] = [];

    try {
      const cur = new Date(startCandidate + 'T00:00:00Z');
      const end = new Date(endDateStr + 'T00:00:00Z');

      while (cur <= end) {
        const dStr = cur.toISOString().slice(0, 10);
        const b = bucketMap.get(dStr);

        let val = 0;
        if (b) {
          if (selectedMetric === 'views') val = b.views || 0;
          else if (selectedMetric === 'impressions') val = b.impressions || 0;
          else if (selectedMetric === 'linkClicks') val = b.linkClicks || 0;
          else if (selectedMetric === 'likes') val = b.likes || 0;
          else if (selectedMetric === 'saves') val = b.saves || 0;
          else if (selectedMetric === 'comments') val = b.comments || 0;
          else if (selectedMetric === 'engagement') {
            const imp = b.impressions || 0;
            const eng = (b.likes || 0) + (b.saves || 0) + (b.comments || 0);
            val = imp > 0 ? Number(((eng / imp) * 100).toFixed(1)) : 0;
          }
        }

        points.push({ date: dStr, value: val });
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    } catch {
      dailyBuckets.forEach(b => {
        let val = b.views || 0;
        if (selectedMetric === 'impressions') val = b.impressions || 0;
        else if (selectedMetric === 'linkClicks') val = b.linkClicks || 0;
        else if (selectedMetric === 'likes') val = b.likes || 0;
        else if (selectedMetric === 'saves') val = b.saves || 0;
        else if (selectedMetric === 'comments') val = b.comments || 0;
        points.push({ date: b.date, value: val });
      });
    }

    return {
      chartData: points,
      earliestTrackedDate: startDateStr && startDateStr < earliest ? earliest : undefined,
    };
  }, [dailyBuckets, startDateStr, endDateStr, selectedMetric]);

  // Handle back button
  const handleBack = () => {
    if (previousRoute) {
      navigateTo(previousRoute);
    } else if (post) {
      navigateTo({ type: 'post', postId: post.id });
    } else {
      navigateTo({ type: 'home' });
    }
  };

  const handleCopyLink = () => {
    try {
      const url = `${window.location.origin}/analytics/post/${postId}`;
      navigator.clipboard.writeText(url);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // ignore
    }
  };

  // Lifetime Unique Impressions (Reach)
  const impressionsCount = useMemo(() => {
    if (!post) return 0;
    return post.uniqueImpressionsCount || 0;
  }, [post]);

  // Fetch GA4 Combined Breakdowns when Reach >= 1000
  useEffect(() => {
    if (!post?.id || impressionsCount < 1000) {
      setGa4DailyReport(null);
      setIsLoadingGa4Report(false);
      return;
    }

    let isCancelled = false;
    setIsLoadingGa4Report(true);

    fetchBreakdownsFromGA4({ postId: post.id })
      .then(report => {
        if (!isCancelled) {
          setGa4DailyReport(report);
          setIsLoadingGa4Report(false);
        }
      })
      .catch(err => {
        console.warn('Could not fetch GA4 breakdown report for post:', err);
        if (!isCancelled) {
          setIsLoadingGa4Report(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [post?.id, impressionsCount]);

  // Link Clicks Count
  const linkClicksCount = useMemo(() => {
    if (!post) return 0;
    return post.linkClicksCount || 0;
  }, [post]);

  // Click-Through Rate (CTR): Link Clicks / Reach
  const ctrRate = useMemo(() => {
    if (!post || impressionsCount <= 0) return '0.0%';
    const clicks = post.linkClicksCount || 0;
    const rate = (clicks / impressionsCount) * 100;
    return `${rate.toFixed(1)}%`;
  }, [post, impressionsCount]);

  // Engagement Rate calculation: (Likes + Saves + Comments) / Reach
  const engagementRate = useMemo(() => {
    if (!post || impressionsCount <= 0) return '0.0%';
    const interactions = (post.likesCount || 0) + (post.savesCount || 0) + (post.commentsCount || 0);
    const rate = (interactions / impressionsCount) * 100;
    return `${rate.toFixed(1)}%`;
  }, [post, impressionsCount]);

  // View Rate (uniqueViews / uniqueImpressions * 100)
  const viewRate = useMemo(() => {
    if (!post || impressionsCount <= 0) return '0.0%';
    const v = post.viewsCount || 0;
    const rate = (v / impressionsCount) * 100;
    return `${rate.toFixed(1)}%`;
  }, [post, impressionsCount]);

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 animate-pulse">
        <div className="h-9 w-40 bg-surface-elevated rounded-xl" />
        <div className="h-40 bg-surface-elevated rounded-2xl" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="h-28 bg-surface-elevated rounded-2xl" />
          <div className="h-28 bg-surface-elevated rounded-2xl" />
          <div className="h-28 bg-surface-elevated rounded-2xl" />
          <div className="h-28 bg-surface-elevated rounded-2xl" />
        </div>
        <div className="h-64 bg-surface-elevated rounded-2xl" />
      </div>
    );
  }

  // Error / Not found state
  if (error || !post) {
    return (
      <div className="w-full max-w-xl mx-auto px-4 py-16 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-surface-elevated border border-border flex items-center justify-center mx-auto text-text-muted">
          <Activity className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-text-primary">Post Analytics Unavailable</h2>
        <p className="text-sm text-text-muted">{error || 'This post does not exist or has been deleted.'}</p>
        <button
          onClick={handleBack}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-elevated hover:bg-border text-text-primary font-medium text-sm transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return</span>
        </button>
      </div>
    );
  }

  // Owner-only Access Barrier
  if (!isOwner) {
    return (
      <div className="w-full max-w-lg mx-auto px-4 py-16 sm:py-24 text-center space-y-6">
        <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto shadow-sm">
          <Lock className="w-7 h-7" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-text-primary tracking-tight">Private Post Analytics</h2>
          <p className="text-sm text-text-muted max-w-md mx-auto leading-relaxed">
            Detailed audience telemetry and performance breakdowns are strictly reserved for the creator of this post.
          </p>
        </div>

        {/* Thumbnail Preview Card */}
        <div className="p-3.5 rounded-2xl bg-surface-elevated border border-border flex items-center gap-3.5 text-left max-w-sm mx-auto">
          <div className="w-14 h-14 rounded-xl overflow-hidden bg-bg border border-border shrink-0">
            <img
              src={post.thumbnailUrl || post.imageUrl}
              alt={post.title}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm text-text-primary truncate">{post.title || 'Untitled Post'}</p>
            {creator && (
              <div className="flex items-center gap-1 mt-0.5">
                <p className="text-xs text-text-muted truncate">By {creator.displayName}</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            onClick={handleBack}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-surface-elevated hover:bg-border text-text-primary text-sm font-medium transition-colors cursor-pointer"
          >
            Go Back
          </button>

          {!currentUser && (
            <button
              onClick={() => openAuthModal('login')}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:opacity-95 transition-opacity cursor-pointer shadow-sm"
            >
              Sign In to Your Account
            </button>
          )}

          {currentUser && (
            <button
              onClick={() => navigateTo({ type: 'post', postId: post.id })}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:opacity-95 transition-opacity cursor-pointer shadow-sm"
            >
              View Public Post
            </button>
          )}
        </div>
      </div>
    );
  }

  // Format creation date
  const createdDateFormatted = post.createdAt
    ? new Date(post.createdAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <div id="post-analytics-page" className="w-full max-w-6xl mx-auto px-3.5 sm:px-6 lg:px-8 py-5 sm:py-8 space-y-6">
      {/* Navigation & Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border">
        <div className="flex items-center gap-3">
          <button
            id="btn-back-from-post-analytics"
            onClick={handleBack}
            className="p-2 rounded-xl bg-surface-elevated hover:bg-border text-text-primary transition-colors cursor-pointer border border-border"
            title="Go back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold text-text-primary tracking-tight">
                Post Analytics
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Live Telemetry
              </span>
            </div>
            <p className="text-xs text-text-muted">Real-time deduplicated performance metrics</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyLink}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-elevated hover:bg-border text-text-primary text-xs font-medium transition-colors border border-border cursor-pointer"
            title="Copy link to this analytics report"
          >
            {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Share2 className="w-3.5 h-3.5 text-text-muted" />}
            <span>{copiedUrl ? 'Copied' : 'Share'}</span>
          </button>

          <button
            onClick={() => navigateTo({ type: 'post', postId: post.id })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent text-white text-xs font-semibold hover:opacity-95 transition-opacity cursor-pointer shadow-sm"
          >
            <span>View Public Post</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Hero Post Card */}
      <div className="p-4 sm:p-5 rounded-2xl bg-surface-elevated border border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-bg border border-border shrink-0">
            <img
              src={post.thumbnailUrl || post.imageUrl}
              alt={post.title}
              className="w-full h-full object-cover"
            />
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="text-base sm:text-lg font-bold text-text-primary truncate">
              {post.title || 'Untitled Post'}
            </h2>

            <div className="flex items-center gap-3 text-xs text-text-muted mt-1.5 flex-wrap">
              {creator && (
                <div className="flex items-center gap-1.5">
                  <img
                    src={creator.avatarUrl}
                    alt={creator.displayName}
                    className="w-4 h-4 rounded-full object-cover"
                  />
                  <span className="font-medium text-text-secondary">{creator.displayName}</span>
                  <span className="text-text-muted text-[11px]">(@{creator.username})</span>
                </div>
              )}

              {post.category && post.category !== 'all' && (
                <>
                  <span>•</span>
                  <span className="capitalize px-2 py-0.5 rounded-md bg-surface border border-border text-text-secondary text-[11px]">
                    {post.category.replace(/-/g, ' ')}
                  </span>
                </>
              )}

              {createdDateFormatted && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-text-muted" />
                    <span>{createdDateFormatted}</span>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Engagement Rate Badge */}
        <div className="sm:self-center p-3 sm:p-3.5 rounded-xl bg-surface border border-border flex items-center gap-3 shrink-0 w-full sm:w-auto justify-between sm:justify-start">
          <div className="w-10 h-10 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-text-muted uppercase tracking-wider">Engagement Rate</div>
            <div className="text-lg font-extrabold text-text-primary">{engagementRate}</div>
          </div>
        </div>
      </div>

      {/* Primary Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Unique Reach */}
        <div className="p-4 rounded-2xl bg-surface-elevated border border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-muted">Unique Reach</span>
            <Radio className="w-4 h-4 text-accent" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-text-primary mt-2">
            {impressionsCount.toLocaleString()}
          </div>
          <p className="text-[11px] text-text-muted mt-1">Unique discovery reach</p>
        </div>

        {/* Unique Views */}
        <div className="p-4 rounded-2xl bg-surface-elevated border border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-muted">Unique Views</span>
            <Eye className="w-4 h-4 text-accent" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-text-primary mt-2">
            {(post.viewsCount || 0).toLocaleString()}
          </div>
          <p className="text-[11px] text-text-muted mt-1">Lifetime unique opens</p>
        </div>

        {/* View Rate */}
        <div className="p-4 rounded-2xl bg-surface-elevated border border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-muted">View Rate</span>
            <Percent className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-text-primary mt-2">
            {viewRate}
          </div>
          <p className="text-[11px] text-text-muted mt-1" title="Views / Reach">Views / Reach</p>
        </div>

        {/* Link Clicks */}
        <div className="p-4 rounded-2xl bg-surface-elevated border border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-muted">Link Clicks</span>
            <MousePointerClick className="w-4 h-4 text-accent" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-text-primary mt-2">
            {linkClicksCount.toLocaleString()}
          </div>
          <p className="text-[11px] text-text-muted mt-1">External link visits</p>
        </div>

        {/* Click-Through Rate (CTR) */}
        <div className="p-4 rounded-2xl bg-surface-elevated border border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-muted">CTR</span>
            <Percent className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-text-primary mt-2">
            {ctrRate}
          </div>
          <p className="text-[11px] text-text-muted mt-1" title="Clicks / Reach">Clicks / Reach</p>
        </div>

        {/* Likes */}
        <div className="p-4 rounded-2xl bg-surface-elevated border border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-muted">Likes</span>
            <Heart className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-text-primary mt-2">
            {(post.likesCount || 0).toLocaleString()}
          </div>
          <p className="text-[11px] text-text-muted mt-1">Community appreciations</p>
        </div>

        {/* Saves */}
        <div className="p-4 rounded-2xl bg-surface-elevated border border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-muted">Saves</span>
            <Bookmark className="w-4 h-4 text-accent" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-text-primary mt-2">
            {(post.savesCount || 0).toLocaleString()}
          </div>
          <p className="text-[11px] text-text-muted mt-1">Collection bookmarks</p>
        </div>

        {/* Comments */}
        <div className="p-4 rounded-2xl bg-surface-elevated border border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-muted">Comments</span>
            <MessageCircle className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-text-primary mt-2">
            {(post.commentsCount || 0).toLocaleString()}
          </div>
          <p className="text-[11px] text-text-muted mt-1">Discussions & critiques</p>
        </div>
      </div>

      {/* Post Daily Trend Chart Section */}
      <div className="p-5 sm:p-6 rounded-2xl bg-surface-elevated border border-border shadow-soft space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-text-primary tracking-tight">Performance Over Time</h3>
            <p className="text-xs text-text-muted mt-0.5">
              Daily aggregates for {timeRange === '7d' ? 'last 7 days' : timeRange === '30d' ? 'last 30 days' : timeRange === '90d' ? 'last 90 days' : 'all recorded history'}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Metric Selector Tabs */}
            <div className="inline-flex items-center p-1 rounded-xl bg-surface border border-border overflow-x-auto max-w-full gap-0.5 no-scrollbar">
              {(
                [
                  { id: 'views', label: 'Views' },
                  { id: 'impressions', label: 'Reach' },
                  { id: 'linkClicks', label: 'Link Clicks' },
                  { id: 'likes', label: 'Likes' },
                  { id: 'saves', label: 'Saves' },
                  { id: 'comments', label: 'Comments' },
                ] as { id: MetricOption; label: string }[]
              ).map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  id={`btn-post-metric-${tab.id}`}
                  onClick={() => setSelectedMetric(tab.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    selectedMetric === tab.id
                      ? 'bg-accent text-white shadow-soft'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Time Range Filter Controls */}
            <div className="inline-flex items-center p-1 rounded-xl bg-surface border border-border">
              {(['7d', '30d', '90d', 'all'] as TimeRangeOption[]).map(range => (
                <button
                  key={range}
                  type="button"
                  id={`btn-post-range-${range}`}
                  onClick={() => setTimeRange(range)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    timeRange === range
                      ? 'bg-accent text-white shadow-soft'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  {range === '7d' ? '7D' : range === '30d' ? '30D' : range === '90d' ? '90D' : 'All'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Real Responsive SVG Chart */}
        <AnalyticsTrendChart
          data={chartData}
          metricLabel={selectedMetric.charAt(0).toUpperCase() + selectedMetric.slice(1)}
          timeRangeLabel={timeRange}
          earliestTrackedDate={earliestTrackedDate}
          isLoading={isLoadingBuckets}
        />
      </div>

      {/* Audience & Reach Telemetry Grid: Discovery Surfaces, Devices, Traffic Sources, Geographic Reach */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Discovery Surfaces */}
        <div className="p-4 sm:p-5 rounded-2xl bg-surface-elevated border border-border space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-accent" />
              <h3 className="text-sm font-bold text-text-primary">Discovery Surfaces</h3>
            </div>
            {impressionsCount >= 1000 && ga4Report?.surfaces && ga4Report.surfaces.length > 0 && (
              <span className="text-xs text-text-muted font-medium">
                {ga4Report.surfaces.reduce((acc, s) => acc + s.count, 0).toLocaleString()} reach
              </span>
            )}
          </div>

          {impressionsCount < 1000 ? (
            <div className="py-7 text-center space-y-2.5">
              <div className="w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center mx-auto text-accent">
                <Lock className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-text-primary">Available after 1,000 Reach</p>
                <p className="text-[11px] text-text-muted/90 max-w-[220px] mx-auto leading-relaxed">
                  Discovery surface analytics unlock once your content achieves 1,000 lifetime impressions.
                </p>
              </div>
              <div className="max-w-[180px] mx-auto pt-1 space-y-1">
                <div className="flex justify-between text-[10px] text-text-muted">
                  <span>Progress</span>
                  <span className="font-medium text-text-secondary">{impressionsCount.toLocaleString()} / 1,000</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-surface overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.max(4, (impressionsCount / 1000) * 100))}%` }}
                  />
                </div>
              </div>
            </div>
          ) : isLoadingGa4Report ? (
            <div className="py-8 text-center space-y-3 animate-pulse">
              <div className="h-4 bg-surface rounded w-3/4 mx-auto" />
              <div className="h-4 bg-surface rounded w-1/2 mx-auto" />
            </div>
          ) : ga4Report?.surfaces && ga4Report.surfaces.length > 0 ? (
            <div className="space-y-3 pt-1">
              <div className="space-y-2.5">
                {ga4Report.surfaces.map(s => (
                  <div key={s.key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-text-secondary font-medium truncate">{s.name}</span>
                      <div className="flex items-center gap-2 text-text-muted shrink-0">
                        <span className="font-semibold text-text-primary">{s.count.toLocaleString()}</span>
                        <span className="w-10 text-right">({s.pct}%)</span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-surface overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full transition-all duration-300"
                        style={{ width: `${s.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-8 text-center space-y-2">
              <div className="w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center mx-auto text-text-muted">
                <Radio className="w-4 h-4" />
              </div>
              <p className="text-xs text-text-muted font-medium">No surface telemetry recorded yet</p>
              <p className="text-[11px] text-text-muted/80 max-w-[200px] mx-auto">
                Impressions are automatically tagged when cards appear on Home, Search, and feeds.
              </p>
            </div>
          )}
        </div>
        {/* Device Breakdown */}
        <div className="p-4 sm:p-5 rounded-2xl bg-surface-elevated border border-border space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Laptop className="w-4 h-4 text-text-muted" />
              <h3 className="text-sm font-bold text-text-primary">Device Breakdown</h3>
            </div>
            {impressionsCount >= 1000 && ga4Report?.devices && ga4Report.devices.total > 0 && (
              <span className="text-xs text-text-muted font-medium">
                {ga4Report.devices.total.toLocaleString()} total
              </span>
            )}
          </div>

          {impressionsCount < 1000 ? (
            <div className="py-7 text-center space-y-2.5">
              <div className="w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center mx-auto text-accent">
                <Lock className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-text-primary">Available after 1,000 Reach</p>
                <p className="text-[11px] text-text-muted/90 max-w-[220px] mx-auto leading-relaxed">
                  Device breakdown unlocks at 1,000 Reach to maintain sample accuracy.
                </p>
              </div>
            </div>
          ) : isLoadingGa4Report ? (
            <div className="py-8 text-center space-y-3 animate-pulse">
              <div className="h-4 bg-surface rounded w-3/4 mx-auto" />
              <div className="h-4 bg-surface rounded w-1/2 mx-auto" />
            </div>
          ) : ga4Report?.devices && ga4Report.devices.total > 0 ? (
            <div className="space-y-3 pt-1">
              <div className="h-2 w-full rounded-full overflow-hidden flex bg-surface">
                {ga4Report.devices.desktopPct > 0 && (
                  <div
                    className="h-full bg-accent"
                    style={{ width: `${ga4Report.devices.desktopPct}%` }}
                    title={`Desktop: ${ga4Report.devices.desktopPct}%`}
                  />
                )}
                {ga4Report.devices.mobilePct > 0 && (
                  <div
                    className="h-full bg-purple-400"
                    style={{ width: `${ga4Report.devices.mobilePct}%` }}
                    title={`Mobile: ${ga4Report.devices.mobilePct}%`}
                  />
                )}
                {ga4Report.devices.tabletPct > 0 && (
                  <div
                    className="h-full bg-indigo-300"
                    style={{ width: `${ga4Report.devices.tabletPct}%` }}
                    title={`Tablet: ${ga4Report.devices.tabletPct}%`}
                  />
                )}
              </div>

              <div className="space-y-2.5 pt-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
                    <Laptop className="w-3.5 h-3.5 text-text-muted shrink-0" />
                    <span className="text-text-secondary font-medium">Desktop</span>
                  </div>
                  <div className="flex items-center gap-2 text-text-muted">
                    <span className="font-semibold text-text-primary">{ga4Report.devices.desktop.toLocaleString()}</span>
                    <span className="w-10 text-right">({ga4Report.devices.desktopPct}%)</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-purple-400 shrink-0" />
                    <Smartphone className="w-3.5 h-3.5 text-text-muted shrink-0" />
                    <span className="text-text-secondary font-medium">Mobile</span>
                  </div>
                  <div className="flex items-center gap-2 text-text-muted">
                    <span className="font-semibold text-text-primary">{ga4Report.devices.mobile.toLocaleString()}</span>
                    <span className="w-10 text-right">({ga4Report.devices.mobilePct}%)</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-indigo-300 shrink-0" />
                    <Tablet className="w-3.5 h-3.5 text-text-muted shrink-0" />
                    <span className="text-text-secondary font-medium">Tablet</span>
                  </div>
                  <div className="flex items-center gap-2 text-text-muted">
                    <span className="font-semibold text-text-primary">{ga4Report.devices.tablet.toLocaleString()}</span>
                    <span className="w-10 text-right">({ga4Report.devices.tabletPct}%)</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center space-y-2">
              <div className="w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center mx-auto text-text-muted">
                <Laptop className="w-4 h-4" />
              </div>
              <p className="text-xs text-text-muted font-medium">No device breakdown recorded yet</p>
            </div>
          )}
        </div>

        {/* Traffic Source Breakdown */}
        <div className="p-4 sm:p-5 rounded-2xl bg-surface-elevated border border-border space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-text-muted" />
              <h3 className="text-sm font-bold text-text-primary">Traffic Sources</h3>
            </div>
            {impressionsCount >= 1000 && ga4Report?.sources && ga4Report.sources.length > 0 && (
              <span className="text-xs text-text-muted font-medium">
                {ga4Report.sources.length} sources
              </span>
            )}
          </div>

          {impressionsCount < 1000 ? (
            <div className="py-7 text-center space-y-2.5">
              <div className="w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center mx-auto text-accent">
                <Lock className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-text-primary">Available after 1,000 Reach</p>
                <p className="text-[11px] text-text-muted/90 max-w-[220px] mx-auto leading-relaxed">
                  Traffic sources unlock at 1,000 Reach to maintain sample accuracy.
                </p>
              </div>
            </div>
          ) : isLoadingGa4Report ? (
            <div className="py-8 text-center space-y-3 animate-pulse">
              <div className="h-4 bg-surface rounded w-3/4 mx-auto" />
              <div className="h-4 bg-surface rounded w-1/2 mx-auto" />
            </div>
          ) : ga4Report?.sources && ga4Report.sources.length > 0 ? (
            <div className="space-y-3 pt-1">
              <div className="space-y-2.5">
                {ga4Report.sources.map(s => (
                  <div key={s.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-text-secondary font-medium truncate">{s.name}</span>
                      <div className="flex items-center gap-2 text-text-muted shrink-0">
                        <span className="font-semibold text-text-primary">{s.count.toLocaleString()}</span>
                        <span className="w-10 text-right">({s.pct}%)</span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-surface overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full transition-all duration-300"
                        style={{ width: `${s.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-8 text-center space-y-2">
              <div className="w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center mx-auto text-text-muted">
                <Compass className="w-4 h-4" />
              </div>
              <p className="text-xs text-text-muted font-medium">No referral telemetry recorded yet</p>
            </div>
          )}
        </div>

        {/* Geographic Reach */}
        <div className="p-4 sm:p-5 rounded-2xl bg-surface-elevated border border-border space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-text-muted" />
              <h3 className="text-sm font-bold text-text-primary">Geographic Reach</h3>
            </div>
            {impressionsCount >= 1000 && ga4Report?.countries && ga4Report.countries.length > 0 && (
              <span className="text-xs text-text-muted font-medium">
                {ga4Report.countries.length} {ga4Report.countries.length === 1 ? 'country' : 'countries'}
              </span>
            )}
          </div>

          {impressionsCount < 1000 ? (
            <div className="py-7 text-center space-y-2.5">
              <div className="w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center mx-auto text-accent">
                <Lock className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-text-primary">Available after 1,000 Reach</p>
                <p className="text-[11px] text-text-muted/90 max-w-[220px] mx-auto leading-relaxed">
                  Audience geography unlocks at 1,000 Reach to maintain sample accuracy.
                </p>
              </div>
              <div className="max-w-[180px] mx-auto pt-1 space-y-1">
                <div className="flex justify-between text-[10px] text-text-muted">
                  <span>Progress</span>
                  <span className="font-medium text-text-secondary">{impressionsCount.toLocaleString()} / 1,000</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-surface overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.max(4, (impressionsCount / 1000) * 100))}%` }}
                  />
                </div>
              </div>
            </div>
          ) : isLoadingGa4Report ? (
            <div className="py-8 text-center space-y-3 animate-pulse">
              <div className="h-4 bg-surface rounded w-3/4 mx-auto" />
              <div className="h-4 bg-surface rounded w-1/2 mx-auto" />
              <div className="h-4 bg-surface rounded w-2/3 mx-auto" />
            </div>
          ) : ga4Report?.countries && ga4Report.countries.length > 0 ? (
            <div className="space-y-2.5 pt-1 max-h-[220px] overflow-y-auto pr-1">
              {ga4Report.countries.map(g => (
                <div key={g.code} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="text-sm">{g.flag}</span>
                      <span className="text-text-secondary font-medium truncate">{g.name}</span>
                      <span className="text-[10px] text-text-muted uppercase font-mono">({g.code})</span>
                    </div>
                    <div className="flex items-center gap-2 text-text-muted shrink-0">
                      <span className="font-semibold text-text-primary">{g.count.toLocaleString()}</span>
                      <span className="w-10 text-right">({g.pct}%)</span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-surface overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all duration-300"
                      style={{ width: `${g.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center space-y-2">
              <div className="w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center mx-auto text-text-muted">
                <Globe className="w-4 h-4" />
              </div>
              <p className="text-xs text-text-muted font-medium">No geographic telemetry recorded yet</p>
              <p className="text-[11px] text-text-muted/80 max-w-[200px] mx-auto">
                Audience countries will appear as qualified Reach is processed by Google Analytics 4.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Telemetry Architecture & Privacy Guarantee */}
      <div className="p-4 rounded-2xl bg-surface border border-border flex items-start gap-3.5 text-xs text-text-muted">
        <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
        <div className="space-y-0.5 leading-relaxed">
          <span className="font-semibold text-text-primary">KROMA Privacy-First Telemetry Guarantee:</span>
          <span>
            {' '}View counts are deduplicated within a 24-hour window per viewer. No raw IP addresses or exact geographic coordinates are ever stored or retained. All audience breakdowns reflect real aggregated visits without artificial interpolation.
          </span>
        </div>
      </div>
    </div>
  );
};
