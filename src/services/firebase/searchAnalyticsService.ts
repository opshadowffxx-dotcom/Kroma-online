import {
  doc,
  setDoc,
  getDocs,
  collection,
  query,
  orderBy,
  limit,
  increment,
  serverTimestamp
} from 'firebase/firestore';
import { getFirebaseDb } from './index';

/**
 * Clean & Cost-Efficient Aggregate Search Popularity Service
 *
 * Architecture:
 * - ZERO writes on typing or keystrokes.
 * - Exactly ONE write per user-committed search (Enter, Search for "...", clicking suggestion).
 * - Aggregate counters: searchQueries/{normalizedQuery} with atomic increment(1).
 * - No IP addresses, device fingerprints, or per-event logs.
 * - In-memory throttle prevents repeated submissions within 30s from writing multiple times.
 */

const SEARCH_QUERIES_COLLECTION = 'searchQueries';

// Session deduplication map to prevent repeated submits within 30s
const recentlyRecordedQueries = new Map<string, number>();

/**
 * Record a search ONLY when committed (Enter, click suggestion, search submit)
 */
export const recordCommittedSearch = async (rawQuery: string): Promise<void> => {
  const clean = rawQuery.trim();
  if (!clean || clean.length < 2 || clean.length > 80) return;

  const normalized = clean.toLowerCase().replace(/\s+/g, ' ');

  // 30-second cooldown per unique normalized query per session
  const now = Date.now();
  const lastTime = recentlyRecordedQueries.get(normalized);
  if (lastTime && now - lastTime < 30000) {
    return;
  }
  recentlyRecordedQueries.set(normalized, now);

  const db = getFirebaseDb();
  if (!db) return;

  // Safe document ID adhering to ^[a-zA-Z0-9_\-]+$
  const safeDocId = 'sq_' + normalized.replace(/[^a-z0-9]/g, '_').slice(0, 80);

  try {
    const docRef = doc(db, SEARCH_QUERIES_COLLECTION, safeDocId);
    await setDoc(
      docRef,
      {
        query: clean,
        normalizedQuery: normalized,
        searchCount: increment(1),
        lastSearchedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err) {
    // Non-blocking background analytics error handling
    console.warn('Search query analytics recording skipped or non-blocking error:', err);
  }
};

/**
 * Fetch real popular searches from aggregate Firestore counters.
 * Returns empty array if no real search data exists yet.
 */
export const fetchRealPopularSearches = async (limitCount: number = 6): Promise<string[]> => {
  const db = getFirebaseDb();
  if (!db) return [];

  try {
    const q = query(
      collection(db, SEARCH_QUERIES_COLLECTION),
      orderBy('searchCount', 'desc'),
      limit(limitCount)
    );
    const snap = await getDocs(q);
    const results: string[] = [];
    snap.forEach(docSnap => {
      const data = docSnap.data();
      if (data && data.query && typeof data.searchCount === 'number' && data.searchCount >= 1) {
        results.push(data.query);
      }
    });
    return results;
  } catch (err) {
    console.warn('Fetch real popular searches fallback:', err);
    return [];
  }
};
