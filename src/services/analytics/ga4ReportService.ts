/**
 * Client service to query server-side GA4 Combined Breakdowns Analytics.
 * Protects credentials by only talking to /api/analytics/breakdowns.
 * Persists one complete response per authenticated user, target, and UTC day.
 */

import { onAuthStateChanged } from 'firebase/auth';
import { getFirebaseAuth } from '../firebase/index';

export interface GA4GeoCountry {
  code: string;
  name: string;
  flag: string;
  count: number;
  pct: number;
}

export interface GA4DeviceItem {
  name: string;
  count: number;
  pct: number;
  device: 'desktop' | 'mobile' | 'tablet';
}

export interface GA4DeviceBreakdown {
  desktop: number;
  mobile: number;
  tablet: number;
  total: number;
  desktopPct: number;
  mobilePct: number;
  tabletPct: number;
  list: GA4DeviceItem[];
}

export interface GA4TrafficSource {
  name: string;
  count: number;
  pct: number;
}

export interface GA4DiscoverySurface {
  key: string;
  name: string;
  count: number;
  pct: number;
}

export type GA4TimeRange = '7d' | '30d' | '90d' | 'all';

export interface GA4RangeBreakdown {
  totalReach: number;
  countries: GA4GeoCountry[];
  devices: GA4DeviceBreakdown;
  sources: GA4TrafficSource[];
  surfaces: GA4DiscoverySurface[];
  // Legacy backward compatibility
  data: GA4GeoCountry[];
  total: number;
}

export interface GA4BreakdownsReport extends GA4RangeBreakdown {
  configured: boolean;
  utcDate: string;
  analyticsStartDate: string;
  ranges: Record<GA4TimeRange, GA4RangeBreakdown>;
  cached: boolean;
  message?: string;
  updatedAt?: string;
}

export type GA4GeoReport = GA4BreakdownsReport;

interface PersistentCacheEntry {
  version: 2;
  uid: string;
  targetKey: string;
  utcDate: string;
  report: GA4BreakdownsReport;
}

const CLIENT_CACHE_PREFIX = 'kroma:creator-analytics:ga4:v2:';
const clientBreakdownsCache = new Map<string, GA4BreakdownsReport>();
const inFlightBreakdownsRequests = new Map<string, Promise<GA4BreakdownsReport>>();
let cacheGeneration = 0;
let observedAuthenticatedUid: string | null | undefined;

function getCurrentUtcDateString(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const emptyDeviceBreakdown = (): GA4DeviceBreakdown => ({
  desktop: 0,
  mobile: 0,
  tablet: 0,
  total: 0,
  desktopPct: 0,
  mobilePct: 0,
  tabletPct: 0,
  list: [
    { name: 'Desktop', count: 0, pct: 0, device: 'desktop' },
    { name: 'Mobile', count: 0, pct: 0, device: 'mobile' },
    { name: 'Tablet', count: 0, pct: 0, device: 'tablet' },
  ],
});

const emptyRangeBreakdown = (): GA4RangeBreakdown => ({
  totalReach: 0,
  countries: [],
  devices: emptyDeviceBreakdown(),
  sources: [],
  surfaces: [],
  data: [],
  total: 0,
});

function createEmptyRanges(): Record<GA4TimeRange, GA4RangeBreakdown> {
  return {
    '7d': emptyRangeBreakdown(),
    '30d': emptyRangeBreakdown(),
    '90d': emptyRangeBreakdown(),
    all: emptyRangeBreakdown(),
  };
}

function createUnavailableReport(utcDate: string, message: string): GA4BreakdownsReport {
  const ranges = createEmptyRanges();
  return {
    configured: false,
    utcDate,
    analyticsStartDate: '',
    ranges,
    ...ranges['30d'],
    cached: false,
    message,
  };
}

function buildTargetKey(options: { creatorId?: string; postId?: string }): string {
  if (options.postId) return `post_${options.postId}`;
  if (options.creatorId) return `creator_${options.creatorId}`;
  return 'all';
}

function buildPersistentCacheKey(uid: string, targetKey: string, utcDate: string): string {
  return `${CLIENT_CACHE_PREFIX}${encodeURIComponent(uid)}:${encodeURIComponent(targetKey)}:${utcDate}`;
}

function isRangeBreakdown(value: unknown): value is GA4RangeBreakdown {
  if (!value || typeof value !== 'object') return false;
  const range = value as Partial<GA4RangeBreakdown>;
  return (
    typeof range.totalReach === 'number' &&
    Array.isArray(range.countries) &&
    Boolean(range.devices && typeof range.devices.total === 'number' && Array.isArray(range.devices.list)) &&
    Array.isArray(range.sources) &&
    Array.isArray(range.surfaces) &&
    Array.isArray(range.data) &&
    typeof range.total === 'number'
  );
}

function isCompleteDailyReport(value: unknown, utcDate: string): value is GA4BreakdownsReport {
  if (!value || typeof value !== 'object') return false;
  const report = value as Partial<GA4BreakdownsReport>;
  const ranges = report.ranges;
  return (
    report.utcDate === utcDate &&
    typeof report.configured === 'boolean' &&
    typeof report.analyticsStartDate === 'string' &&
    Boolean(
      ranges &&
      isRangeBreakdown(ranges['7d']) &&
      isRangeBreakdown(ranges['30d']) &&
      isRangeBreakdown(ranges['90d']) &&
      isRangeBreakdown(ranges.all)
    )
  );
}

function isCacheableDailyReport(value: unknown, utcDate: string): value is GA4BreakdownsReport {
  return isCompleteDailyReport(value, utcDate) && value.configured && !value.message;
}

function clearCreatorAnalyticsBrowserCache(): void {
  cacheGeneration += 1;
  clientBreakdownsCache.clear();
  inFlightBreakdownsRequests.clear();

  if (typeof window === 'undefined') return;
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(CLIENT_CACHE_PREFIX)) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // Persistent storage can be unavailable in private/restricted browser modes.
  }
}

function pruneStaleEntriesForUid(uid: string, currentUtcDate: string): void {
  if (typeof window === 'undefined') return;
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(CLIENT_CACHE_PREFIX)) continue;

      try {
        const entry = JSON.parse(window.localStorage.getItem(key) || '') as Partial<PersistentCacheEntry>;
        if (entry.uid === uid && entry.utcDate !== currentUtcDate) {
          window.localStorage.removeItem(key);
        }
      } catch {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // Best-effort cleanup only.
  }
}

function readPersistentReport(
  cacheKey: string,
  uid: string,
  targetKey: string,
  utcDate: string
): GA4BreakdownsReport | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(cacheKey);
    if (!raw) return null;
    const entry = JSON.parse(raw) as PersistentCacheEntry;
    if (
      entry.version !== 2 ||
      entry.uid !== uid ||
      entry.targetKey !== targetKey ||
      entry.utcDate !== utcDate ||
      !isCacheableDailyReport(entry.report, utcDate)
    ) {
      window.localStorage.removeItem(cacheKey);
      return null;
    }
    return entry.report;
  } catch {
    try {
      window.localStorage.removeItem(cacheKey);
    } catch {
      // Ignore storage cleanup errors.
    }
    return null;
  }
}

function persistReport(
  cacheKey: string,
  uid: string,
  targetKey: string,
  utcDate: string,
  report: GA4BreakdownsReport
): void {
  if (typeof window === 'undefined') return;
  const entry: PersistentCacheEntry = {
    version: 2,
    uid,
    targetKey,
    utcDate,
    report,
  };
  try {
    window.localStorage.setItem(cacheKey, JSON.stringify(entry));
  } catch {
    // The in-memory cache still deduplicates this page session if storage is unavailable/full.
  }
}

async function withCrossTabLock<T>(cacheKey: string, task: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request(`ga4-daily:${cacheKey}`, task);
  }
  return task();
}

function initializeAuthCacheIsolation(): void {
  if (typeof window === 'undefined') return;
  try {
    const auth = getFirebaseAuth();
    if (!auth) return;
    onAuthStateChanged(auth, user => {
      const nextUid = user && !user.isAnonymous ? user.uid : null;
      if (observedAuthenticatedUid !== undefined && observedAuthenticatedUid !== nextUid) {
        clearCreatorAnalyticsBrowserCache();
      }
      observedAuthenticatedUid = nextUid;
    });
  } catch {
    // Authentication is checked again before every analytics request.
  }
}

initializeAuthCacheIsolation();

/**
 * Selects one already-fetched range. This function never performs I/O.
 */
export function selectGA4BreakdownsRange(
  report: GA4BreakdownsReport,
  range: GA4TimeRange
): GA4RangeBreakdown {
  return report.ranges[range];
}

/**
 * Fetches all supported GA4 ranges in one batched server request. The successful
 * response is reused for this UID + creator/post until the next 00:00 UTC day.
 */
export const fetchBreakdownsFromGA4 = async (options: {
  creatorId?: string;
  postId?: string;
  /** @deprecated Range selection is client-side; retained only for source compatibility. */
  days?: number;
}): Promise<GA4BreakdownsReport> => {
  const currentUtcDate = getCurrentUtcDateString();
  const auth = getFirebaseAuth();
  if (auth && !auth.currentUser) {
    try {
      await auth.authStateReady();
    } catch {
      // The authenticated-user check below remains authoritative.
    }
  }
  const authenticatedUser = auth?.currentUser;

  if (!authenticatedUser || authenticatedUser.isAnonymous) {
    return createUnavailableReport(
      currentUtcDate,
      'Authentication required to access creator analytics.'
    );
  }

  const uid = authenticatedUser.uid;
  if (observedAuthenticatedUid !== undefined && observedAuthenticatedUid !== uid) {
    clearCreatorAnalyticsBrowserCache();
  }
  observedAuthenticatedUid = uid;

  const targetKey = buildTargetKey(options);
  const cacheKey = buildPersistentCacheKey(uid, targetKey, currentUtcDate);
  pruneStaleEntriesForUid(uid, currentUtcDate);

  const memoryCached = clientBreakdownsCache.get(cacheKey);
  if (memoryCached && isCacheableDailyReport(memoryCached, currentUtcDate)) {
    return memoryCached;
  }

  const persistentCached = readPersistentReport(cacheKey, uid, targetKey, currentUtcDate);
  if (persistentCached) {
    clientBreakdownsCache.set(cacheKey, persistentCached);
    return persistentCached;
  }

  const alreadyInFlight = inFlightBreakdownsRequests.get(cacheKey);
  if (alreadyInFlight) return alreadyInFlight;

  const requestGeneration = cacheGeneration;
  const requestPromise = withCrossTabLock(cacheKey, async () => {
    // Another tab may have completed the same daily request while this tab waited for the lock.
    const afterLockMemory = clientBreakdownsCache.get(cacheKey);
    if (afterLockMemory && isCacheableDailyReport(afterLockMemory, currentUtcDate)) {
      return afterLockMemory;
    }
    const afterLockPersistent = readPersistentReport(cacheKey, uid, targetKey, currentUtcDate);
    if (afterLockPersistent) {
      clientBreakdownsCache.set(cacheKey, afterLockPersistent);
      return afterLockPersistent;
    }

    const activeUser = getFirebaseAuth()?.currentUser;
    if (!activeUser || activeUser.isAnonymous || activeUser.uid !== uid) {
      return createUnavailableReport(
        currentUtcDate,
        'Authentication changed before creator analytics could be loaded.'
      );
    }

    const idToken = await activeUser.getIdToken();
    const params = new URLSearchParams();
    if (options.creatorId) params.append('creatorId', options.creatorId);
    if (options.postId) params.append('postId', options.postId);
    // Date changes the URL at 00:00 UTC; the server remains authoritative for its own UTC day.
    params.append('utcDate', currentUtcDate);

    const endpoint = `/api/analytics/breakdowns?${params.toString()}`;
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${idToken}` },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to fetch GA4 breakdown report`);
    }

    const report: unknown = await response.json();
    if (!isCompleteDailyReport(report, currentUtcDate)) {
      throw new Error('Server returned an incomplete GA4 daily ranges report.');
    }

    const latestUser = getFirebaseAuth()?.currentUser;
    if (
      requestGeneration === cacheGeneration &&
      latestUser &&
      !latestUser.isAnonymous &&
      latestUser.uid === uid &&
      isCacheableDailyReport(report, currentUtcDate)
    ) {
      clientBreakdownsCache.set(cacheKey, report);
      persistReport(cacheKey, uid, targetKey, currentUtcDate, report);
    }

    return report;
  });

  inFlightBreakdownsRequests.set(cacheKey, requestPromise);

  try {
    return await requestPromise;
  } catch (err: any) {
    console.warn('[GA4 Report Service] Could not fetch server-side breakdown report:', err?.message || err);
    return createUnavailableReport(
      currentUtcDate,
      err?.message || 'Unable to connect to GA4 reporting service.'
    );
  } finally {
    if (inFlightBreakdownsRequests.get(cacheKey) === requestPromise) {
      inFlightBreakdownsRequests.delete(cacheKey);
    }
  }
};

/**
 * Backward compatibility helper for countries-only callers.
 */
export const fetchTopCountriesFromGA4 = async (options: {
  creatorId?: string;
  postId?: string;
  days?: number;
}): Promise<GA4BreakdownsReport> => {
  return fetchBreakdownsFromGA4(options);
};
