import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  increment,
  QueryDocumentSnapshot,
  DocumentData,
  onSnapshot,
  Unsubscribe,
  documentId,
  Timestamp,
  runTransaction,
} from 'firebase/firestore';
import { getFirebaseDb, getFirebaseAuth, handleFirestoreError, OperationType } from './index';
import { ensureFirebaseAuthUser } from './authService';
import { Post, Comment, normalizeCategorySlug, DailyAnalyticsBucket } from '../../types';
import { generateSearchTokens, tokenizeText, rankPostsByRelevance } from '../../utils/searchEngine';
import { collectViewTrackingData, ViewTrackingData } from '../../utils/trafficTracker';

const POSTS_COLLECTION = 'posts';
const BATCH_SIZE = 24;

export interface PaginatedPostsResult {
  posts: Post[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

/**
 * Defensive normalizer for any Firestore document mapping to a valid Post
 */
export const mapFirestorePost = (data: any, id: string): Post => {
  if (!data) {
    return {
      id,
      creatorId: '',
      creator: { id: '', username: 'creator', displayName: 'Creator', avatarUrl: '' },
      title: 'Untitled Visual',
      description: '',
      imageUrl: '',
      thumbnailUrl: '',
      aspectRatio: 0.75,
      category: 'graphic-design',
      tags: [],
      styleTags: [],
      toolsUsed: [],
      likesCount: 0,
      savesCount: 0,
      viewsCount: 0,
      uniqueImpressionsCount: 0,
      commentsCount: 0,
      isPublished: true,
      createdAt: new Date().toISOString(),
    };
  }

  // Normalize createdAt to standard ISO string
  let normalizedCreatedAt = new Date().toISOString();
  if (data.createdAt) {
    if (typeof data.createdAt === 'string') {
      normalizedCreatedAt = data.createdAt;
    } else if (typeof data.createdAt.toDate === 'function') {
      normalizedCreatedAt = data.createdAt.toDate().toISOString();
    } else if (typeof data.createdAt.seconds === 'number') {
      normalizedCreatedAt = new Date(data.createdAt.seconds * 1000).toISOString();
    }
  }

  // Normalize publishedAt
  let normalizedPublishedAt: string | undefined = undefined;
  if (data.publishedAt) {
    if (typeof data.publishedAt === 'string') {
      normalizedPublishedAt = data.publishedAt;
    } else if (typeof data.publishedAt.toDate === 'function') {
      normalizedPublishedAt = data.publishedAt.toDate().toISOString();
    } else if (typeof data.publishedAt.seconds === 'number') {
      normalizedPublishedAt = new Date(data.publishedAt.seconds * 1000).toISOString();
    }
  }

  // Normalize scheduledPublishAt
  let normalizedScheduledPublishAt: string | undefined = undefined;
  if (data.scheduledPublishAt) {
    if (typeof data.scheduledPublishAt === 'string') {
      normalizedScheduledPublishAt = data.scheduledPublishAt;
    } else if (typeof data.scheduledPublishAt.toDate === 'function') {
      normalizedScheduledPublishAt = data.scheduledPublishAt.toDate().toISOString();
    } else if (typeof data.scheduledPublishAt.seconds === 'number') {
      normalizedScheduledPublishAt = new Date(data.scheduledPublishAt.seconds * 1000).toISOString();
    }
  }

  let normalizedUpdatedAt: string | undefined = undefined;
  if (data.updatedAt) {
    if (typeof data.updatedAt === 'string') {
      normalizedUpdatedAt = data.updatedAt;
    } else if (typeof data.updatedAt.toDate === 'function') {
      normalizedUpdatedAt = data.updatedAt.toDate().toISOString();
    } else if (typeof data.updatedAt.seconds === 'number') {
      normalizedUpdatedAt = new Date(data.updatedAt.seconds * 1000).toISOString();
    }
  }

  const creatorObj = data.creator || {};
  const creatorId = data.creatorId || creatorObj.id || '';

  return {
    id,
    creatorId,
    creator: {
      id: creatorId,
      username: creatorObj.username || 'creator',
      displayName: creatorObj.displayName || 'Creator',
      avatarUrl:
        creatorObj.avatarUrl ||
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=300&auto=format&fit=crop',
    },
    title: data.title || 'Untitled Visual',
    description: data.description || '',
    imageUrl: data.imageUrl || '',
    thumbnailUrl: data.thumbnailUrl || data.imageUrl || '',
    aspectRatio:
      typeof data.aspectRatio === 'number' && !isNaN(data.aspectRatio) && data.aspectRatio > 0
        ? data.aspectRatio
        : 0.75,
    imageWidth: data.imageWidth,
    imageHeight: data.imageHeight,
    imageMimeType: data.imageMimeType,
    imageSize: data.imageSize,
    thumbnailWidth: data.thumbnailWidth,
    thumbnailHeight: data.thumbnailHeight,
    imageObjectKey: data.imageObjectKey,
    thumbnailObjectKey: data.thumbnailObjectKey,
    category: data.category ? normalizeCategorySlug(data.category) : undefined,
    tags: Array.isArray(data.tags) ? data.tags : [],
    styleTags: Array.isArray(data.styleTags) ? data.styleTags : [],
    toolsUsed: Array.isArray(data.toolsUsed) ? data.toolsUsed : [],
    isAIGenerated: Boolean(data.isAIGenerated),
    imageAltText:
      typeof data.imageAltText === 'string' && data.imageAltText.trim()
        ? data.imageAltText.trim()
        : data.title || undefined,
    publishStatus: data.publishStatus === 'scheduled' ? 'scheduled' : 'published',
    scheduledPublishAt: normalizedScheduledPublishAt,
    publishedAt: normalizedPublishedAt,
    sourceUrl: typeof data.sourceUrl === 'string' && data.sourceUrl.trim() ? data.sourceUrl.trim() : undefined,
    ctaLabel: typeof data.ctaLabel === 'string' && data.ctaLabel.trim() ? data.ctaLabel.trim().slice(0, 32) : undefined,
    likesCount: typeof data.likesCount === 'number' ? Math.max(0, data.likesCount) : 0,
    savesCount: typeof data.savesCount === 'number' ? Math.max(0, data.savesCount) : 0,
    viewsCount: typeof data.viewsCount === 'number' ? Math.max(0, data.viewsCount) : 0,
    uniqueImpressionsCount: typeof data.uniqueImpressionsCount === 'number' ? Math.max(0, data.uniqueImpressionsCount) : 0,
    linkClicksCount: typeof data.linkClicksCount === 'number' ? Math.max(0, data.linkClicksCount) : 0,
    commentsCount: typeof data.commentsCount === 'number' ? Math.max(0, data.commentsCount) : 0,
    impressionsBySource: data.impressionsBySource && typeof data.impressionsBySource === 'object' ? data.impressionsBySource : undefined,
    viewsByDevice: data.viewsByDevice && typeof data.viewsByDevice === 'object' ? data.viewsByDevice : undefined,
    viewsBySource: data.viewsBySource && typeof data.viewsBySource === 'object' ? data.viewsBySource : undefined,
    viewsByCountry: data.viewsByCountry && typeof data.viewsByCountry === 'object' ? data.viewsByCountry : undefined,
    isPublished: data.isPublished !== undefined ? Boolean(data.isPublished) : true,
    isFeatured: Boolean(data.isFeatured),
    searchTokens: Array.isArray(data.searchTokens) ? data.searchTokens : undefined,
    createdAt: normalizedCreatedAt,
    updatedAt: normalizedUpdatedAt,
  };
};

/**
 * Fetch a paginated page of published posts from Firestore.
 * Supports public guests and authenticated users.
 */
export const fetchFirestorePostsPage = async (options?: {
  category?: string;
  startAfterDoc?: QueryDocumentSnapshot<DocumentData> | null;
  limitCount?: number;
  creatorId?: string;
}): Promise<PaginatedPostsResult> => {
  const db = getFirebaseDb();
  if (!db) {
    return { posts: [], lastDoc: null, hasMore: false };
  }

  const pageSize = options?.limitCount || BATCH_SIZE;

  try {
    const constraints: any[] = [
      where('isPublished', '==', true),
      orderBy('createdAt', 'desc'),
    ];

    if (options?.category && options.category !== 'all') {
      const normalizedCat = normalizeCategorySlug(options.category);
      if (normalizedCat !== 'all') {
        constraints.unshift(where('category', '==', normalizedCat));
      }
    }

    if (options?.creatorId) {
      constraints.unshift(where('creatorId', '==', options.creatorId));
    }

    if (options?.startAfterDoc) {
      constraints.push(startAfter(options.startAfterDoc));
    }

    constraints.push(limit(pageSize));

    const q = query(collection(db, POSTS_COLLECTION), ...constraints);
    const snapshot = await getDocs(q);

    const posts: Post[] = [];
    snapshot.forEach(docSnap => {
      posts.push(mapFirestorePost(docSnap.data(), docSnap.id));
    });

    const lastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;
    const hasMore = snapshot.docs.length === pageSize;

    return { posts, lastDoc, hasMore };
  } catch (err: any) {
    // If composite query fails (e.g., missing index for category/creatorId filter), gracefully fallback
    if (options?.category || options?.creatorId) {
      try {
        const fallbackConstraints: any[] = [
          where('isPublished', '==', true),
          orderBy('createdAt', 'desc'),
          limit(pageSize * 3),
        ];

        const fallbackQ = query(collection(db, POSTS_COLLECTION), ...fallbackConstraints);
        const snapshot = await getDocs(fallbackQ);

        let filteredPosts: Post[] = [];
        snapshot.forEach(docSnap => {
          filteredPosts.push(mapFirestorePost(docSnap.data(), docSnap.id));
        });

        if (options?.category && options.category !== 'all') {
          const normalizedCat = normalizeCategorySlug(options.category);
          filteredPosts = filteredPosts.filter(p => normalizeCategorySlug(p.category) === normalizedCat);
        }

        if (options?.creatorId) {
          filteredPosts = filteredPosts.filter(p => p.creatorId === options.creatorId);
        }

        const lastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;
        return {
          posts: filteredPosts.slice(0, pageSize),
          lastDoc,
          hasMore: filteredPosts.length > pageSize,
        };
      } catch (fallbackErr) {
        handleFirestoreError(err, OperationType.LIST, POSTS_COLLECTION);
        throw err;
      }
    }

    handleFirestoreError(err, OperationType.LIST, POSTS_COLLECTION);
    throw err;
  }
};

/**
 * Production Discovery Search:
 * Independent query executing word-weighted relevance matching on published posts.
 */
export const searchFirestorePosts = async (
  queryText: string,
  category?: string,
  limitCount: number = 60
): Promise<Post[]> => {
  const db = getFirebaseDb();
  if (!db) return [];

  const rawQuery = (queryText || '').trim();
  if (!rawQuery) {
    const result = await fetchFirestorePostsPage({
      category: category && category !== 'all' ? category : undefined,
      limitCount,
    });
    return result.posts;
  }

  const queryTokens = tokenizeText(rawQuery);
  const normalizedCategory = category ? normalizeCategorySlug(category) : 'all';

  try {
    const candidatesMap = new Map<string, Post>();

    // Strategy 1: If we have search tokens, query using array-contains-any on bounded searchTokens (up to 10 tokens)
    if (queryTokens.length > 0) {
      try {
        const tokenBatch = queryTokens.slice(0, 10);
        const tokenQueryConstraints: any[] = [
          where('isPublished', '==', true),
          where('searchTokens', 'array-contains-any', tokenBatch),
          limit(limitCount),
        ];

        const tokenQuery = query(collection(db, POSTS_COLLECTION), ...tokenQueryConstraints);
        const tokenSnap = await getDocs(tokenQuery);
        tokenSnap.forEach(docSnap => {
          candidatesMap.set(docSnap.id, mapFirestorePost(docSnap.data(), docSnap.id));
        });
      } catch (tokenErr) {
        console.warn('Search token query fallback:', tokenErr);
      }
    }

    // Strategy 2: If candidates are few or to ensure legacy posts (without searchTokens) are covered,
    // fetch recent published candidate batch
    if (candidatesMap.size < 30) {
      try {
        const fallbackConstraints: any[] = [
          where('isPublished', '==', true),
          orderBy('createdAt', 'desc'),
          limit(limitCount),
        ];

        if (normalizedCategory !== 'all') {
          fallbackConstraints.unshift(where('category', '==', normalizedCategory));
        }

        const fallbackQuery = query(collection(db, POSTS_COLLECTION), ...fallbackConstraints);
        const fallbackSnap = await getDocs(fallbackQuery);
        fallbackSnap.forEach(docSnap => {
          if (!candidatesMap.has(docSnap.id)) {
            candidatesMap.set(docSnap.id, mapFirestorePost(docSnap.data(), docSnap.id));
          }
        });
      } catch (fallbackErr) {
        console.warn('Search candidate retrieval notice:', fallbackErr);
      }
    }

    const candidatePosts = Array.from(candidatesMap.values());

    // Filter by category if explicitly specified and not 'all'
    const categoryFiltered =
      normalizedCategory === 'all'
        ? candidatePosts
        : candidatePosts.filter(p => normalizeCategorySlug(p.category) === normalizedCategory);

    // Apply Word-Weighted Relevance Ranking
    return rankPostsByRelevance(categoryFiltered, rawQuery);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `${POSTS_COLLECTION}/search`);
    throw err;
  }
};

/**
 * Fetch a single post by ID from Firestore
 */
export const fetchFirestorePostById = async (postId: string): Promise<Post | null> => {
  const db = getFirebaseDb();
  if (!db) return null;

  try {
    const snap = await getDoc(doc(db, POSTS_COLLECTION, postId));
    if (snap.exists()) {
      return mapFirestorePost(snap.data(), snap.id);
    }
    return null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `${POSTS_COLLECTION}/${postId}`);
    return null;
  }
};

/**
 * Fetch posts created by a specific creator
 */
export const fetchPostsByCreator = async (
  creatorId: string,
  limitCount: number = 30
): Promise<Post[]> => {
  const db = getFirebaseDb();
  if (!db || !creatorId) return [];

  try {
    const q = query(
      collection(db, POSTS_COLLECTION),
      where('creatorId', '==', creatorId),
      where('isPublished', '==', true),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    const snap = await getDocs(q);
    const posts: Post[] = [];
    snap.forEach(docSnap => {
      posts.push(mapFirestorePost(docSnap.data(), docSnap.id));
    });
    return posts;
  } catch (err: any) {
    // Index-free equality fallback: Querying creatorId + isPublished does NOT require composite indexes (only orderBy does)
    try {
      const fallbackQ = query(
        collection(db, POSTS_COLLECTION),
        where('creatorId', '==', creatorId),
        where('isPublished', '==', true),
        limit(limitCount * 2)
      );
      const snap = await getDocs(fallbackQ);
      const posts: Post[] = [];
      snap.forEach(docSnap => {
        posts.push(mapFirestorePost(docSnap.data(), docSnap.id));
      });
      posts.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      return posts.slice(0, limitCount);
    } catch (fallbackErr) {
      handleFirestoreError(err, OperationType.LIST, POSTS_COLLECTION);
      throw err;
    }
  }
};

/**
 * Efficiently computes total viewsCount across ALL published posts for a creator in Firestore.
 * Does not load the entire global posts collection or rely on feed pagination limits.
 */
export const fetchCreatorTotalViews = async (creatorId: string): Promise<number> => {
  const db = getFirebaseDb();
  if (!db || !creatorId) return 0;

  try {
    const q = query(
      collection(db, POSTS_COLLECTION),
      where('creatorId', '==', creatorId),
      where('isPublished', '==', true)
    );
    const snap = await getDocs(q);
    let totalViews = 0;
    snap.forEach(docSnap => {
      const data = docSnap.data();
      const vc = typeof data.viewsCount === 'number' ? Math.max(0, data.viewsCount) : 0;
      totalViews += vc;
    });
    return totalViews;
  } catch (err: any) {
    // Single-field fallback if index error
    try {
      const fallbackQ = query(
        collection(db, POSTS_COLLECTION),
        where('creatorId', '==', creatorId)
      );
      const snap = await getDocs(fallbackQ);
      let totalViews = 0;
      snap.forEach(docSnap => {
        const data = docSnap.data();
        const isPub = data.isPublished !== undefined ? Boolean(data.isPublished) : true;
        if (isPub) {
          const vc = typeof data.viewsCount === 'number' ? Math.max(0, data.viewsCount) : 0;
          totalViews += vc;
        }
      });
      return totalViews;
    } catch {
      return 0;
    }
  }
};

/**
 * Fetch multiple posts by their document IDs from Firestore
 */
export const fetchFirestorePostsByIds = async (postIds: string[]): Promise<Post[]> => {
  const db = getFirebaseDb();
  if (!db || !postIds || postIds.length === 0) return [];

  const validIds = Array.from(new Set(postIds.filter(Boolean)));
  if (validIds.length === 0) return [];

  try {
    // Firestore 'in' query supports up to 30 items per batch
    const batches: string[][] = [];
    for (let i = 0; i < validIds.length; i += 30) {
      batches.push(validIds.slice(i, i + 30));
    }

    const fetchedPosts: Post[] = [];

    for (const batch of batches) {
      const q = query(
        collection(db, POSTS_COLLECTION),
        where(documentId(), 'in', batch)
      );
      const snap = await getDocs(q);
      snap.forEach(docSnap => {
        fetchedPosts.push(mapFirestorePost(docSnap.data(), docSnap.id));
      });
    }

    return fetchedPosts;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, POSTS_COLLECTION);
    return [];
  }
};

/**
 * Fetch bounded related published posts for a specific target post.
 * Uses bounded tag matching, category candidates, and recent posts fallback,
 * ranked by metadata relevance to provide rich "More to explore" visuals.
 */
export const fetchRelatedFirestorePosts = async (
  targetPost: Post,
  limitCount: number = 12
): Promise<Post[]> => {
  const db = getFirebaseDb();
  if (!db || !targetPost) return [];

  const candidateMap = new Map<string, Post>();

  try {
    // 1. Candidate Strategy A: Query by tags (bounded array-contains-any, max 10 tags)
    const validTags = (targetPost.tags || [])
      .map(t => t.trim().toLowerCase())
      .filter(t => t.length > 0)
      .slice(0, 10);

    if (validTags.length > 0) {
      try {
        const tagQuery = query(
          collection(db, POSTS_COLLECTION),
          where('isPublished', '==', true),
          where('tags', 'array-contains-any', validTags),
          limit(24)
        );
        const snap = await getDocs(tagQuery);
        snap.forEach(docSnap => {
          if (docSnap.id !== targetPost.id) {
            candidateMap.set(docSnap.id, mapFirestorePost(docSnap.data(), docSnap.id));
          }
        });
      } catch (tagErr) {
        console.warn('Related posts tag query notice:', tagErr);
      }
    }

    // 2. Candidate Strategy B: Query by category if candidates are few
    if (candidateMap.size < 16 && targetPost.category && targetPost.category !== 'all') {
      try {
        const catQuery = query(
          collection(db, POSTS_COLLECTION),
          where('isPublished', '==', true),
          where('category', '==', normalizeCategorySlug(targetPost.category)),
          limit(24)
        );
        const catSnap = await getDocs(catQuery);
        catSnap.forEach(docSnap => {
          if (docSnap.id !== targetPost.id) {
            candidateMap.set(docSnap.id, mapFirestorePost(docSnap.data(), docSnap.id));
          }
        });
      } catch (catErr) {
        console.warn('Related posts category query notice:', catErr);
      }
    }

    // 3. Candidate Strategy C: Fill remaining positions using recent published posts
    if (candidateMap.size < limitCount) {
      try {
        const recentQuery = query(
          collection(db, POSTS_COLLECTION),
          where('isPublished', '==', true),
          orderBy('createdAt', 'desc'),
          limit(24)
        );
        const recentSnap = await getDocs(recentQuery);
        recentSnap.forEach(docSnap => {
          if (docSnap.id !== targetPost.id && !candidateMap.has(docSnap.id)) {
            candidateMap.set(docSnap.id, mapFirestorePost(docSnap.data(), docSnap.id));
          }
        });
      } catch (recentErr) {
        console.warn('Related posts recent query fallback notice:', recentErr);
      }
    }

    const candidates = Array.from(candidateMap.values());

    // Lightweight Ranking
    const targetTagSet = new Set((targetPost.tags || []).map(t => t.toLowerCase()));
    const targetStyleTagSet = new Set((targetPost.styleTags || []).map(t => t.toLowerCase()));
    const targetToolsSet = new Set((targetPost.toolsUsed || []).map(t => t.toLowerCase()));
    const targetCategory = targetPost.category ? normalizeCategorySlug(targetPost.category) : '';
    const targetTokens = new Set(tokenizeText(`${targetPost.title} ${targetPost.description}`));

    const scored = candidates.map(cand => {
      let score = 0;

      // Shared tags (+3 each)
      (cand.tags || []).forEach(t => {
        if (targetTagSet.has(t.toLowerCase())) score += 3;
      });

      // Shared category (+2)
      if (cand.category && normalizeCategorySlug(cand.category) === targetCategory && targetCategory !== 'all') {
        score += 2;
      }

      // Shared styleTags (+2 each)
      (cand.styleTags || []).forEach(s => {
        if (targetStyleTagSet.has(s.toLowerCase())) score += 2;
      });

      // Shared tools (+1 each)
      (cand.toolsUsed || []).forEach(tool => {
        if (targetToolsSet.has(tool.toLowerCase())) score += 1;
      });

      // Matching title / description tokens (+0.5 each)
      const candTokens = tokenizeText(`${cand.title} ${cand.description}`);
      candTokens.forEach(token => {
        if (targetTokens.has(token)) score += 0.5;
      });

      // Small popularity boost
      score += Math.min((cand.likesCount || 0) + (cand.savesCount || 0), 50) * 0.02;

      return { post: cand, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limitCount).map(item => item.post);
  } catch (err) {
    console.error('Error fetching related posts:', err);
    return [];
  }
};

/**
 * Create a new visual post in Firestore.
 * Strictly increments postsCount ONLY for immediately published posts.
 */
export const createFirestorePost = async (post: Post): Promise<void> => {
  const db = getFirebaseDb();
  if (!db) return;

  const auth = getFirebaseAuth();
  let currentUid = auth?.currentUser?.uid;

  if (!currentUid) {
    const ensuredUser = await ensureFirebaseAuthUser();
    currentUid = ensuredUser?.uid;
  }

  const effectiveCreatorId = currentUid || post.creatorId;

  try {
    const searchTokens = generateSearchTokens(post);
    const postRef = doc(db, POSTS_COLLECTION, post.id);

    const isScheduled = post.publishStatus === 'scheduled' || post.isPublished === false;
    const isActuallyPublished = !isScheduled;

    const safeTitle = (post.title || 'Untitled Visual').slice(0, 140);
    const safeDescription = (post.description || '').slice(0, 2000);
    const safeCategory = post.category ? post.category.slice(0, 60) : undefined;
    const safeCta = post.ctaLabel ? post.ctaLabel.slice(0, 32) : undefined;
    const safeSourceUrl = post.sourceUrl ? post.sourceUrl.slice(0, 500) : undefined;
    const safeImageAlt = post.imageAltText ? post.imageAltText.slice(0, 500) : undefined;
    const safeMimeType = post.imageMimeType ? post.imageMimeType.slice(0, 50) : undefined;
    const safeCreatedAt = typeof post.createdAt === 'string' && post.createdAt ? post.createdAt : new Date().toISOString();
    const safeUpdatedAt = new Date().toISOString();

    const rawData: Record<string, any> = {
      ...post,
      id: post.id,
      creatorId: effectiveCreatorId,
      title: safeTitle,
      description: safeDescription,
      imageUrl: post.imageUrl || '',
      thumbnailUrl: post.thumbnailUrl || post.imageUrl || '',
      aspectRatio: typeof post.aspectRatio === 'number' && !isNaN(post.aspectRatio) ? post.aspectRatio : 0.75,
      likesCount: typeof post.likesCount === 'number' ? post.likesCount : 0,
      savesCount: typeof post.savesCount === 'number' ? post.savesCount : 0,
      viewsCount: typeof post.viewsCount === 'number' ? post.viewsCount : 0,
      uniqueImpressionsCount: typeof post.uniqueImpressionsCount === 'number' ? post.uniqueImpressionsCount : 0,
      linkClicksCount: typeof post.linkClicksCount === 'number' ? post.linkClicksCount : 0,
      commentsCount: typeof post.commentsCount === 'number' ? post.commentsCount : 0,
      isPublished: isActuallyPublished,
      isFeatured: Boolean(post.isFeatured),
      isAIGenerated: Boolean(post.isAIGenerated),
      publishStatus: isScheduled ? 'scheduled' : 'published',
      searchTokens,
      createdAt: safeCreatedAt,
      updatedAt: safeUpdatedAt,
    };

    if (safeCategory) rawData.category = safeCategory;
    if (safeCta) rawData.ctaLabel = safeCta;
    if (safeSourceUrl) rawData.sourceUrl = safeSourceUrl;
    if (safeImageAlt) rawData.imageAltText = safeImageAlt;
    if (safeMimeType) rawData.imageMimeType = safeMimeType;
    if (typeof post.imageWidth === 'number') rawData.imageWidth = post.imageWidth;
    if (typeof post.imageHeight === 'number') rawData.imageHeight = post.imageHeight;
    if (typeof post.thumbnailWidth === 'number') rawData.thumbnailWidth = post.thumbnailWidth;
    if (typeof post.thumbnailHeight === 'number') rawData.thumbnailHeight = post.thumbnailHeight;
    if (typeof post.imageSize === 'number') rawData.imageSize = post.imageSize;
    if (post.imageObjectKey) rawData.imageObjectKey = post.imageObjectKey.slice(0, 500);
    if (post.thumbnailObjectKey) rawData.thumbnailObjectKey = post.thumbnailObjectKey.slice(0, 500);
    if (Array.isArray(post.tags)) rawData.tags = post.tags;
    if (Array.isArray(post.styleTags)) rawData.styleTags = post.styleTags;
    if (Array.isArray(post.toolsUsed)) rawData.toolsUsed = post.toolsUsed;

    if (rawData.creator) {
      rawData.creator = {
        ...rawData.creator,
        id: effectiveCreatorId,
      };
      delete rawData.creator.isVerified;
    }

    if (isActuallyPublished) {
      rawData.publishedAt = typeof post.publishedAt === 'string' && post.publishedAt ? post.publishedAt : safeCreatedAt;
    }

    if (isScheduled && post.scheduledPublishAt) {
      rawData.scheduledPublishAt = typeof post.scheduledPublishAt === 'string' ? post.scheduledPublishAt : new Date().toISOString();
    }

    // Clean undefined fields to avoid Firestore setDoc errors on custom types
    const cleanedPost = JSON.parse(JSON.stringify(rawData));

    await setDoc(postRef, cleanedPost);

    // Increment creator's postsCount ONLY if published immediately and user document exists
    if (isActuallyPublished && effectiveCreatorId) {
      try {
        const userRef = doc(db, 'users', effectiveCreatorId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          await updateDoc(userRef, {
            postsCount: increment(1),
          });
        }
      } catch {
        // User update is non-blocking
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `${POSTS_COLLECTION}/${post.id}`);
    throw err;
  }
};

/**
 * Fetch owner's scheduled posts from Firestore.
 * Strictly returns unpublished scheduled posts sorted by scheduledPublishAt ascending.
 */
export const fetchScheduledPostsByCreator = async (
  creatorId: string,
  limitCount: number = 50
): Promise<Post[]> => {
  const db = getFirebaseDb();
  if (!db || !creatorId) return [];

  try {
    const q = query(
      collection(db, POSTS_COLLECTION),
      where('creatorId', '==', creatorId),
      where('isPublished', '==', false),
      where('publishStatus', '==', 'scheduled'),
      orderBy('scheduledPublishAt', 'asc'),
      limit(limitCount)
    );
    const snap = await getDocs(q);
    const posts: Post[] = [];
    snap.forEach(docSnap => {
      posts.push(mapFirestorePost(docSnap.data(), docSnap.id));
    });
    return posts;
  } catch (err: any) {
    // Exact Firestore error logging when primary index query fails
    console.error('[fetchScheduledPostsByCreator] Primary Firestore scheduled query failed with exact error:', {
      message: err?.message,
      code: err?.code,
      stack: err?.stack,
      error: err,
    });

    // Targeted fallback query filtering directly by creatorId, isPublished, and publishStatus
    try {
      const fallbackQ = query(
        collection(db, POSTS_COLLECTION),
        where('creatorId', '==', creatorId),
        where('isPublished', '==', false),
        where('publishStatus', '==', 'scheduled'),
        limit(limitCount)
      );
      const snap = await getDocs(fallbackQ);
      const posts: Post[] = [];
      snap.forEach(docSnap => {
        posts.push(mapFirestorePost(docSnap.data(), docSnap.id));
      });
      posts.sort((a, b) => {
        const timeA = a.scheduledPublishAt ? new Date(a.scheduledPublishAt).getTime() : 0;
        const timeB = b.scheduledPublishAt ? new Date(b.scheduledPublishAt).getTime() : 0;
        return timeA - timeB;
      });
      return posts.slice(0, limitCount);
    } catch (fallbackErr: any) {
      console.error('[fetchScheduledPostsByCreator] Fallback scheduled query also failed:', fallbackErr);
      handleFirestoreError(err, OperationType.LIST, `${POSTS_COLLECTION}/scheduled`);
      throw err;
    }
  }
};

/**
 * Immediately publishes a scheduled post (Owner Action)
 */
export const publishScheduledPostNow = async (postId: string, creatorId: string): Promise<void> => {
  const db = getFirebaseDb();
  if (!db || !postId) return;

  const postRef = doc(db, POSTS_COLLECTION, postId);
  const nowIso = new Date().toISOString();

  await runTransaction(db, async transaction => {
    const postDoc = await transaction.get(postRef);
    if (!postDoc.exists()) {
      throw new Error('Post not found');
    }
    const data = postDoc.data();
    if (data.isPublished === true) {
      return; // Already published
    }

    transaction.update(postRef, {
      isPublished: true,
      publishStatus: 'published',
      publishedAt: nowIso,
      updatedAt: nowIso,
    });

    const targetCreatorId = creatorId || data.creatorId;
    if (targetCreatorId) {
      const userRef = doc(db, 'users', targetCreatorId);
      const userDoc = await transaction.get(userRef);
      if (userDoc.exists()) {
        transaction.update(userRef, {
          postsCount: increment(1),
        });
      }
    }
  });
};

/**
 * Cancels / Deletes an unpublished scheduled post (Owner Action)
 */
export const cancelScheduledPost = async (postId: string, _creatorId: string): Promise<void> => {
  const db = getFirebaseDb();
  if (!db || !postId) return;

  // Since it was never published, postsCount was never incremented, so do NOT decrement
  await deleteDoc(doc(db, POSTS_COLLECTION, postId));
};

/**
 * Toggle like for a post using dual relationship documents: `posts/{postId}/likes/{userId}` and `users/{userId}/likedPosts/{postId}`
 */
export const toggleFirestorePostLike = async (
  postId: string,
  userId: string,
  isLiking: boolean
): Promise<void> => {
  const db = getFirebaseDb();
  if (!db || !userId) return;

  const auth = getFirebaseAuth();
  const authUid = auth?.currentUser?.uid;
  const targetUid = authUid || userId;

  const now = new Date().toISOString();
  const postLikeRef = doc(db, POSTS_COLLECTION, postId, 'likes', targetUid);
  const userLikeRef = doc(db, 'users', targetUid, 'likedPosts', postId);
  const postRef = doc(db, POSTS_COLLECTION, postId);

  // Try atomic batch first
  try {
    const batch = writeBatch(db);
    if (isLiking) {
      batch.set(postLikeRef, {
        userId: targetUid,
        postId,
        createdAt: now,
      });
      batch.set(userLikeRef, {
        userId: targetUid,
        postId,
        createdAt: now,
      });
      batch.update(postRef, {
        likesCount: increment(1),
      });
    } else {
      batch.delete(postLikeRef);
      batch.delete(userLikeRef);
      batch.update(postRef, {
        likesCount: increment(-1),
      });
    }
    await batch.commit();
    return;
  } catch (batchErr) {
    // Non-blocking fallback to individual writes
  }

  // Graceful fallback: individual writes so a restricted subcollection or counter doesn't block the like
  try {
    if (isLiking) {
      await setDoc(postLikeRef, { userId: targetUid, postId, createdAt: now });
    } else {
      await deleteDoc(postLikeRef);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `${POSTS_COLLECTION}/${postId}/likes/${targetUid}`);
  }

  // Best-effort user likedPosts subcollection and post likesCount counter
  try {
    if (isLiking) {
      await setDoc(userLikeRef, { userId: targetUid, postId, createdAt: now });
    } else {
      await deleteDoc(userLikeRef);
    }
  } catch {
    // Non-blocking
  }

  try {
    await updateDoc(postRef, {
      likesCount: increment(isLiking ? 1 : -1),
    });
  } catch {
    // Non-blocking
  }
};

/**
 * Fetch all post IDs liked by a user from their persisted `users/{userId}/likedPosts` subcollection
 */
export const fetchUserLikedPostIds = async (userId: string): Promise<string[]> => {
  const db = getFirebaseDb();
  if (!db || !userId) return [];

  try {
    const snap = await getDocs(collection(db, 'users', userId, 'likedPosts'));
    const likedIds: string[] = [];
    snap.forEach(docSnap => {
      likedIds.push(docSnap.id);
    });
    return likedIds;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `users/${userId}/likedPosts`);
    return [];
  }
};

/**
 * Update save count on a post and sync user savedPosts subcollection
 */
export const toggleFirestorePostSave = async (
  postId: string,
  userId: string,
  isSaving: boolean
): Promise<void> => {
  const db = getFirebaseDb();
  if (!db) return;

  const now = new Date().toISOString();
  const postRef = doc(db, POSTS_COLLECTION, postId);
  const userSaveRef = userId ? doc(db, 'users', userId, 'savedPosts', postId) : null;

  // Try batch first
  try {
    const batch = writeBatch(db);
    batch.update(postRef, {
      savesCount: increment(isSaving ? 1 : -1),
    });

    if (userSaveRef && userId) {
      if (isSaving) {
        batch.set(userSaveRef, {
          postId,
          userId,
          createdAt: now,
        });
      } else {
        batch.delete(userSaveRef);
      }
    }
    await batch.commit();
    return;
  } catch (batchErr) {
    console.warn('Batch save commit had an issue, running graceful individual operations:', batchErr);
  }

  // Graceful fallback: individual writes
  if (userSaveRef && userId) {
    try {
      if (isSaving) {
        await setDoc(userSaveRef, { postId, userId, createdAt: now });
      } else {
        await deleteDoc(userSaveRef);
      }
    } catch (userErr) {
      console.warn('Could not sync user savedPosts subcollection (non-blocking):', userErr);
    }
  }

  try {
    await updateDoc(postRef, {
      savesCount: increment(isSaving ? 1 : -1),
    });
  } catch (counterErr) {
    console.warn('Could not update post savesCount (non-blocking):', counterErr);
  }
};

export type DailyAnalyticsEventType = 'view' | 'impression' | 'like' | 'save' | 'comment' | 'linkClick';

export interface DailyTrackingData {
  device?: string;
  source?: string;
  geo?: { country_code?: string; country_name?: string } | null;
  timestamp?: number;
}

/**
 * Records an aggregate daily bucket entry under posts/{postId}/analyticsDaily/{YYYY-MM-DD}.
 * Minimal 1-write atomic architecture. No raw IP or coordinates stored.
 */
export const recordDailyAnalyticsBucket = async (
  postId: string,
  creatorId: string | undefined,
  tracking?: DailyTrackingData,
  eventType: DailyAnalyticsEventType = 'view'
): Promise<void> => {
  if (!postId) return;
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Synchronize with local storage cache for offline / mock testing resilience
  try {
    const localKey = `kroma_daily_${postId}_${today}`;
    const rawLocal = localStorage.getItem(localKey);
    const localData: DailyAnalyticsBucket = rawLocal
      ? JSON.parse(rawLocal)
      : {
          date: today,
          postId,
          creatorId,
          views: 0,
          impressions: 0,
          likes: 0,
          saves: 0,
          comments: 0,
          linkClicks: 0,
          viewsByDevice: {},
          viewsBySource: {},
          viewsByCountry: {},
        };

    if (creatorId && !localData.creatorId) {
      localData.creatorId = creatorId;
    }

    if (eventType === 'view') {
      localData.views = (localData.views || 0) + 1;
    } else if (eventType === 'impression') {
      localData.impressions = (localData.impressions || 0) + 1;
    } else if (eventType === 'like') {
      localData.likes = (localData.likes || 0) + 1;
    } else if (eventType === 'save') {
      localData.saves = (localData.saves || 0) + 1;
    } else if (eventType === 'comment') {
      localData.comments = (localData.comments || 0) + 1;
    } else if (eventType === 'linkClick') {
      localData.linkClicks = (localData.linkClicks || 0) + 1;
    }

    localStorage.setItem(localKey, JSON.stringify(localData));
  } catch {
    // Ignore storage quota limits
  }

  const db = getFirebaseDb();
  if (!db) return;

  // Ensure a valid authenticated or anonymous session exists for client Firestore writes
  const auth = getFirebaseAuth();
  if (auth && !auth.currentUser) {
    try {
      await ensureFirebaseAuthUser();
    } catch {
      // Continue best-effort
    }
  }

  try {
    const dailyDocRef = doc(db, POSTS_COLLECTION, postId, 'analyticsDaily', today);
    const dailyUpdates: Record<string, any> = {
      date: today,
      postId,
      updatedAt: new Date().toISOString(),
    };
    if (creatorId) {
      dailyUpdates.creatorId = creatorId;
    }

    if (eventType === 'view') {
      dailyUpdates.views = increment(1);
    } else if (eventType === 'impression') {
      dailyUpdates.impressions = increment(1);
    } else if (eventType === 'like') {
      dailyUpdates.likes = increment(1);
    } else if (eventType === 'save') {
      dailyUpdates.saves = increment(1);
    } else if (eventType === 'comment') {
      dailyUpdates.comments = increment(1);
    } else if (eventType === 'linkClick') {
      dailyUpdates.linkClicks = increment(1);
    }

    await setDoc(dailyDocRef, dailyUpdates, { merge: true });
  } catch (err) {
    console.warn('Could not record Firestore daily analytics bucket (non-blocking):', err);
  }
};

export interface RecordPostViewResult {
  didIncrement: boolean;
  alreadyViewed: boolean;
}

/**
 * Lifetime deduplicated unique view count increment for authenticated users.
 * Rule: ONE USER + ONE POST = LIFETIME ONE VIEW.
 * Uses atomic Firestore transaction on users/{userId}/postViews/{postId} and posts/{postId}.
 * Returns structured result: didIncrement true if genuine view recorded, alreadyViewed true if lifetime doc exists.
 */
export const recordFirestorePostView = async (
  postId: string,
  userId: string,
  creatorId?: string
): Promise<RecordPostViewResult> => {
  const db = getFirebaseDb();
  if (!db || !postId || !userId) return { didIncrement: false, alreadyViewed: false };

  // Never count creator viewing their own post
  if (creatorId && creatorId === userId) return { didIncrement: false, alreadyViewed: false };

  const nowIso = new Date().toISOString();

  try {
    const viewDocRef = doc(db, 'users', userId, 'postViews', postId);
    const postRef = doc(db, POSTS_COLLECTION, postId);

    // Fast-path read check: if view record already exists, do not proceed with transaction
    const quickSnap = await getDoc(viewDocRef);
    if (quickSnap.exists()) {
      return { didIncrement: false, alreadyViewed: true };
    }

    // Collect device, source, and geo tracking metadata (zero extra DB writes)
    let tracking: ViewTrackingData = {
      device: 'desktop',
      source: 'Direct',
      geo: null,
      timestamp: Date.now(),
    };

    try {
      tracking = await collectViewTrackingData();
    } catch {
      // Non-blocking
    }

    const trackingUpdates: Record<string, any> = {
      viewsCount: increment(1),
      updatedAt: nowIso,
    };

    // Atomic transaction: verify lifetime deduplication & commit post increment atomically
    const txResult = await runTransaction(db, async (transaction) => {
      // 1. Transactional read of view record to defend against concurrent races
      const viewSnap = await transaction.get(viewDocRef);
      if (viewSnap.exists()) {
        return { didIncrement: false, alreadyViewed: true };
      }

      // 2. Transactional read of post to verify existence and check creatorId
      const postSnap = await transaction.get(postRef);
      if (!postSnap.exists()) {
        return { didIncrement: false, alreadyViewed: false };
      }

      const postData = postSnap.data();
      // Defense-in-depth: Never count creator viewing their own post
      if (postData.creatorId === userId) {
        return { didIncrement: false, alreadyViewed: false };
      }

      // 3. Atomically create durable lifetime view record (No 24h reset)
      transaction.set(viewDocRef, {
        postId,
        userId,
        viewedAt: nowIso,
        createdAt: nowIso,
      });

      // 4. Atomically increment cumulative post views and update real analytics maps
      transaction.update(postRef, trackingUpdates);

      return { didIncrement: true, alreadyViewed: false };
    });

    if (txResult.didIncrement) {
      // Record daily analytics bucket asynchronously
      recordDailyAnalyticsBucket(postId, creatorId, tracking, 'view').catch(() => {});
    }

    return txResult;
  } catch (err) {
    console.warn('Could not record Firestore post view:', err);
    return { didIncrement: false, alreadyViewed: false };
  }
};

/**
 * Controlled view count increment for guests/logged-out visitors
 */
export const incrementFirestorePostView = async (postId: string, creatorId?: string): Promise<boolean> => {
  const db = getFirebaseDb();
  if (!db || !postId) return false;

  const auth = getFirebaseAuth();
  if (auth && !auth.currentUser) {
    try {
      await ensureFirebaseAuthUser();
    } catch {
      // Continue best-effort
    }
  }

  try {
    const postRef = doc(db, POSTS_COLLECTION, postId);
    const postSnap = await getDoc(postRef);
    if (!postSnap.exists()) return false;

    const trackingUpdates: Record<string, any> = {
      viewsCount: increment(1),
      updatedAt: new Date().toISOString(),
    };
    let tracking: ViewTrackingData = {
      device: 'desktop',
      source: 'Direct',
      geo: null,
      timestamp: Date.now(),
    };

    try {
      tracking = await collectViewTrackingData();
    } catch {
      // Non-blocking
    }

    await updateDoc(postRef, trackingUpdates);

    // Record daily analytics bucket asynchronously
    recordDailyAnalyticsBucket(postId, creatorId, tracking, 'view').catch(() => {});
    return true;
  } catch (err) {
    console.warn('Could not increment Firestore post view for guest:', err);
    return false;
  }
};

export interface RecordPostImpressionResult {
  didIncrement: boolean;
  alreadyImpressed: boolean;
}

/**
 * Lifetime deduplicated unique impression / reach increment for authenticated users.
 * Rule: ONE USER + ONE POST = LIFETIME ONE IMPRESSION.
 * Uses atomic Firestore transaction on users/{userId}/postImpressions/{postId} and posts/{postId}.
 * Returns structured result: didIncrement true if genuine impression recorded, alreadyImpressed true if exists.
 */
export const recordFirestorePostImpression = async (
  postId: string,
  userId: string,
  creatorId?: string,
  source: string = 'home'
): Promise<RecordPostImpressionResult> => {
  const db = getFirebaseDb();
  if (!db || !postId || !userId) return { didIncrement: false, alreadyImpressed: false };

  // Never count creator's own impression of their own post
  if (creatorId && creatorId === userId) return { didIncrement: false, alreadyImpressed: false };

  const nowIso = new Date().toISOString();
  const safeSource = ['home', 'search', 'related', 'profile', 'collection'].includes(source)
    ? source
    : 'home';

  try {
    const impDocRef = doc(db, 'users', userId, 'postImpressions', postId);
    const postRef = doc(db, POSTS_COLLECTION, postId);

    // Fast-path read check: if impression record already exists, do not proceed with transaction
    const quickSnap = await getDoc(impDocRef);
    if (quickSnap.exists()) {
      return { didIncrement: false, alreadyImpressed: true };
    }

    const trackingUpdates: Record<string, any> = {
      uniqueImpressionsCount: increment(1),
      updatedAt: nowIso,
    };

    // Atomic transaction: verify lifetime deduplication & commit post increment atomically
    const txResult = await runTransaction(db, async (transaction) => {
      // 1. Transactional read of impression record to defend against concurrent races
      const impSnap = await transaction.get(impDocRef);
      if (impSnap.exists()) {
        return { didIncrement: false, alreadyImpressed: true };
      }

      // 2. Transactional read of post to verify existence and check creatorId
      const postSnap = await transaction.get(postRef);
      if (!postSnap.exists()) {
        return { didIncrement: false, alreadyImpressed: false };
      }

      const postData = postSnap.data();
      // Defense-in-depth: Never count creator seeing their own post
      if (postData.creatorId === userId) {
        return { didIncrement: false, alreadyImpressed: false };
      }

      // 3. Atomically create durable lifetime impression record (No 24h reset, no TTL)
      transaction.set(impDocRef, {
        postId,
        userId,
        source: safeSource,
        impressedAt: nowIso,
        createdAt: nowIso,
      });

      // 4. Atomically increment cumulative post unique impressions and source breakdown
      transaction.update(postRef, trackingUpdates);

      return { didIncrement: true, alreadyImpressed: false };
    });

    if (txResult.didIncrement) {
      const tracking: DailyTrackingData = {
        device: 'desktop',
        source: safeSource,
        geo: null,
        timestamp: Date.now(),
      };
      recordDailyAnalyticsBucket(postId, creatorId, tracking, 'impression').catch(() => {});
    }

    return txResult;
  } catch (err) {
    console.warn('Could not record Firestore post impression:', err);
    return { didIncrement: false, alreadyImpressed: false };
  }
};

/**
 * Controlled impression count increment for guests/logged-out visitors.
 * Note: Per-device/browser lifetime deduplication handled via localStorage on client.
 */
export const incrementFirestorePostImpression = async (
  postId: string,
  creatorId?: string,
  source: string = 'home'
): Promise<boolean> => {
  const db = getFirebaseDb();
  if (!db || !postId) return false;

  const auth = getFirebaseAuth();
  if (auth && !auth.currentUser) {
    try {
      await ensureFirebaseAuthUser();
    } catch {
      // Continue best-effort
    }
  }

  try {
    const postRef = doc(db, POSTS_COLLECTION, postId);
    const postSnap = await getDoc(postRef);
    if (!postSnap.exists()) return false;

    const safeSource = ['home', 'search', 'related', 'profile', 'collection'].includes(source)
      ? source
      : 'home';

    const trackingUpdates: Record<string, any> = {
      uniqueImpressionsCount: increment(1),
      updatedAt: new Date().toISOString(),
    };

    await updateDoc(postRef, trackingUpdates);

    const tracking: DailyTrackingData = {
      device: 'desktop',
      source: safeSource,
      geo: null,
      timestamp: Date.now(),
    };
    recordDailyAnalyticsBucket(postId, creatorId, tracking, 'impression').catch(() => {});

    return true;
  } catch (err) {
    console.warn('Could not increment Firestore post impression for guest:', err);
    return false;
  }
};

/**
 * Controlled external link click tracking for posts with CTA/sourceUrl.
 * Increments cumulative post `linkClicksCount` and records daily `linkClick` in analyticsDaily.
 */
export const recordFirestorePostLinkClick = async (
  postId: string,
  creatorId?: string
): Promise<boolean> => {
  const db = getFirebaseDb();
  if (!db || !postId) return false;

  const auth = getFirebaseAuth();
  if (auth && !auth.currentUser) {
    try {
      await ensureFirebaseAuthUser();
    } catch {
      // Continue best-effort
    }
  }

  try {
    const postRef = doc(db, POSTS_COLLECTION, postId);
    await updateDoc(postRef, {
      linkClicksCount: increment(1),
      updatedAt: new Date().toISOString(),
    });

    recordDailyAnalyticsBucket(postId, creatorId, undefined, 'linkClick').catch(() => {});
    return true;
  } catch (err) {
    console.warn('Could not record Firestore post link click (non-blocking):', err);
    return false;
  }
};

/**
 * Fetches daily analytics buckets for a specific post.
 * Truthful, un-interpolated date buckets.
 */
export const fetchPostDailyBuckets = async (
  postId: string,
  startDate?: string,
  endDate?: string
): Promise<DailyAnalyticsBucket[]> => {
  const bucketsMap = new Map<string, DailyAnalyticsBucket>();

  // Check localStorage for offline / newly tracked buckets
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`kroma_daily_${postId}_`)) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.date) {
            bucketsMap.set(parsed.date, parsed);
          }
        }
      }
    }
  } catch {
    // Ignore
  }

  const db = getFirebaseDb();
  if (!db || !postId) {
    return Array.from(bucketsMap.values())
      .filter(b => (!startDate || b.date >= startDate) && (!endDate || b.date <= endDate))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  try {
    const subColRef = collection(db, POSTS_COLLECTION, postId, 'analyticsDaily');
    let q = query(subColRef, orderBy('date', 'asc'));
    if (startDate) {
      q = query(subColRef, where('date', '>=', startDate), orderBy('date', 'asc'));
    }

    const snap = await getDocs(q);
    snap.forEach(docSnap => {
      const d = docSnap.data();
      const date = d.date || docSnap.id;
      if (endDate && date > endDate) return;
      if (startDate && date < startDate) return;

      bucketsMap.set(date, {
        date,
        postId,
        creatorId: d.creatorId,
        views: typeof d.views === 'number' ? d.views : 0,
        impressions: typeof d.impressions === 'number' ? d.impressions : 0,
        linkClicks: typeof d.linkClicks === 'number' ? d.linkClicks : 0,
        likes: typeof d.likes === 'number' ? d.likes : 0,
        saves: typeof d.saves === 'number' ? d.saves : 0,
        comments: typeof d.comments === 'number' ? d.comments : 0,
        viewsByDevice: d.viewsByDevice || {},
        viewsBySource: d.viewsBySource || {},
        viewsByCountry: d.viewsByCountry || {},
        updatedAt: d.updatedAt,
      });
    });
  } catch (err) {
    console.warn(`Could not fetch Firestore daily buckets for post ${postId}:`, err);
  }

  return Array.from(bucketsMap.values()).sort((a, b) => a.date.localeCompare(b.date));
};

/**
 * Fetches and aggregates daily analytics buckets across all posts of a creator.
 * Bounded query execution with truthful date aggregation.
 */
export const fetchCreatorDailyBuckets = async (
  creatorId: string,
  postIds: string[],
  startDate?: string,
  endDate?: string
): Promise<DailyAnalyticsBucket[]> => {
  if (!postIds || postIds.length === 0) return [];

  // Process all creator posts in bounded concurrent batches to avoid firing hundreds of requests simultaneously
  const BATCH_SIZE = 10;
  const postBucketResults: DailyAnalyticsBucket[][] = [];

  for (let i = 0; i < postIds.length; i += BATCH_SIZE) {
    const batch = postIds.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(id => fetchPostDailyBuckets(id, startDate, endDate))
    );
    postBucketResults.push(...batchResults);
  }

  const aggregateByDate = new Map<string, DailyAnalyticsBucket>();

  for (const postBuckets of postBucketResults) {
    for (const b of postBuckets) {
      const existing = aggregateByDate.get(b.date);
      if (!existing) {
        aggregateByDate.set(b.date, {
          date: b.date,
          creatorId,
          views: b.views || 0,
          impressions: b.impressions || 0,
          linkClicks: b.linkClicks || 0,
          likes: b.likes || 0,
          saves: b.saves || 0,
          comments: b.comments || 0,
          viewsByDevice: { ...(b.viewsByDevice || {}) },
          viewsBySource: { ...(b.viewsBySource || {}) },
          viewsByCountry: { ...(b.viewsByCountry || {}) },
        });
      } else {
        existing.views += b.views || 0;
        existing.impressions = (existing.impressions || 0) + (b.impressions || 0);
        existing.linkClicks = (existing.linkClicks || 0) + (b.linkClicks || 0);
        existing.likes = (existing.likes || 0) + (b.likes || 0);
        existing.saves = (existing.saves || 0) + (b.saves || 0);
        existing.comments = (existing.comments || 0) + (b.comments || 0);

        if (b.viewsByDevice) {
          existing.viewsByDevice = existing.viewsByDevice || {};
          for (const [dev, cnt] of Object.entries(b.viewsByDevice)) {
            if (typeof cnt === 'number') {
              existing.viewsByDevice[dev] = (existing.viewsByDevice[dev] || 0) + cnt;
            }
          }
        }
        if (b.viewsBySource) {
          existing.viewsBySource = existing.viewsBySource || {};
          for (const [src, cnt] of Object.entries(b.viewsBySource)) {
            if (typeof cnt === 'number') {
              existing.viewsBySource[src] = (existing.viewsBySource[src] || 0) + cnt;
            }
          }
        }
        if (b.viewsByCountry) {
          existing.viewsByCountry = existing.viewsByCountry || {};
          for (const [code, cnt] of Object.entries(b.viewsByCountry)) {
            if (typeof cnt === 'number') {
              existing.viewsByCountry[code] = (existing.viewsByCountry[code] || 0) + cnt;
            }
          }
        }
      }
    }
  }

  return Array.from(aggregateByDate.values()).sort((a, b) => a.date.localeCompare(b.date));
};

/**
 * Delete a post from Firestore
 */
export const deleteFirestorePost = async (postId: string, creatorId?: string): Promise<void> => {
  const db = getFirebaseDb();
  if (!db) return;

  try {
    const postRef = doc(db, POSTS_COLLECTION, postId);
    let wasPublished = true;
    try {
      const snap = await getDoc(postRef);
      if (snap.exists()) {
        const data = snap.data();
        wasPublished = data.isPublished !== false && data.publishStatus !== 'scheduled';
      }
    } catch {
      // Non-blocking
    }

    await deleteDoc(postRef);
    if (creatorId && wasPublished) {
      try {
        const userRef = doc(db, 'users', creatorId);
        await updateDoc(userRef, {
          postsCount: increment(-1),
        });
      } catch {
        // Non-blocking
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `${POSTS_COLLECTION}/${postId}`);
    throw err;
  }
};

/**
 * Fetch comments for a specific post
 */
export const fetchPostComments = async (postId: string): Promise<Comment[]> => {
  const db = getFirebaseDb();
  if (!db) return [];

  try {
    const q = query(
      collection(db, POSTS_COLLECTION, postId, 'comments'),
      orderBy('createdAt', 'asc')
    );
    const snapshot = await getDocs(q);
    const comments: Comment[] = [];
    snapshot.forEach(docSnap => {
      comments.push({ ...docSnap.data(), id: docSnap.id } as Comment);
    });
    return comments;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `${POSTS_COLLECTION}/${postId}/comments`);
    return [];
  }
};

/**
 * Subscribe to comments for a single post (scoped only when modal is open)
 */
export const subscribeToPostComments = (
  postId: string,
  onCommentsUpdate: (comments: Comment[]) => void
): Unsubscribe => {
  const db = getFirebaseDb();
  if (!db) return () => {};

  const q = query(
    collection(db, POSTS_COLLECTION, postId, 'comments'),
    orderBy('createdAt', 'asc')
  );

  return onSnapshot(
    q,
    snapshot => {
      const comments: Comment[] = [];
      snapshot.forEach(docSnap => {
        comments.push({ ...docSnap.data(), id: docSnap.id } as Comment);
      });
      onCommentsUpdate(comments);
    },
    error => {
      handleFirestoreError(error, OperationType.LIST, `${POSTS_COLLECTION}/${postId}/comments`);
    }
  );
};

/**
 * Add a comment to a post
 */
export const addFirestorePostComment = async (
  postId: string,
  comment: Comment
): Promise<void> => {
  const db = getFirebaseDb();
  if (!db) return;

  try {
    const batch = writeBatch(db);
    const commentRef = doc(db, POSTS_COLLECTION, postId, 'comments', comment.id);
    batch.set(commentRef, {
      ...comment,
      authorId: comment.userId,
    });

    const postRef = doc(db, POSTS_COLLECTION, postId);
    batch.update(postRef, {
      commentsCount: increment(1),
    });

    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `${POSTS_COLLECTION}/${postId}/comments/${comment.id}`);
    throw err;
  }
};

/**
 * Delete a comment from a post
 */
export const deleteFirestorePostComment = async (
  postId: string,
  commentId: string
): Promise<void> => {
  const db = getFirebaseDb();
  if (!db) return;

  try {
    const batch = writeBatch(db);
    const commentRef = doc(db, POSTS_COLLECTION, postId, 'comments', commentId);
    batch.delete(commentRef);

    const postRef = doc(db, POSTS_COLLECTION, postId);
    batch.update(postRef, {
      commentsCount: increment(-1),
    });

    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `${POSTS_COLLECTION}/${postId}/comments/${commentId}`);
  }
};

/**
 * Synchronize current creator identity across all posts created by user.
 * Queries all posts where creatorId == userId (including published, scheduled, and unpublished).
 * Updates embedded creator snapshot:
 * - creator.avatarUrl
 * - creator.displayName
 * - creator.username
 * - updatedAt
 * Uses writeBatch safely chunked in batches of 400 (well within Firestore 500 limit).
 */
export const syncCreatorIdentityToPosts = async (
  userId: string,
  user: {
    avatarUrl?: string;
    displayName?: string;
    username?: string;
  }
): Promise<number> => {
  const db = getFirebaseDb();
  if (!db || !userId) return 0;

  try {
    const postsRef = collection(db, POSTS_COLLECTION);
    const q = query(postsRef, where('creatorId', '==', userId));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return 0;
    }

    const now = new Date().toISOString();
    const docs = querySnapshot.docs;
    const CHUNK_SIZE = 400;
    let totalUpdated = 0;

    for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
      const chunk = docs.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);

      for (const docSnap of chunk) {
        const postData = docSnap.data();
        const existingCreator = postData.creator || {};

        const updatedCreator: Record<string, any> = {
          ...existingCreator,
          id: userId,
          avatarUrl: user.avatarUrl ?? existingCreator.avatarUrl ?? '',
          displayName: user.displayName ?? existingCreator.displayName ?? 'Creator',
          username: user.username ?? existingCreator.username ?? 'creator',
        };

        // Ensure legacy isVerified is removed from snapshot
        delete updatedCreator.isVerified;

        batch.update(docSnap.ref, {
          creator: updatedCreator,
          updatedAt: now,
        });
        totalUpdated++;
      }

      await batch.commit();
    }

    return totalUpdated;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `${POSTS_COLLECTION}?creatorId=${userId}`);
    console.error('[syncCreatorIdentityToPosts] Error updating posts creator snapshot:', err);
    return 0;
  }
};
