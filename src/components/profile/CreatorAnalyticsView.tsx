import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Post, User, DailyAnalyticsBucket } from '../../types';
import {
  ArrowLeft,
  Eye,
  Heart,
  Bookmark,
  MessageCircle,
  BarChart3,
  TrendingUp,
  Clock,
  Smartphone,
  Tablet,
  Laptop,
  Compass,
  Globe,
  ChevronRight,
  ShieldCheck,
  UsersRound,
  UserRoundPlus,
  ChevronDown,
  ChevronUp,
  Radio,
  Percent,
  Layers,
  Lock,
  MousePointerClick,
} from 'lucide-react';
import { formatCompactNumber } from '../../utils/numberFormatter';
import {
  extractCanonicalDeviceCounts,
  getCountryDisplayName,
  getCountryFlagEmoji,
} from '../../utils/trafficTracker';
import { fetchCreatorDailyBuckets } from '../../services/firebase/postService';
import { fetchCreatorFollowersHistory, CreatorFollowerRecord } from '../../services/firebase/userService';
import { AnalyticsTrendChart, ChartDataPoint } from '../analytics/AnalyticsTrendChart';
import {
  fetchBreakdownsFromGA4,
  GA4BreakdownsReport,
  selectGA4BreakdownsRange,
} from '../../services/analytics/ga4ReportService';

interface CreatorAnalyticsViewProps {
  posts?: Post[];
  onBack: () => void;
  creator: User;
  totalViews?: number;
}

type TimeRangeOption = '7d' | '30d' | '90d' | 'all';
type SortOption = 'most-reach' | 'most-viewed' | 'most-engaged' | 'most-saved' | 'most-liked' | 'recent';
type MetricOption = 'followers' | 'impressions' | 'views' | 'linkClicks' | 'likes' | 'saves' | 'comments' | 'engagement';

// Canonical engagement rate helper: (Interactions / Reach) * 100
export const getPostEngagementRate = (p: {
  uniqueImpressionsCount?: number;
  viewsCount?: number;
  likesCount?: number;
  savesCount?: number;
  commentsCount?: number;
}): number => {
  const reach = p.uniqueImpressionsCount || 0;
  if (reach <= 0) return 0;
  const interactions = (p.likesCount || 0) + (p.savesCount || 0) + (p.commentsCount || 0);
  if (interactions <= 0) return 0;
  return (interactions / reach) * 100;
};

export const CreatorAnalyticsView: React.FC<CreatorAnalyticsViewProps> = ({
  posts,
  onBack,
  creator,
  totalViews = 0,
}) => {
  const { navigateTo, users, currentUser } = useApp();
  const safePosts = useMemo(() => (Array.isArray(posts) ? posts : []), [posts]);
  const [timeRange, setTimeRange] = useState<TimeRangeOption>('30d');
  const [selectedMetric, setSelectedMetric] = useState<MetricOption>('followers');
  const [sortBy, setSortBy] = useState<SortOption>('most-viewed');
  const [showAllCountries, setShowAllCountries] = useState<boolean>(false);

  // Canonical creator user from reactive AppContext or props
  const currentCreator = useMemo(() => {
    if (!creator?.id) return creator;
    const match = users.find(u => u.id === creator.id);
    if (match) return match;
    if (currentUser?.id === creator.id) return currentUser;
    return creator;
  }, [creator, users, currentUser]);

  const followersCount = currentCreator?.followersCount ?? creator?.followersCount ?? 0;

  // Daily Buckets state
  const [dailyBuckets, setDailyBuckets] = useState<DailyAnalyticsBucket[]>([]);
  const [isLoadingBuckets, setIsLoadingBuckets] = useState<boolean>(true);

  // GA4 Server-Side Combined Breakdowns Report
  const [ga4DailyReport, setGa4DailyReport] = useState<GA4BreakdownsReport | null>(null);
  const [isLoadingGa4Report, setIsLoadingGa4Report] = useState<boolean>(false);
  const ga4Report = useMemo(
    () => (ga4DailyReport ? selectGA4BreakdownsRange(ga4DailyReport, timeRange) : null),
    [ga4DailyReport, timeRange]
  );

  // Real follower records state
  const [followerRecords, setFollowerRecords] = useState<CreatorFollowerRecord[]>([]);

  // Fetch real follower records for follower trend
  useEffect(() => {
    let isCancelled = false;
    fetchCreatorFollowersHistory(creator.id).then(records => {
      if (!isCancelled) {
        setFollowerRecords(records);
      }
    });
    return () => {
      isCancelled = true;
    };
  }, [creator.id]);

  // Compute overall summary totals (lifetime)
  const totalLikes = useMemo(() => {
    return safePosts.reduce((sum, p) => sum + (p.likesCount || 0), 0);
  }, [safePosts]);

  const totalSaves = useMemo(() => {
    return safePosts.reduce((sum, p) => sum + (p.savesCount || 0), 0);
  }, [safePosts]);

  const totalComments = useMemo(() => {
    return safePosts.reduce((sum, p) => sum + (p.commentsCount || 0), 0);
  }, [safePosts]);

  // Total Lifetime Unique Impressions (Reach)
  const totalImpressions = useMemo(() => {
    return safePosts.reduce((sum, p) => sum + (p.uniqueImpressionsCount || 0), 0);
  }, [safePosts]);

  // Total Lifetime Link Clicks
  const totalLinkClicks = useMemo(() => {
    return safePosts.reduce((sum, p) => sum + (p.linkClicksCount || 0), 0);
  }, [safePosts]);

  // Overall Click-Through Rate (CTR): Link Clicks / Reach
  const overallCtr = useMemo(() => {
    if (totalImpressions <= 0) return 0;
    const rate = (totalLinkClicks / totalImpressions) * 100;
    return Number(rate.toFixed(1));
  }, [totalImpressions, totalLinkClicks]);

  // Overall Engagement Rate: ((Likes + Saves + Comments) / Reach) * 100
  const overallEngagementRate = useMemo(() => {
    if (totalImpressions <= 0) return 0;
    const rate = ((totalLikes + totalSaves + totalComments) / totalImpressions) * 100;
    return Number(rate.toFixed(1));
  }, [totalImpressions, totalLikes, totalSaves, totalComments]);

  // Overall View Rate: (Total Views / Total Impressions) * 100
  const overallViewRate = useMemo(() => {
    if (totalImpressions <= 0) return 0;
    const rate = (totalViews / totalImpressions) * 100;
    return Number(rate.toFixed(1));
  }, [totalViews, totalImpressions]);

  // Fetch GA4 Combined Breakdowns (Countries, Devices, Sources) when Reach >= 1000
  useEffect(() => {
    if (!creator?.id || totalImpressions < 1000) {
      setGa4DailyReport(null);
      setIsLoadingGa4Report(false);
      return;
    }

    let isCancelled = false;
    setIsLoadingGa4Report(true);

    fetchBreakdownsFromGA4({ creatorId: creator.id })
      .then(report => {
        if (!isCancelled) {
          setGa4DailyReport(report);
          setIsLoadingGa4Report(false);
        }
      })
      .catch(err => {
        console.warn('Could not fetch GA4 breakdown report for creator:', err);
        if (!isCancelled) {
          setIsLoadingGa4Report(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [creator?.id, totalImpressions]);

  // Determine Date Range Bounds
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

  // Fetch real daily buckets for creator's posts
  useEffect(() => {
    let isCancelled = false;
    setIsLoadingBuckets(true);

    const postIds = safePosts.map(p => p.id);
    fetchCreatorDailyBuckets(creator.id, postIds, startDateStr, endDateStr)
      .then(buckets => {
        if (!isCancelled) {
          setDailyBuckets(buckets);
          setIsLoadingBuckets(false);
        }
      })
      .catch(err => {
        console.warn('Could not load creator daily analytics buckets:', err);
        if (!isCancelled) {
          setDailyBuckets([]);
          setIsLoadingBuckets(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [creator.id, safePosts, startDateStr, endDateStr]);

  // Process Daily Buckets into Chart Data Points
  const { chartData, earliestTrackedDate } = useMemo(() => {
    // Followers Trend Logic
    if (selectedMetric === 'followers') {
      if (!followerRecords || followerRecords.length === 0) {
        return { chartData: [], earliestTrackedDate: undefined };
      }

      // Group real follower records by date (YYYY-MM-DD)
      const followerCountByDate = new Map<string, number>();
      followerRecords.forEach(r => {
        const dateStr = (r.createdAt || '').slice(0, 10);
        if (dateStr && dateStr.length === 10) {
          followerCountByDate.set(dateStr, (followerCountByDate.get(dateStr) || 0) + 1);
        }
      });

      const dates = Array.from(followerCountByDate.keys()).sort();
      if (dates.length === 0) {
        return { chartData: [], earliestTrackedDate: undefined };
      }

      const earliest = dates[0];
      const startCandidate = startDateStr && startDateStr > earliest ? startDateStr : earliest;
      const points: ChartDataPoint[] = [];

      try {
        const cur = new Date(startCandidate + 'T00:00:00Z');
        const end = new Date(endDateStr + 'T00:00:00Z');

        while (cur <= end) {
          const dStr = cur.toISOString().slice(0, 10);
          const val = followerCountByDate.get(dStr) || 0;
          points.push({ date: dStr, value: val });
          cur.setUTCDate(cur.getUTCDate() + 1);
        }
      } catch {
        dates.forEach(d => {
          points.push({ date: d, value: followerCountByDate.get(d) || 0 });
        });
      }

      const hasActivity = points.some(p => p.value > 0);
      return {
        chartData: hasActivity ? points : [],
        earliestTrackedDate: startDateStr && startDateStr < earliest ? earliest : undefined,
      };
    }

    if (!dailyBuckets || dailyBuckets.length === 0) {
      return { chartData: [], earliestTrackedDate: undefined };
    }

    const earliest = dailyBuckets[0].date;
    const bucketMap = new Map<string, DailyAnalyticsBucket>();
    dailyBuckets.forEach(b => bucketMap.set(b.date, b));

    // Construct sequential continuous dates from the start of available data to today
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
      // Fallback to raw bucket points
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
  }, [dailyBuckets, startDateStr, endDateStr, selectedMetric, followerRecords]);

  // Client-side filtering and sorting of the creator's posts
  const displayedPosts = useMemo(() => {
    // Copy array first to never mutate source array
    const list = [...safePosts];

    if (sortBy === 'most-reach') {
      const getImpressions = (p: Post) => p.uniqueImpressionsCount || 0;
      const eligible = list.filter(p => getImpressions(p) > 0);
      return eligible.sort((a, b) => {
        const diff = getImpressions(b) - getImpressions(a);
        if (diff !== 0) return diff;
        const viewsDiff = (b.viewsCount || 0) - (a.viewsCount || 0);
        if (viewsDiff !== 0) return viewsDiff;
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
    }

    if (sortBy === 'most-viewed') {
      const eligible = list.filter(p => (p.viewsCount || 0) > 0);
      return eligible.sort((a, b) => {
        const diff = (b.viewsCount || 0) - (a.viewsCount || 0);
        if (diff !== 0) return diff;
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
    }

    if (sortBy === 'most-engaged') {
      const eligible = list.filter(p => getPostEngagementRate(p) > 0);
      return eligible.sort((a, b) => {
        const engA = getPostEngagementRate(a);
        const engB = getPostEngagementRate(b);
        const diff = engB - engA;
        if (Math.abs(diff) > 0.0001) return diff;
        // Tie-breaker 1: total interactions
        const intA = (a.likesCount || 0) + (a.savesCount || 0) + (a.commentsCount || 0);
        const intB = (b.likesCount || 0) + (b.savesCount || 0) + (b.commentsCount || 0);
        if (intB !== intA) return intB - intA;
        // Tie-breaker 2: views
        const viewsDiff = (b.viewsCount || 0) - (a.viewsCount || 0);
        if (viewsDiff !== 0) return viewsDiff;
        // Tie-breaker 3: date
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
    }

    if (sortBy === 'most-saved') {
      const eligible = list.filter(p => (p.savesCount || 0) > 0);
      return eligible.sort((a, b) => {
        const diff = (b.savesCount || 0) - (a.savesCount || 0);
        if (diff !== 0) return diff;
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
    }

    if (sortBy === 'most-liked') {
      const eligible = list.filter(p => (p.likesCount || 0) > 0);
      return eligible.sort((a, b) => {
        const diff = (b.likesCount || 0) - (a.likesCount || 0);
        if (diff !== 0) return diff;
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
    }

    if (sortBy === 'recent') {
      return list.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
    }

    return list;
  }, [safePosts, sortBy]);

  // Truthful empty states per filter mode
  const emptyStateConfig = useMemo(() => {
    if (safePosts.length === 0) {
      return {
        icon: BarChart3,
        title: 'No posts published yet',
        description: 'Once you publish posts to your portfolio, their individual view and engagement stats will appear here.',
      };
    }

    switch (sortBy) {
      case 'most-reach':
        return {
          icon: Radio,
          title: 'No reach recorded yet',
          description: 'Posts that qualify for impressions on feeds will appear here.',
        };
      case 'most-engaged':
        return {
          icon: UsersRound,
          title: 'No engaged posts yet',
          description: 'Posts with likes, saves, or comments will appear here.',
        };
      case 'most-saved':
        return {
          icon: Bookmark,
          title: 'No saved posts yet',
          description: 'Posts that receive saves will appear here.',
        };
      case 'most-liked':
        return {
          icon: Heart,
          title: 'No liked posts yet',
          description: 'Posts that receive likes will appear here.',
        };
      case 'most-viewed':
        return {
          icon: Eye,
          title: 'No viewed posts yet',
          description: 'Posts with recorded views will appear here.',
        };
      case 'recent':
      default:
        return {
          icon: Clock,
          title: 'No posts published yet',
          description: 'Posts you publish will appear here in chronological order.',
        };
    }
  }, [safePosts.length, sortBy]);

  return (
    <div id="creator-analytics-dashboard" className="w-full max-w-6xl mx-auto px-3.5 sm:px-6 lg:px-8 py-5 sm:py-8 space-y-6 sm:space-y-8">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 pb-4 border-b border-border">
        <div className="flex items-start sm:items-center gap-2.5 sm:gap-3">
          <button
            type="button"
            id="btn-analytics-back"
            onClick={onBack}
            className="p-2 -ml-1 sm:-ml-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer border border-transparent hover:border-border shrink-0 mt-0.5 sm:mt-0"
            title="Back to Profile"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-2xl font-bold text-text-primary tracking-tight">
                Creator Analytics
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-accent/10 text-accent text-[11px] sm:text-xs font-semibold shrink-0">
                Creator Studio
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 text-xs text-text-muted flex-wrap">
              <span>Performance metrics for</span>
              <span className="inline-flex items-center gap-1 font-medium text-text-secondary">
                @{creator.username}
              </span>
            </div>
          </div>
        </div>

        {/* Time Range Filter Controls */}
        <div className="inline-flex items-center p-1 rounded-xl bg-surface-elevated border border-border w-full sm:w-auto justify-between sm:justify-start">
          {(['7d', '30d', '90d', 'all'] as TimeRangeOption[]).map(range => (
            <button
              key={range}
              type="button"
              id={`btn-range-${range}`}
              onClick={() => setTimeRange(range)}
              className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors text-center cursor-pointer ${
                timeRange === range
                  ? 'bg-accent text-white shadow-soft'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {range === '7d' ? '7D' : range === '30d' ? '30D' : range === '90d' ? '90D' : 'All Time'}
            </button>
          ))}
        </div>
      </div>

      {/* 1. Overview Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4">
        {/* Followers */}
        <div className="p-4 rounded-2xl bg-surface-elevated border border-border shadow-soft space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-text-muted font-medium">
            <UserRoundPlus className="w-3.5 h-3.5 text-accent" />
            <span>Followers</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-text-primary" title={`${followersCount.toLocaleString()} followers`}>
            {formatCompactNumber(followersCount)}
          </div>
          <p className="text-[11px] text-text-muted">Total audience</p>
        </div>

        {/* Unique Reach */}
        <div className="p-4 rounded-2xl bg-surface-elevated border border-border shadow-soft space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-text-muted font-medium">
            <Radio className="w-3.5 h-3.5 text-accent" />
            <span>Unique Reach</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-text-primary" title={`${totalImpressions.toLocaleString()} impressions`}>
            {formatCompactNumber(totalImpressions)}
          </div>
          <p className="text-[11px] text-text-muted">Unique discovery reach</p>
        </div>

        {/* Total Views */}
        <div className="p-4 rounded-2xl bg-surface-elevated border border-border shadow-soft space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-text-muted font-medium">
            <Eye className="w-3.5 h-3.5 text-accent" />
            <span>Total Views</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-text-primary" title={`${totalViews.toLocaleString()} views`}>
            {formatCompactNumber(totalViews)}
          </div>
          <p className="text-[11px] text-text-muted">Lifetime unique opens</p>
        </div>

        {/* View Rate */}
        <div className="p-4 rounded-2xl bg-surface-elevated border border-border shadow-soft space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-text-muted font-medium">
            <Percent className="w-3.5 h-3.5 text-emerald-500" />
            <span>View Rate</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-text-primary">
            {totalImpressions > 0 ? `${overallViewRate}%` : '—'}
          </div>
          <p className="text-[11px] text-text-muted" title="Views / Reach">
            Views / Reach
          </p>
        </div>

        {/* Total Link Clicks */}
        <div className="p-4 rounded-2xl bg-surface-elevated border border-border shadow-soft space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-text-muted font-medium">
            <MousePointerClick className="w-3.5 h-3.5 text-accent" />
            <span>Link Clicks</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-text-primary">
            {formatCompactNumber(totalLinkClicks)}
          </div>
          <p className="text-[11px] text-text-muted">External link visits</p>
        </div>

        {/* Click-Through Rate (CTR) */}
        <div className="p-4 rounded-2xl bg-surface-elevated border border-border shadow-soft space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-text-muted font-medium">
            <Percent className="w-3.5 h-3.5 text-blue-500" />
            <span>CTR</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-text-primary">
            {totalImpressions > 0 ? `${overallCtr}%` : '—'}
          </div>
          <p className="text-[11px] text-text-muted" title="Clicks / Reach">Clicks / Reach</p>
        </div>

        {/* Total Likes */}
        <div className="p-4 rounded-2xl bg-surface-elevated border border-border shadow-soft space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-text-muted font-medium">
            <Heart className="w-3.5 h-3.5 text-rose-500" />
            <span>Total Likes</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-text-primary">
            {formatCompactNumber(totalLikes)}
          </div>
          <p className="text-[11px] text-text-muted">Direct appreciations</p>
        </div>

        {/* Total Saves */}
        <div className="p-4 rounded-2xl bg-surface-elevated border border-border shadow-soft space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-text-muted font-medium">
            <Bookmark className="w-3.5 h-3.5 text-accent" />
            <span>Total Saves</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-text-primary">
            {formatCompactNumber(totalSaves)}
          </div>
          <p className="text-[11px] text-text-muted">Bookmarked in collections</p>
        </div>

        {/* Total Comments */}
        <div className="p-4 rounded-2xl bg-surface-elevated border border-border shadow-soft space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-text-muted font-medium">
            <MessageCircle className="w-3.5 h-3.5 text-blue-500" />
            <span>Total Comments</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-text-primary">
            {formatCompactNumber(totalComments)}
          </div>
          <p className="text-[11px] text-text-muted">Community responses</p>
        </div>

        {/* Engagement Rate */}
        <div className="p-4 rounded-2xl bg-surface-elevated border border-border shadow-soft space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-text-muted font-medium">
            <UsersRound className="w-3.5 h-3.5 text-emerald-500" />
            <span>Engagement Rate</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-text-primary">
            {totalImpressions > 0 ? `${overallEngagementRate}%` : '—'}
          </div>
          <p className="text-[11px] text-text-muted" title="(Likes + Saves + Comments) / Reach">
            (Interactions / Reach)
          </p>
        </div>
      </div>

      {/* 2. Primary Performance Trend Section */}
      <div className="p-5 sm:p-6 rounded-2xl bg-surface-elevated border border-border shadow-soft space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-text-primary tracking-tight">Performance Trend</h2>
            <p className="text-xs text-text-muted mt-0.5">
              Daily aggregates for {timeRange === '7d' ? 'last 7 days' : timeRange === '30d' ? 'last 30 days' : timeRange === '90d' ? 'last 90 days' : 'all recorded history'}
            </p>
          </div>

          {/* Metric Selector Tabs */}
          <div className="flex items-center p-1 rounded-xl bg-surface border border-border overflow-x-auto max-w-full gap-1 no-scrollbar">
            {(
              [
                { id: 'followers', label: 'Followers', icon: UserRoundPlus },
                { id: 'impressions', label: 'Reach', icon: Radio },
                { id: 'views', label: 'Views', icon: Eye },
                { id: 'linkClicks', label: 'Link Clicks', icon: MousePointerClick },
                { id: 'likes', label: 'Likes', icon: Heart },
                { id: 'saves', label: 'Saves', icon: Bookmark },
                { id: 'comments', label: 'Comments', icon: MessageCircle },
                { id: 'engagement', label: 'Engagement', icon: UsersRound },
              ] as { id: MetricOption; label: string; icon: React.ComponentType<{ className?: string }> }[]
            ).map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  id={`btn-metric-${tab.id}`}
                  onClick={() => setSelectedMetric(tab.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
                    selectedMetric === tab.id
                      ? 'bg-accent text-white shadow-soft'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Responsive Real SVG Chart */}
        <AnalyticsTrendChart
          data={chartData}
          metricLabel={
            selectedMetric === 'engagement'
              ? 'Engagement'
              : selectedMetric === 'followers'
              ? 'Followers'
              : selectedMetric.charAt(0).toUpperCase() + selectedMetric.slice(1)
          }
          timeRangeLabel={timeRange}
          earliestTrackedDate={earliestTrackedDate}
          isLoading={isLoadingBuckets}
        />
      </div>

      {/* 3. Aggregate Audience & Discovery Breakdowns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
        {/* Discovery Surfaces */}
        <div className="p-5 sm:p-6 rounded-2xl bg-surface-elevated border border-border shadow-soft space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-accent" />
              <h3 className="text-sm font-bold text-text-primary">Discovery Surfaces</h3>
            </div>
            {totalImpressions >= 1000 && ga4Report?.surfaces && ga4Report.surfaces.length > 0 && (
              <span className="text-xs text-text-muted font-medium">
                {ga4Report.surfaces.reduce((acc, s) => acc + s.count, 0).toLocaleString()} reach
              </span>
            )}
          </div>

          {totalImpressions < 1000 ? (
            <div className="py-8 text-center space-y-3">
              <div className="w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center mx-auto text-text-muted">
                <Lock className="w-4 h-4 text-accent" />
              </div>
              <div>
                <p className="text-xs font-bold text-text-primary">Available after 1,000 Reach</p>
                <p className="text-[11px] text-text-muted max-w-[220px] mx-auto mt-1">
                  Discovery surface analytics unlock once your content achieves 1,000 lifetime impressions.
                </p>
              </div>
              <div className="pt-1">
                <div className="flex items-center justify-between text-[11px] text-text-muted mb-1 px-2">
                  <span>Current Reach</span>
                  <span className="font-semibold text-text-primary">{totalImpressions.toLocaleString()} / 1,000</span>
                </div>
                <div className="w-full bg-surface h-1.5 rounded-full overflow-hidden">
                  <div
                    style={{ width: `${Math.min(100, Math.round((totalImpressions / 1000) * 100))}%` }}
                    className="bg-accent h-full rounded-full transition-all duration-300"
                  />
                </div>
              </div>
            </div>
          ) : isLoadingGa4Report ? (
            <div className="space-y-3 pt-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="space-y-1.5">
                  <div className="flex justify-between">
                    <div className="h-3 w-20 bg-surface rounded animate-pulse" />
                    <div className="h-3 w-10 bg-surface rounded animate-pulse" />
                  </div>
                  <div className="h-1.5 w-full bg-surface rounded-full animate-pulse" />
                </div>
              ))}
            </div>
          ) : !ga4Report?.surfaces || ga4Report.surfaces.length === 0 ? (
            <div className="py-10 text-center">
              <div className="w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center mx-auto mb-2 text-text-muted">
                <Radio className="w-4 h-4" />
              </div>
              <p className="text-xs text-text-muted font-medium">No surface telemetry recorded yet</p>
              <p className="text-[11px] text-text-muted/80 max-w-[220px] mx-auto mt-0.5">
                Surfaces populate as your visual works appear across Home, Search, and feeds.
              </p>
            </div>
          ) : (
            <div className="space-y-3 pt-1">
              {ga4Report.surfaces.map(src => (
                <div key={src.key} className="space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-text-primary font-medium">{src.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-text-muted">{src.count.toLocaleString()}</span>
                      <span className="font-semibold text-text-primary min-w-[34px] text-right">{src.pct}%</span>
                    </div>
                  </div>
                  <div className="w-full bg-surface h-1.5 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${Math.max(src.pct, 2)}%` }}
                      className="bg-accent h-full rounded-full transition-all duration-300"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Device Breakdown */}
        <div className="p-5 sm:p-6 rounded-2xl bg-surface-elevated border border-border shadow-soft space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-text-primary">Device Breakdown</h3>
            {totalImpressions >= 1000 && ga4Report?.devices && ga4Report.devices.total > 0 && (
              <span className="text-xs text-text-muted font-medium">
                {ga4Report.devices.total.toLocaleString()} total
              </span>
            )}
          </div>

          {totalImpressions < 1000 ? (
            <div className="py-8 text-center space-y-2.5">
              <div className="w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center mx-auto text-accent">
                <Lock className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-text-primary">Available after 1,000 Reach</p>
                <p className="text-[11px] text-text-muted/90 max-w-[240px] mx-auto leading-relaxed">
                  Device categories unlock at 1,000 Reach to maintain sample accuracy.
                </p>
              </div>
            </div>
          ) : isLoadingGa4Report ? (
            <div className="py-8 text-center space-y-3 animate-pulse">
              <div className="h-4 bg-surface rounded w-3/4 mx-auto" />
              <div className="h-4 bg-surface rounded w-1/2 mx-auto" />
            </div>
          ) : ga4Report?.devices && ga4Report.devices.total > 0 ? (
            <div className="space-y-4">
              {/* Stacked Proportional Bar */}
              <div className="h-2.5 w-full bg-surface rounded-full overflow-hidden flex">
                {ga4Report.devices.desktopPct > 0 && (
                  <div
                    style={{ width: `${ga4Report.devices.desktopPct}%` }}
                    className="bg-accent transition-all duration-300"
                    title={`Desktop: ${ga4Report.devices.desktopPct}%`}
                  />
                )}
                {ga4Report.devices.mobilePct > 0 && (
                  <div
                    style={{ width: `${ga4Report.devices.mobilePct}%` }}
                    className="bg-purple-400 transition-all duration-300"
                    title={`Mobile: ${ga4Report.devices.mobilePct}%`}
                  />
                )}
                {ga4Report.devices.tabletPct > 0 && (
                  <div
                    style={{ width: `${ga4Report.devices.tabletPct}%` }}
                    className="bg-indigo-300 transition-all duration-300"
                    title={`Tablet: ${ga4Report.devices.tabletPct}%`}
                  />
                )}
              </div>

              {/* Rows */}
              <div className="space-y-2.5 pt-1 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Laptop className="w-3.5 h-3.5 text-accent" />
                    <span className="text-text-primary font-medium">Desktop</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-text-muted">{ga4Report.devices.desktop.toLocaleString()}</span>
                    <span className="font-semibold text-text-primary min-w-[36px] text-right">
                      {ga4Report.devices.desktopPct}%
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-3.5 h-3.5 text-purple-400" />
                    <span className="text-text-primary font-medium">Mobile</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-text-muted">{ga4Report.devices.mobile.toLocaleString()}</span>
                    <span className="font-semibold text-text-primary min-w-[36px] text-right">
                      {ga4Report.devices.mobilePct}%
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Tablet className="w-3.5 h-3.5 text-indigo-300" />
                    <span className="text-text-primary font-medium">Tablet</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-text-muted">{ga4Report.devices.tablet.toLocaleString()}</span>
                    <span className="font-semibold text-text-primary min-w-[36px] text-right">
                      {ga4Report.devices.tabletPct}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center">
              <div className="w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center mx-auto mb-2 text-text-muted">
                <Laptop className="w-4 h-4" />
              </div>
              <p className="text-xs text-text-muted font-medium">No device breakdown recorded yet</p>
            </div>
          )}
        </div>

        {/* Traffic Sources */}
        <div className="p-5 sm:p-6 rounded-2xl bg-surface-elevated border border-border shadow-soft space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-text-primary">Traffic Sources</h3>
            {totalImpressions >= 1000 && ga4Report?.sources && ga4Report.sources.length > 0 && (
              <span className="text-xs text-text-muted font-medium">
                {ga4Report.sources.length} sources
              </span>
            )}
          </div>

          {totalImpressions < 1000 ? (
            <div className="py-8 text-center space-y-2.5">
              <div className="w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center mx-auto text-accent">
                <Lock className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-text-primary">Available after 1,000 Reach</p>
                <p className="text-[11px] text-text-muted/90 max-w-[240px] mx-auto leading-relaxed">
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
              {ga4Report.sources.map(src => (
                <div key={src.name} className="space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-text-primary font-medium">{src.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-text-muted">{src.count.toLocaleString()}</span>
                      <span className="font-semibold text-text-primary min-w-[34px] text-right">{src.pct}%</span>
                    </div>
                  </div>
                  <div className="w-full bg-surface h-1.5 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${Math.max(src.pct, 2)}%` }}
                      className="bg-accent h-full rounded-full transition-all duration-300"
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center">
              <div className="w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center mx-auto mb-2 text-text-muted">
                <Compass className="w-4 h-4" />
              </div>
              <p className="text-xs text-text-muted font-medium">No traffic sources recorded yet</p>
            </div>
          )}
        </div>
      </div>

      {/* 4. Aggregate Geographic Reach */}
      <div className="p-5 sm:p-6 rounded-2xl bg-surface-elevated border border-border shadow-soft space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-text-primary">Geographic Reach</h3>
            <p className="text-xs text-text-muted mt-0.5">Top audience locations across your portfolio</p>
          </div>
          {totalImpressions >= 1000 && ga4Report?.countries && ga4Report.countries.length > 0 && (
            <span className="text-xs text-text-muted">
              {ga4Report.countries.length} {ga4Report.countries.length === 1 ? 'country' : 'countries'} mapped
            </span>
          )}
        </div>

        {totalImpressions < 1000 ? (
          <div className="py-8 text-center space-y-2.5">
            <div className="w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center mx-auto text-accent">
              <Lock className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-text-primary">Available after 1,000 Reach</p>
              <p className="text-[11px] text-text-muted/90 max-w-[240px] mx-auto leading-relaxed">
                Audience geography unlocks at 1,000 Reach to maintain sample accuracy.
              </p>
            </div>
            <div className="max-w-[180px] mx-auto pt-1 space-y-1">
              <div className="flex justify-between text-[10px] text-text-muted">
                <span>Progress</span>
                <span className="font-medium text-text-secondary">{totalImpressions.toLocaleString()} / 1,000</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-surface overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(4, (totalImpressions / 1000) * 100))}%` }}
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
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {(showAllCountries ? ga4Report.countries : ga4Report.countries.slice(0, 6)).map(geo => (
                <div
                  key={geo.code}
                  className="p-3 rounded-xl bg-surface border border-border flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="text-base shrink-0 leading-none">{geo.flag}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-text-primary truncate">{geo.name}</p>
                      <p className="text-[11px] text-text-muted font-mono">{geo.code}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-text-primary">{geo.count.toLocaleString()}</p>
                    <p className="text-[11px] text-text-muted">{geo.pct}% of reach</p>
                  </div>
                </div>
              ))}
            </div>

            {ga4Report.countries.length > 6 && (
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setShowAllCountries(prev => !prev)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-accent hover:bg-surface transition-colors cursor-pointer"
                >
                  <span>{showAllCountries ? 'Show Less' : `View All (${ga4Report.countries.length})`}</span>
                  {showAllCountries ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="py-10 text-center">
            <div className="w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center mx-auto mb-2 text-text-muted">
              <Globe className="w-4 h-4" />
            </div>
            <p className="text-xs text-text-muted font-medium">No geographic locations recorded yet</p>
            <p className="text-[11px] text-text-muted/80 max-w-[260px] mx-auto mt-0.5">
              Audience countries will appear as qualified Reach is processed by Google Analytics 4.
            </p>
          </div>
        )}
      </div>

      {/* 5. Content Performance Table / List */}
      <div className="space-y-4 pt-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-text-primary tracking-tight">
              Content Performance
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              Click any post to view individual audience metrics, breakdowns, and telemetry
            </p>
          </div>

          {/* Sort Pill Buttons */}
          <div className="inline-flex items-center p-1 rounded-xl bg-surface-elevated border border-border flex-nowrap max-w-full overflow-x-auto self-start sm:self-auto">
            <button
              type="button"
              id="btn-sort-most-reach"
              onClick={() => setSortBy('most-reach')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                sortBy === 'most-reach'
                  ? 'bg-accent text-white shadow-soft'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <Radio className="w-3.5 h-3.5 shrink-0" />
              <span>Most Reach</span>
            </button>

            <button
              type="button"
              id="btn-sort-most-viewed"
              onClick={() => setSortBy('most-viewed')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                sortBy === 'most-viewed'
                  ? 'bg-accent text-white shadow-soft'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <Eye className="w-3.5 h-3.5 shrink-0" />
              <span>Most Viewed</span>
            </button>

            <button
              type="button"
              id="btn-sort-most-engaged"
              onClick={() => setSortBy('most-engaged')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                sortBy === 'most-engaged'
                  ? 'bg-accent text-white shadow-soft'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <UsersRound className="w-3.5 h-3.5 shrink-0" />
              <span>Most Engaged</span>
            </button>

            <button
              type="button"
              id="btn-sort-most-saved"
              onClick={() => setSortBy('most-saved')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                sortBy === 'most-saved'
                  ? 'bg-accent text-white shadow-soft'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <Bookmark className="w-3.5 h-3.5 shrink-0" />
              <span>Most Saved</span>
            </button>

            <button
              type="button"
              id="btn-sort-most-liked"
              onClick={() => setSortBy('most-liked')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                sortBy === 'most-liked'
                  ? 'bg-accent text-white shadow-soft'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <Heart className="w-3.5 h-3.5 shrink-0" />
              <span>Most Liked</span>
            </button>

            <button
              type="button"
              id="btn-sort-recent"
              onClick={() => setSortBy('recent')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                sortBy === 'recent'
                  ? 'bg-accent text-white shadow-soft'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>Most Recent</span>
            </button>
          </div>
        </div>

        {/* Posts Table / Clean Rows */}
        {displayedPosts.length === 0 ? (
          <div className="max-w-md mx-auto py-16 px-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-surface-elevated flex items-center justify-center mx-auto mb-3 text-accent shadow-soft border border-border">
              <emptyStateConfig.icon className="w-5 h-5 text-accent" />
            </div>
            <h3 className="text-base font-semibold text-text-primary mb-1">
              {emptyStateConfig.title}
            </h3>
            <p className="text-xs text-text-muted leading-relaxed max-w-sm mx-auto">
              {emptyStateConfig.description}
            </p>
          </div>
        ) : (
          <div className="border border-border rounded-2xl overflow-hidden bg-surface shadow-soft divide-y divide-border">
            {/* Desktop Table Header */}
            <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-3 bg-surface-elevated/60 text-[11px] font-semibold text-text-muted uppercase tracking-wider">
              <div className="col-span-5 flex items-center gap-3">
                <span className="w-5 text-center">#</span>
                <span>Post</span>
              </div>
              <div className="col-span-1 text-right">Reach</div>
              <div className="col-span-1 text-right">Views</div>
              <div className="col-span-1 text-right">View %</div>
              <div className="col-span-1 text-right">Likes</div>
              <div className="col-span-1 text-right">Saves</div>
              <div className="col-span-2 text-right pr-4">Engagement</div>
            </div>

            {/* Post Rows */}
            {displayedPosts.map((post, idx) => {
              const formattedDate = post.createdAt
                ? new Date(post.createdAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : null;

              const postEngagementRate = getPostEngagementRate(post).toFixed(1);
              const postImpressions = post.uniqueImpressionsCount || 0;
              const postViews = post.viewsCount || 0;
              const postViewRate = postImpressions > 0 ? ((postViews / postImpressions) * 100).toFixed(1) : '—';

              return (
                <div
                  key={post.id}
                  id={`analytics-post-row-${post.id}`}
                  onClick={() => navigateTo({ type: 'post-analytics', postId: post.id })}
                  className="p-3.5 sm:px-4 sm:py-3.5 hover:bg-surface-elevated/70 transition-colors cursor-pointer group flex flex-col sm:grid sm:grid-cols-12 gap-3 sm:gap-3 items-start sm:items-center"
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigateTo({ type: 'post-analytics', postId: post.id });
                    }
                  }}
                  title="View detailed post analytics"
                >
                  {/* Left: Thumbnail & Title Info */}
                  <div className="w-full sm:w-auto sm:col-span-5 flex items-center gap-3 min-w-0">
                    <span className="text-xs font-semibold text-text-muted w-5 text-center shrink-0">
                      #{idx + 1}
                    </span>

                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden bg-surface-elevated shrink-0 border border-border">
                      <img
                        src={post.thumbnailUrl || post.imageUrl}
                        alt={post.title || 'Post Thumbnail'}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        loading="lazy"
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-sm font-semibold text-text-primary truncate group-hover:text-accent transition-colors flex-1 min-w-0">
                          {post.title || 'Untitled Post'}
                        </h4>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5 flex-wrap">
                        {post.category && post.category !== 'all' && (
                          <span className="capitalize">{post.category.replace(/-/g, ' ')}</span>
                        )}
                        {post.category && post.category !== 'all' && formattedDate && <span>•</span>}
                        {formattedDate && <span>{formattedDate}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Desktop Columns / Mobile Metric Wrap */}
                  <div className="w-full sm:w-auto sm:contents flex items-center justify-between gap-3 text-xs pt-2 sm:pt-0 border-t sm:border-t-0 border-border flex-wrap">
                    {/* Reach */}
                    <div className="sm:col-span-1 sm:text-right font-medium text-text-primary">
                      <span className="sm:hidden text-text-muted mr-1">Reach:</span>
                      {postImpressions.toLocaleString()}
                    </div>

                    {/* Views */}
                    <div className="sm:col-span-1 sm:text-right font-medium text-text-primary">
                      <span className="sm:hidden text-text-muted mr-1">Views:</span>
                      {postViews.toLocaleString()}
                    </div>

                    {/* View Rate */}
                    <div className="sm:col-span-1 sm:text-right font-medium text-emerald-500">
                      <span className="sm:hidden text-text-muted mr-1">View Rate:</span>
                      {postViewRate !== '—' ? `${postViewRate}%` : '—'}
                    </div>

                    {/* Likes */}
                    <div className="sm:col-span-1 sm:text-right font-medium text-text-primary">
                      <span className="sm:hidden text-text-muted mr-1">Likes:</span>
                      {(post.likesCount || 0).toLocaleString()}
                    </div>

                    {/* Saves */}
                    <div className="sm:col-span-1 sm:text-right font-medium text-text-primary">
                      <span className="sm:hidden text-text-muted mr-1">Saves:</span>
                      {(post.savesCount || 0).toLocaleString()}
                    </div>

                    {/* Engagement Rate & Drill-Down Arrow */}
                    <div className="sm:col-span-2 flex items-center sm:justify-end gap-2 text-right">
                      <span className="sm:hidden text-text-muted mr-1">Engagement:</span>
                      <span className="font-semibold text-accent">{postEngagementRate}%</span>
                      <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-accent group-hover:translate-x-0.5 transition-all shrink-0" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Truthful Telemetry & Privacy Architecture Notice */}
      <div className="p-4 rounded-2xl bg-surface border border-border flex items-start gap-3.5 text-xs text-text-muted">
        <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
        <div className="space-y-0.5 leading-relaxed">
          <span className="font-semibold text-text-primary">KROMA Analytics & Privacy Standard:</span>
          <span>
            {' '}View counts and impressions are lifetime-deduplicated per viewer (1 view & 1 impression per user per post).
            No raw IP addresses or exact geographic coordinates are ever stored or retained in KROMA databases. External lookup
            services process requests to resolve country-level regions only. All metrics reflect actual verified visits without
            artificial interpolation.
          </span>
        </div>
      </div>
    </div>
  );
};
