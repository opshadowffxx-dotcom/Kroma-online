/**
 * Core Data Models & TypeScript Interfaces for Kroma Visual Discovery Platform
 * Designed for clean Firestore mapping in Phase 2.
 */

export type CategorySlug =
  | 'all'
  | 'graphic-design'
  | 'posters'
  | 'branding'
  | 'logos'
  | 'ui-ux'
  | 'website-design'
  | 'mobile-app-design'
  | 'packaging'
  | 'illustration'
  | 'photography'
  | '3d'
  | 'ai-art'
  | 'social-media-design';

export const normalizeCategorySlug = (category?: string): string => {
  if (!category) return 'all';
  const clean = category.trim().toLowerCase();
  if (clean === 'all' || clean === 'all inspiration') return 'all';
  if (clean === 'ui/ux' || clean === 'ui-ux' || clean === 'ui / ux') return 'ui-ux';
  if (clean === 'graphic design' || clean === 'graphic-design') return 'graphic-design';
  if (clean === 'website design' || clean === 'website-design' || clean === 'web design') return 'website-design';
  if (clean === 'mobile app design' || clean === 'mobile-app-design' || clean === 'mobile app') return 'mobile-app-design';
  if (clean === '3d' || clean === '3d renders' || clean === '3d-renders' || clean === '3d render') return '3d';
  if (clean === 'ai art' || clean === 'ai-art' || clean === 'ai') return 'ai-art';
  if (clean === 'social media design' || clean === 'social-media-design') return 'social-media-design';
  return clean.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
};

export interface Category {
  id: string;
  slug: CategorySlug | string;
  name: string;
  description: string;
  coverImageUrl?: string;
  iconName?: string;
  postCount?: number;
}

export interface User {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  avatarUrl: string;
  avatarObjectKey?: string;
  bannerUrl?: string;
  coverImageUrl?: string;
  bannerObjectKey?: string;
  bio?: string;
  websiteUrl?: string;
  location?: string;
  socialLinks?: {
    instagram?: string;
    twitter?: string;
    dribbble?: string;
    behance?: string;
    github?: string;
  };
  followersCount: number;
  followingCount: number;
  postsCount: number;
  collectionsCount: number;
  profileViews?: number;
  isAdmin?: boolean;
  createdAt: string;
}

export interface Post {
  id: string;
  creatorId: string;
  creator: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
  };
  title: string;
  description: string;
  imageUrl: string;
  thumbnailUrl?: string;
  aspectRatio: number; // width / height (e.g. 0.75 for 3:4 portrait, 1.33 for 4:3 landscape)
  imageWidth?: number;
  imageHeight?: number;
  imageMimeType?: string;
  imageSize?: number;
  thumbnailWidth?: number;
  thumbnailHeight?: number;
  imageObjectKey?: string;
  thumbnailObjectKey?: string;
  category?: CategorySlug | string;
  tags: string[];
  styleTags?: string[];
  toolsUsed?: string[];
  isAIGenerated?: boolean;
  imageAltText?: string;
  publishStatus?: 'published' | 'scheduled';
  scheduledPublishAt?: string;
  sourceUrl?: string;
  ctaLabel?: string;
  likesCount: number;
  savesCount: number;
  viewsCount: number;
  uniqueImpressionsCount?: number; // Lifetime deduplicated unique discovery exposures (Reach)
  linkClicksCount?: number; // Lifetime outbound link clicks
  commentsCount: number;
  impressionsBySource?: {
    home?: number;
    search?: number;
    related?: number;
    profile?: number;
    collection?: number;
    [key: string]: number | undefined;
  };
  viewsByDevice?: {
    mobile?: number;
    tablet?: number;
    desktop?: number;
    [key: string]: number | undefined;
  };
  viewsBySource?: {
    Direct?: number;
    Pinterest?: number;
    Google?: number;
    Instagram?: number;
    Facebook?: number;
    Other?: number;
    [key: string]: number | undefined;
  };
  viewsByCountry?: {
    [countryCode: string]: number;
  };
  isPublished: boolean;
  isFeatured?: boolean;
  searchTokens?: string[];
  createdAt: string;
  publishedAt?: string;
  updatedAt?: string;
}

export interface Collection {
  id: string;
  userId: string;
  title: string;
  description?: string;
  isPrivate: boolean;
  coverImageUrl?: string;
  postIds: string[];
  postsCount: number;
  createdAt: string;
  updatedAt?: string;
}

export interface Comment {
  id: string;
  postId: string;
  userId: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
  };
  content: string;
  createdAt: string;
}

export interface FilterState {
  category: CategorySlug | string;
  searchQuery: string;
  selectedTag?: string;
  selectedTool?: string;
  sortBy: 'latest' | 'popular' | 'trending';
}

export type NotificationType = 'system' | 'like' | 'follow' | 'save' | 'comment' | 'post';

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  actor?: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
  };
  targetPost?: {
    id: string;
    title: string;
    imageUrl: string;
  };
  relatedPostId?: string;
  thumbnailUrl?: string;
  isRead: boolean;
  createdAt: string;
}

export interface DailyAnalyticsBucket {
  date: string; // YYYY-MM-DD
  postId?: string;
  creatorId?: string;
  views: number;
  impressions?: number;
  uniqueImpressions?: number;
  linkClicks?: number;
  likes?: number;
  saves?: number;
  comments?: number;
  viewsByDevice?: {
    mobile?: number;
    tablet?: number;
    desktop?: number;
    [key: string]: number | undefined;
  };
  viewsBySource?: {
    [source: string]: number | undefined;
  };
  viewsByCountry?: {
    [countryCode: string]: number;
  };
  updatedAt?: string;
}

export type ViewRoute =
  | { type: 'home' }
  | { type: 'explore' }
  | { type: 'search'; query: string }
  | { type: 'post'; postId: string }
  | { type: 'post-analytics'; postId: string }
  | { type: 'creator-analytics' }
  | { type: 'profile'; username: string; tab?: 'posts' | 'collections' | 'liked' | 'scheduled' }
  | { type: 'collections' }
  | { type: 'collection-detail'; collectionId: string }
  | { type: 'settings' }
  | { type: 'admin' };
