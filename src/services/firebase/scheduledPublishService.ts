import {
  collection,
  doc,
  getDocs,
  query,
  where,
  limit,
  runTransaction,
  Timestamp,
  increment,
} from 'firebase/firestore';
import { getFirebaseDb, handleFirestoreError, OperationType } from './index';

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
 * Normalizes any timestamp representation (Firestore Timestamp, ISO String, or seconds) into a JavaScript Date
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
 * Idempotently evaluates due scheduled posts in atomic Firestore transactions.
 * Supports both Client Firestore SDK and Admin Firestore SDK (for Netlify / backend automated jobs).
 */
export const publishDueScheduledPosts = async (
  batchLimit: number = 30,
  customDb?: any
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

  // If an Admin Firestore instance or custom instance with .collection() is supplied:
  if (customDb && typeof customDb.collection === 'function') {
    return publishWithAdminDb(customDb, batchLimit, result);
  }

  const db = customDb || getFirebaseDb();

  if (!db) {
    result.success = false;
    result.errors.push({ postId: 'all', error: 'Firebase Firestore is not initialized or configured.' });
    return result;
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const candidateIds = new Set<string>();

  // Strategy 1: Range query using Firestore Timestamp (optimal when stored as Timestamp)
  try {
    const nowTimestamp = Timestamp.fromDate(now);
    const qTimestamp = query(
      collection(db, POSTS_COLLECTION),
      where('publishStatus', '==', 'scheduled'),
      where('isPublished', '==', false),
      where('scheduledPublishAt', '<=', nowTimestamp),
      limit(batchLimit)
    );
    const snapTimestamp = await getDocs(qTimestamp);
    snapTimestamp.forEach(docSnap => candidateIds.add(docSnap.id));
  } catch (err: any) {
    console.warn('[Scheduler] Timestamp query notice (falling back):', err?.message || err);
  }

  // Strategy 2: Range query using ISO string comparison (for backward compatibility with string timestamps)
  try {
    const qString = query(
      collection(db, POSTS_COLLECTION),
      where('publishStatus', '==', 'scheduled'),
      where('isPublished', '==', false),
      where('scheduledPublishAt', '<=', nowIso),
      limit(batchLimit)
    );
    const snapString = await getDocs(qString);
    snapString.forEach(docSnap => candidateIds.add(docSnap.id));
  } catch (err: any) {
    console.warn('[Scheduler] ISO string query notice:', err?.message || err);
  }

  // Strategy 3: Resilience fallback if composite index is pending or building
  if (candidateIds.size === 0) {
    try {
      const qFallback = query(
        collection(db, POSTS_COLLECTION),
        where('publishStatus', '==', 'scheduled'),
        where('isPublished', '==', false),
        limit(batchLimit)
      );
      const snapFallback = await getDocs(qFallback);
      snapFallback.forEach(docSnap => {
        const data = docSnap.data();
        const schedDate = parseScheduleDate(data.scheduledPublishAt);
        if (schedDate && schedDate.getTime() <= now.getTime()) {
          candidateIds.add(docSnap.id);
        }
      });
    } catch (fallbackErr: any) {
      console.warn('[Scheduler] Fallback scan notice:', fallbackErr?.message || fallbackErr);
    }
  }

  result.totalChecked = candidateIds.size;

  if (candidateIds.size === 0) {
    return result;
  }

  // Process candidate posts atomically via transactions
  for (const postId of Array.from(candidateIds)) {
    try {
      const postRef = doc(db, POSTS_COLLECTION, postId);

      const txResult = await runTransaction(db, async transaction => {
        const postDoc = await transaction.get(postRef);
        if (!postDoc.exists()) {
          return { published: false, reason: 'not_found' };
        }

        const data = postDoc.data();

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
          const userRef = doc(db, 'users', data.creatorId);
          const userDoc = await transaction.get(userRef);
          if (userDoc.exists()) {
            transaction.update(userRef, {
              postsCount: increment(1),
            });
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
        console.log(`[Scheduler] Successfully published due post: ${postId} (creator: ${txResult.creatorId})`);
      } else {
        result.skippedCount++;
        console.log(`[Scheduler] Skipped post ${postId}: ${txResult.reason}`);
      }
    } catch (postErr: any) {
      console.error(`[Scheduler] Error processing post ${postId}:`, postErr);
      result.errors.push({
        postId,
        error: postErr?.message || String(postErr),
      });
      handleFirestoreError(postErr, OperationType.UPDATE, `${POSTS_COLLECTION}/${postId}`);
    }
  }

  return result;
};

/**
 * Executes scheduled post publishing using the Firebase Admin SDK Firestore instance (server/Netlify execution).
 * Bypasses client-side security rules for trusted automated jobs.
 */
const publishWithAdminDb = async (
  adminDb: any,
  batchLimit: number,
  result: PublishDueResult
): Promise<PublishDueResult> => {
  const now = new Date();
  const nowIso = now.toISOString();
  const candidateIds = new Set<string>();

  // Strategy 1: Timestamp query
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

  // Strategy 2: Range query using ISO string comparison
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

  // Strategy 3: Resilience fallback scan if composite index is pending
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

  // Process candidate posts atomically via Admin transactions
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
              });
            }
          } catch {
            // User counter increment is non-blocking
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
