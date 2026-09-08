import { getAdminDb } from './firebaseAdmin';

const POSTS_COLLECTION = 'posts';

export interface PublishDueResult {
  success: boolean;
  totalChecked: number;
  publishedCount: number;
  publishedPostIds: string[];
  skippedCount: number;
  errors: Array<{ postId: string; error: string }>;
  timestamp: string;
}

/**
 * Normalizes any timestamp representation (Firestore Timestamp, ISO String, Date, or numeric seconds/millis)
 * into a valid JavaScript Date object in UTC.
 */
export const parseScheduleDate = (rawDate: any): Date | null => {
  if (!rawDate) return null;
  if (typeof rawDate.toDate === 'function') {
    return rawDate.toDate();
  }
  if (typeof rawDate.toMillis === 'function') {
    return new Date(rawDate.toMillis());
  }
  if (typeof rawDate.seconds === 'number') {
    return new Date(rawDate.seconds * 1000);
  }
  if (typeof rawDate === 'string') {
    const d = new Date(rawDate);
    return isNaN(d.getTime()) ? null : d;
  }
  if (rawDate instanceof Date) {
    return isNaN(rawDate.getTime()) ? null : rawDate;
  }
  return null;
};

/**
 * Core server-side / background scheduled publication worker.
 * Idempotently evaluates due scheduled posts using atomic Firestore transactions via Firebase Admin.
 * Guaranteed:
 * - Never increments creator postsCount early
 * - Never double-increments creator postsCount on retries
 * - Each post is published independently in its own transaction
 */
export const publishDueScheduledPostsAdmin = async (
  batchLimit: number = 50
): Promise<PublishDueResult> => {
  const result: PublishDueResult = {
    success: true,
    totalChecked: 0,
    publishedCount: 0,
    publishedPostIds: [],
    skippedCount: 0,
    errors: [],
    timestamp: new Date().toISOString(),
  };

  const adminDb = getAdminDb();
  if (!adminDb) {
    result.success = false;
    result.errors.push({
      postId: 'all',
      error: 'Firebase Admin Firestore is not initialized. Please verify FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.',
    });
    return result;
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const candidateIds = new Set<string>();

  // Strategy 1: Timestamp comparison query
  try {
    const snapTimestamp = await adminDb
      .collection(POSTS_COLLECTION)
      .where('publishStatus', '==', 'scheduled')
      .where('isPublished', '==', false)
      .where('scheduledPublishAt', '<=', now)
      .limit(batchLimit)
      .get();

    snapTimestamp.forEach((docSnap: any) => candidateIds.add(docSnap.id));
  } catch (err: any) {
    console.warn('[Admin Scheduler] Timestamp query notice (falling back):', err?.message || err);
  }

  // Strategy 2: ISO string comparison query (for backward-compatibility with string timestamps)
  try {
    const snapString = await adminDb
      .collection(POSTS_COLLECTION)
      .where('publishStatus', '==', 'scheduled')
      .where('isPublished', '==', false)
      .where('scheduledPublishAt', '<=', nowIso)
      .limit(batchLimit)
      .get();

    snapString.forEach((docSnap: any) => candidateIds.add(docSnap.id));
  } catch (err: any) {
    console.warn('[Admin Scheduler] ISO string query notice:', err?.message || err);
  }

  // Strategy 3: Resilience scan fallback if composite indexes are pending
  if (candidateIds.size === 0) {
    try {
      const snapFallback = await adminDb
        .collection(POSTS_COLLECTION)
        .where('publishStatus', '==', 'scheduled')
        .where('isPublished', '==', false)
        .limit(batchLimit)
        .get();

      snapFallback.forEach((docSnap: any) => {
        const data = docSnap.data();
        const schedDate = parseScheduleDate(data.scheduledPublishAt);
        if (schedDate && schedDate.getTime() <= now.getTime()) {
          candidateIds.add(docSnap.id);
        }
      });
    } catch (fallbackErr: any) {
      console.warn('[Admin Scheduler] Fallback scan notice:', fallbackErr?.message || fallbackErr);
    }
  }

  result.totalChecked = candidateIds.size;
  if (candidateIds.size === 0) {
    return result;
  }

  // Process candidate posts atomically via Admin transactions for guaranteed idempotency
  for (const postId of Array.from(candidateIds)) {
    try {
      const postRef = adminDb.collection(POSTS_COLLECTION).doc(postId);

      const txResult = await adminDb.runTransaction(async (transaction: any) => {
        const postDoc = await transaction.get(postRef);
        if (!postDoc.exists) {
          return { published: false, reason: 'not_found' };
        }

        const data = postDoc.data() || {};

        // Idempotency check 1: Was it already published?
        if (data.isPublished === true || data.publishStatus !== 'scheduled') {
          return { published: false, reason: 'already_published' };
        }

        // Idempotency check 2: Is it actually due?
        const schedDate = parseScheduleDate(data.scheduledPublishAt);
        if (!schedDate || schedDate.getTime() > Date.now()) {
          return { published: false, reason: 'not_due_yet' };
        }

        const publishTimestamp = new Date().toISOString();

        // 1. Transition post to published status
        transaction.update(postRef, {
          isPublished: true,
          publishStatus: 'published',
          publishedAt: publishTimestamp,
          updatedAt: publishTimestamp,
        });

        // 2. Increment creator's postsCount atomically
        if (data.creatorId) {
          const userRef = adminDb.collection('users').doc(data.creatorId);
          try {
            const userDoc = await transaction.get(userRef);
            if (userDoc.exists) {
              const currentCount = userDoc.data()?.postsCount || 0;
              transaction.update(userRef, {
                postsCount: currentCount + 1,
                updatedAt: publishTimestamp,
              });
            }
          } catch (userErr) {
            console.warn(`[Admin Scheduler] Non-blocking user count update error for ${data.creatorId}:`, userErr);
          }
        }

        return {
          published: true,
          postId,
          creatorId: data.creatorId,
        };
      });

      if (txResult.published) {
        result.publishedCount++;
        result.publishedPostIds.push(postId);
        console.log(`[Admin Scheduler] Successfully published due post: ${postId} (creator: ${txResult.creatorId})`);
      } else {
        result.skippedCount++;
        console.log(`[Admin Scheduler] Skipped post ${postId}: ${txResult.reason}`);
      }
    } catch (postErr: any) {
      console.error(`[Admin Scheduler] Error processing post ${postId}:`, postErr);
      result.errors.push({
        postId,
        error: postErr?.message || String(postErr),
      });
    }
  }

  return result;
};
