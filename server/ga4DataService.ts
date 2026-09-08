import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { getCountryDisplayName, getCountryFlagEmoji } from '../src/utils/trafficTracker';
import { getAdminDb } from './firebaseAdmin';

export interface GeoCountryResult {
  code: string;
  name: string;
  flag: string;
  count: number;
  pct: number;
}

export interface DeviceBreakdownResult {
  desktop: number;
  mobile: number;
  tablet: number;
  total: number;
  desktopPct: number;
  mobilePct: number;
  tabletPct: number;
  list: Array<{
    name: string;
    count: number;
    pct: number;
    device: 'desktop' | 'mobile' | 'tablet';
  }>;
}

export interface TrafficSourceResult {
  name: string;
  count: number;
  pct: number;
}

export interface SurfaceResult {
  key: string;
  name: string;
  count: number;
  pct: number;
}

export type GA4RangeKey = '7d' | '30d' | '90d' | 'all';

export interface GA4RangeBreakdownResult {
  totalReach: number;
  countries: GeoCountryResult[];
  devices: DeviceBreakdownResult;
  sources: TrafficSourceResult[];
  surfaces: SurfaceResult[];
  // Backward compatibility fields for legacy country listeners
  data: GeoCountryResult[];
  total: number;
}

export interface GA4BreakdownsReportResponse extends GA4RangeBreakdownResult {
  configured: boolean;
  utcDate: string;
  analyticsStartDate: string;
  ranges: Record<GA4RangeKey, GA4RangeBreakdownResult>;
  cached: boolean;
  message?: string;
  updatedAt?: string;
}

export interface GA4CountriesReportResponse {
  configured: boolean;
  data: GeoCountryResult[];
  total: number;
  cached: boolean;
  message?: string;
  updatedAt?: string;
}

export interface DatedCountryRow {
  date: string;
  code: string;
  name: string;
  count: number;
}

export interface DatedDeviceRow {
  date: string;
  cat: string;
  count: number;
}

export interface DatedSourceRow {
  date: string;
  source: string;
  count: number;
}

export interface DatedSurfaceRow {
  date: string;
  surface: string;
  count: number;
}

export interface RawDailyDataset {
  schemaVersion: 2;
  utcDate: string;
  analyticsStartDate: string;
  timestamp: number;
  datedCountries: DatedCountryRow[];
  datedDevices: DatedDeviceRow[];
  datedSources: DatedSourceRow[];
  datedSurfaces: DatedSurfaceRow[];
}

interface CacheEntry {
  rawDataset: RawDailyDataset;
  utcDate: string;
  timestamp: number;
}

// In-memory cache keyed by target + UTC date
const dailyBreakdownsMemoryCache = new Map<string, CacheEntry>();

// KROMA's fixed analytics epoch. An environment override is supported for deployments
// whose production GA4 property began collecting before this repository snapshot.
const DEFAULT_KROMA_ANALYTICS_START_DATE = '2026-08-01';

let analyticsClient: BetaAnalyticsDataClient | null = null;

function getAnalyticsClient(): BetaAnalyticsDataClient | null {
  const propertyId = process.env.GA4_PROPERTY_ID;
  const clientEmail = process.env.GA4_CLIENT_EMAIL;
  const privateKey = process.env.GA4_PRIVATE_KEY;

  if (!propertyId || !clientEmail || !privateKey) {
    return null;
  }

  if (!analyticsClient) {
    try {
      analyticsClient = new BetaAnalyticsDataClient({
        credentials: {
          client_email: clientEmail,
          private_key: privateKey.replace(/\\n/g, '\n'),
        },
      });
    } catch (err) {
      console.warn('[GA4 Data Service] Failed to initialize Google Analytics client:', err);
      return null;
    }
  }

  return analyticsClient;
}

/**
 * Returns current UTC reporting day string in canonical YYYY-MM-DD format (00:00 UTC boundary)
 */
export function getCurrentUtcReportingDate(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getKromaAnalyticsStartDate(currentUtcDate: string): string {
  const configuredStart = (process.env.GA4_ANALYTICS_START_DATE || '').trim();
  const candidate = /^\d{4}-\d{2}-\d{2}$/.test(configuredStart)
    ? configuredStart
    : DEFAULT_KROMA_ANALYTICS_START_DATE;

  // Never send a future start date to GA4 if a deployment is tested with an older clock.
  return candidate <= currentUtcDate ? candidate : currentUtcDate;
}

/**
 * Builds safe daily cache key for creator or post
 */
export function buildDailyCacheKey(options: {
  creatorId?: string;
  postId?: string;
  days?: number;
  utcDate: string;
}): string {
  const target = options.postId
    ? `post_${options.postId}`
    : options.creatorId
    ? `creator_${options.creatorId}`
    : 'all';
  return `ga4_daily_ranges_v2_${target}_${options.utcDate}`;
}

const emptyDeviceBreakdown = (): DeviceBreakdownResult => ({
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

const emptyRangeBreakdown = (): GA4RangeBreakdownResult => ({
  totalReach: 0,
  countries: [],
  devices: emptyDeviceBreakdown(),
  sources: [],
  surfaces: [],
  data: [],
  total: 0,
});

function createEmptyRanges(): Record<GA4RangeKey, GA4RangeBreakdownResult> {
  return {
    '7d': emptyRangeBreakdown(),
    '30d': emptyRangeBreakdown(),
    '90d': emptyRangeBreakdown(),
    all: emptyRangeBreakdown(),
  };
}

function rangeKeyForDays(days?: number): GA4RangeKey {
  if (days && days <= 7) return '7d';
  if (days && days <= 30) return '30d';
  if (days && days <= 90) return '90d';
  if (days && days > 90) return 'all';
  return '30d';
}

function formatSourceName(raw: string): string {
  const lower = (raw || '').toLowerCase().trim();
  if (!lower || lower === '(direct)' || lower === 'direct') return 'Direct Discovery';
  if (lower === '(not set)') return 'Platform Feed';
  if (lower.includes('google')) return 'Google Search';
  if (lower.includes('pinterest')) return 'Pinterest';
  if (lower.includes('instagram')) return 'Instagram';
  if (lower.includes('facebook') || lower.includes('fb')) return 'Facebook';
  if (lower.includes('twitter') || lower.includes('t.co') || lower.includes('x.com')) return 'X (Twitter)';
  if (lower.includes('linkedin')) return 'LinkedIn';
  if (lower.includes('reddit')) return 'Reddit';
  if (lower.includes('youtube')) return 'YouTube';
  if (lower.includes('search')) return 'Search Discovery';
  if (lower.includes('home')) return 'Home Feed';
  if (lower.includes('profile')) return 'Creator Portfolio';
  if (lower.includes('related')) return 'Related Visuals';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/**
 * Calculates cutoff date string in YYYYMMDD format (inclusive boundary)
 */
function getCutoffDateYYYYMMDD(utcDateStr: string, days: number): string {
  const safeDays = days > 0 ? days : 30;
  const d = new Date(`${utcDateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (safeDays - 1));
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Aggregates the one daily, launch-to-today dataset for a supported range.
 * An undefined `days` value means the complete dataset (All).
 */
function aggregateDatedData(
  rawDataset: RawDailyDataset,
  days: number | undefined,
  currentUtcDate: string
): GA4RangeBreakdownResult {
  const cutoffYYYYMMDD = days ? getCutoffDateYYYYMMDD(currentUtcDate, days) : undefined;
  const isIncludedDate = (date: string): boolean => !cutoffYYYYMMDD || date >= cutoffYYYYMMDD;

  // 1. Process Countries
  const countryMap = new Map<string, { name: string; count: number }>();
  let totalCountryCount = 0;

  for (const row of rawDataset.datedCountries || []) {
    if (isIncludedDate(row.date) && row.count > 0 && row.code && row.code !== '(not set)') {
      const codeUpper = row.code.toUpperCase();
      const existing = countryMap.get(codeUpper);
      if (existing) {
        existing.count += row.count;
      } else {
        countryMap.set(codeUpper, {
          name: row.name || getCountryDisplayName(row.code),
          count: row.count,
        });
      }
      totalCountryCount += row.count;
    }
  }

  const countryList: GeoCountryResult[] = Array.from(countryMap.entries())
    .map(([code, item]) => ({
      code,
      name: item.name,
      flag: getCountryFlagEmoji(code),
      count: item.count,
      pct: totalCountryCount > 0 ? Math.round((item.count / totalCountryCount) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // 2. Process Devices
  let desktop = 0;
  let mobile = 0;
  let tablet = 0;

  for (const row of rawDataset.datedDevices || []) {
    if (isIncludedDate(row.date) && row.count > 0) {
      const cat = (row.cat || '').toLowerCase().trim();
      if (cat === 'desktop') desktop += row.count;
      else if (cat === 'mobile') mobile += row.count;
      else if (cat === 'tablet') tablet += row.count;
      else if (cat) desktop += row.count;
    }
  }

  const deviceTotal = desktop + mobile + tablet;
  const desktopPct = deviceTotal > 0 ? Math.round((desktop / deviceTotal) * 100) : 0;
  const mobilePct = deviceTotal > 0 ? Math.round((mobile / deviceTotal) * 100) : 0;
  const tabletPct = deviceTotal > 0 ? Math.round((tablet / deviceTotal) * 100) : 0;

  const devices: DeviceBreakdownResult = {
    desktop,
    mobile,
    tablet,
    total: deviceTotal,
    desktopPct,
    mobilePct,
    tabletPct,
    list: [
      { name: 'Desktop', count: desktop, pct: desktopPct, device: 'desktop' as const },
      { name: 'Mobile', count: mobile, pct: mobilePct, device: 'mobile' as const },
      { name: 'Tablet', count: tablet, pct: tabletPct, device: 'tablet' as const },
    ].sort((a, b) => b.count - a.count),
  };

  // 3. Process Traffic Sources
  const sourceMap = new Map<string, number>();
  let totalSourceCount = 0;

  for (const row of rawDataset.datedSources || []) {
    if (isIncludedDate(row.date) && row.count > 0) {
      const formatted = formatSourceName(row.source);
      sourceMap.set(formatted, (sourceMap.get(formatted) || 0) + row.count);
      totalSourceCount += row.count;
    }
  }

  const sources: TrafficSourceResult[] = Array.from(sourceMap.entries())
    .map(([name, count]) => ({
      name,
      count,
      pct: totalSourceCount > 0 ? Math.round((count / totalSourceCount) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // 4. Process Discovery Surfaces
  const surfaceMap = new Map<string, number>();
  let totalSurfaceCount = 0;

  for (const row of rawDataset.datedSurfaces || []) {
    if (isIncludedDate(row.date) && row.count > 0 && row.surface && row.surface !== '(not set)') {
      surfaceMap.set(row.surface, (surfaceMap.get(row.surface) || 0) + row.count);
      totalSurfaceCount += row.count;
    }
  }

  const formatSurfaceName = (key: string): string => {
    const lower = (key || '').toLowerCase().trim();
    switch (lower) {
      case 'home': return 'Home Feed';
      case 'search': return 'Search Discovery';
      case 'related': return 'Related Visuals';
      case 'profile': return 'Creator Portfolio';
      case 'collection': return 'Saved Collections';
      default: return key.charAt(0).toUpperCase() + key.slice(1);
    }
  };

  const surfaces: SurfaceResult[] = Array.from(surfaceMap.entries())
    .map(([key, count]) => ({
      key,
      name: formatSurfaceName(key),
      count,
      pct: totalSurfaceCount > 0 ? Math.round((count / totalSurfaceCount) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const totalReach = Math.max(totalCountryCount, deviceTotal, totalSourceCount, totalSurfaceCount);

  return {
    totalReach,
    countries: countryList,
    devices,
    sources,
    surfaces,
    data: countryList,
    total: totalCountryCount,
  };
}

function buildCombinedBreakdownsResponse(
  rawDataset: RawDailyDataset,
  currentUtcDate: string,
  cached: boolean,
  preferredDays?: number
): GA4BreakdownsReportResponse {
  const ranges: Record<GA4RangeKey, GA4RangeBreakdownResult> = {
    '7d': aggregateDatedData(rawDataset, 7, currentUtcDate),
    '30d': aggregateDatedData(rawDataset, 30, currentUtcDate),
    '90d': aggregateDatedData(rawDataset, 90, currentUtcDate),
    all: aggregateDatedData(rawDataset, undefined, currentUtcDate),
  };
  const selectedRange = ranges[rangeKeyForDays(preferredDays)];

  return {
    configured: true,
    utcDate: currentUtcDate,
    analyticsStartDate: rawDataset.analyticsStartDate,
    ranges,
    ...selectedRange,
    cached,
    updatedAt: new Date(rawDataset.timestamp).toISOString(),
  };
}

/**
 * Retrieves combined GA4 breakdown report (Countries, Devices, Traffic Sources, Discovery Surfaces) in a single daily batch.
 * Refreshes only once per UTC day (00:00 UTC boundary).
 */
export async function fetchGA4CombinedBreakdowns(options: {
  creatorId?: string;
  postId?: string;
  days?: number;
}): Promise<GA4BreakdownsReportResponse> {
  const propertyId = process.env.GA4_PROPERTY_ID;
  const client = getAnalyticsClient();
  const currentUtcDate = getCurrentUtcReportingDate();
  const days = options.days && options.days > 0 ? options.days : 30;
  const analyticsStartDate = getKromaAnalyticsStartDate(currentUtcDate);
  const cacheKey = buildDailyCacheKey({
    creatorId: options.creatorId,
    postId: options.postId,
    utcDate: currentUtcDate,
  });

  if (!client || !propertyId) {
    return {
      configured: false,
      analyticsStartDate,
      ranges: createEmptyRanges(),
      totalReach: 0,
      utcDate: currentUtcDate,
      countries: [],
      devices: emptyDeviceBreakdown(),
      sources: [],
      surfaces: [],
      data: [],
      total: 0,
      cached: false,
      message: 'GA4 Data API credentials (GA4_PROPERTY_ID, GA4_CLIENT_EMAIL, GA4_PRIVATE_KEY) not configured on server.',
    };
  }

  // 1. Check in-memory daily cache (00:00 UTC reset)
  const memoryCached = dailyBreakdownsMemoryCache.get(cacheKey);
  if (
    memoryCached &&
    memoryCached.utcDate === currentUtcDate &&
    memoryCached.rawDataset.schemaVersion === 2 &&
    memoryCached.rawDataset.analyticsStartDate === analyticsStartDate
  ) {
    return buildCombinedBreakdownsResponse(memoryCached.rawDataset, currentUtcDate, true, days);
  }

  const adminDb = getAdminDb();
  const cacheDocRef = adminDb ? adminDb.collection('analyticsDailyGa4Cache').doc(cacheKey) : null;
  const lockDocRef = adminDb ? adminDb.collection('analyticsDailyGa4Cache').doc(`lock_${cacheKey}`) : null;

  // Helper function to attempt cache lookup or lock acquisition inside a single Firestore transaction
  const attemptTransaction = async (): Promise<
    | { status: 'cached'; rawDataset: RawDailyDataset }
    | { status: 'locked' }
    | { status: 'acquired' }
  > => {
    if (!adminDb || !cacheDocRef || !lockDocRef) return { status: 'acquired' };

    return await adminDb.runTransaction(async (transaction) => {
      // a) Read today's cache doc
      const cacheDoc = await transaction.get(cacheDocRef);
      if (cacheDoc.exists) {
        const data = cacheDoc.data() as RawDailyDataset;
        if (
          data &&
          data.schemaVersion === 2 &&
          data.utcDate === currentUtcDate &&
          data.analyticsStartDate === analyticsStartDate
        ) {
          return { status: 'cached', rawDataset: data };
        }
      }

      // b) Read today's lock doc
      const lockDoc = await transaction.get(lockDocRef);
      const nowTime = Date.now();
      if (lockDoc.exists) {
        const lockData = lockDoc.data();
        const lockTime = lockData?.lockTime || 0;
        const lockUtc = lockData?.utcDate;
        const isFresh = (nowTime - lockTime) < 45000 && lockUtc === currentUtcDate;
        if (isFresh) {
          return { status: 'locked' };
        }
      }

      // c) Write lock doc inside the same transaction
      transaction.set(lockDocRef, { lockTime: nowTime, utcDate: currentUtcDate });
      return { status: 'acquired' };
    });
  };

  let txResult = await attemptTransaction();

  // Handle cached status returned from transaction
  if (txResult.status === 'cached') {
    dailyBreakdownsMemoryCache.set(cacheKey, {
      rawDataset: txResult.rawDataset,
      utcDate: currentUtcDate,
      timestamp: txResult.rawDataset.timestamp || Date.now(),
    });
    return buildCombinedBreakdownsResponse(txResult.rawDataset, currentUtcDate, true, days);
  }

  // Handle locked status returned from transaction
  if (txResult.status === 'locked') {
    // Poll the cache doc only (not the lock) every ~1 second for up to ~10 seconds
    for (let i = 0; i < 10; i++) {
      await new Promise(res => setTimeout(res, 1000));
      if (cacheDocRef) {
        const cacheDoc = await cacheDocRef.get();
        if (cacheDoc.exists) {
          const data = cacheDoc.data() as RawDailyDataset;
          if (
            data &&
            data.schemaVersion === 2 &&
            data.utcDate === currentUtcDate &&
            data.analyticsStartDate === analyticsStartDate
          ) {
            dailyBreakdownsMemoryCache.set(cacheKey, {
              rawDataset: data,
              utcDate: currentUtcDate,
              timestamp: data.timestamp || Date.now(),
            });
            return buildCombinedBreakdownsResponse(data, currentUtcDate, true, days);
          }
        }
      }
    }

    // If still hasn't appeared after 10 seconds, retry the SAME transaction ONCE
    const retryResult = await attemptTransaction();
    if (retryResult.status === 'cached') {
      dailyBreakdownsMemoryCache.set(cacheKey, {
        rawDataset: retryResult.rawDataset,
        utcDate: currentUtcDate,
        timestamp: retryResult.rawDataset.timestamp || Date.now(),
      });
      return buildCombinedBreakdownsResponse(retryResult.rawDataset, currentUtcDate, true, days);
    } else if (retryResult.status === 'acquired') {
      txResult = retryResult; // Lock is now acquired, proceed to GA4 call below
    } else {
      // Still locked after retry. MUST NOT call GA4.
      return {
        configured: true,
        analyticsStartDate,
        ranges: createEmptyRanges(),
        totalReach: 0,
        utcDate: currentUtcDate,
        countries: [],
        devices: emptyDeviceBreakdown(),
        sources: [],
        surfaces: [],
        data: [],
        total: 0,
        cached: false,
        message: 'GA4 report generation in progress by another request.',
      };
    }
  }

  // 4. At this point, txResult.status MUST be 'acquired'. Fetch the single
  // launch-to-today dated dataset from which every supported range is derived.
  try {
    const expressions: any[] = [
      {
        filter: {
          fieldName: 'eventName',
          stringFilter: {
            value: 'kroma_reach',
            matchType: 'EXACT',
          },
        },
      },
    ];

    if (options.postId) {
      expressions.push({
        filter: {
          fieldName: 'customEvent:post_id',
          stringFilter: {
            value: options.postId,
            matchType: 'EXACT',
          },
        },
      });
    } else if (options.creatorId) {
      expressions.push({
        filter: {
          fieldName: 'customEvent:creator_id',
          stringFilter: {
            value: options.creatorId,
            matchType: 'EXACT',
          },
        },
      });
    }

    const dateRange = [{ startDate: analyticsStartDate, endDate: 'today' }];
    const dimensionFilter = { andGroup: { expressions } };

    // Run combined batched query for Countries, Devices, Traffic Sources, and Discovery Surfaces with 'date' dimension
    const [batchResponse] = await client.batchRunReports({
      property: `properties/${propertyId}`,
      requests: [
        // 1. Countries Breakdown
        {
          dateRanges: dateRange,
          dimensions: [{ name: 'date' }, { name: 'countryId' }, { name: 'country' }],
          metrics: [{ name: 'eventCount' }],
          dimensionFilter,
          orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
          limit: 250000,
        },
        // 2. Devices Breakdown
        {
          dateRanges: dateRange,
          dimensions: [{ name: 'date' }, { name: 'deviceCategory' }],
          metrics: [{ name: 'eventCount' }],
          dimensionFilter,
          orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
          limit: 250000,
        },
        // 3. Traffic Sources Breakdown
        {
          dateRanges: dateRange,
          dimensions: [{ name: 'date' }, { name: 'sessionSource' }],
          metrics: [{ name: 'eventCount' }],
          dimensionFilter,
          orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
          limit: 250000,
        },
        // 4. Discovery Surfaces Breakdown
        {
          dateRanges: dateRange,
          dimensions: [{ name: 'date' }, { name: 'customEvent:surface' }],
          metrics: [{ name: 'eventCount' }],
          dimensionFilter,
          orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
          limit: 250000,
        },
      ],
    });

    const reports = batchResponse.reports || [];

    // --- Process Dated Countries ---
    const datedCountries: DatedCountryRow[] = [];
    for (const row of reports[0]?.rows || []) {
      const date = (row.dimensionValues?.[0]?.value || '').trim();
      const code = (row.dimensionValues?.[1]?.value || '').trim();
      const name = (row.dimensionValues?.[2]?.value || '').trim();
      const count = parseInt(row.metricValues?.[0]?.value || '0', 10) || 0;

      if (count > 0 && code && code !== '(not set)' && date) {
        datedCountries.push({ date, code, name, count });
      }
    }

    // --- Process Dated Devices ---
    const datedDevices: DatedDeviceRow[] = [];
    for (const row of reports[1]?.rows || []) {
      const date = (row.dimensionValues?.[0]?.value || '').trim();
      const cat = (row.dimensionValues?.[1]?.value || '').toLowerCase().trim();
      const count = parseInt(row.metricValues?.[0]?.value || '0', 10) || 0;

      if (count > 0 && date) {
        datedDevices.push({ date, cat, count });
      }
    }

    // --- Process Dated Traffic Sources ---
    const datedSources: DatedSourceRow[] = [];
    for (const row of reports[2]?.rows || []) {
      const date = (row.dimensionValues?.[0]?.value || '').trim();
      const source = (row.dimensionValues?.[1]?.value || '').trim();
      const count = parseInt(row.metricValues?.[0]?.value || '0', 10) || 0;

      if (count > 0 && date) {
        datedSources.push({ date, source, count });
      }
    }

    // --- Process Dated Discovery Surfaces ---
    const datedSurfaces: DatedSurfaceRow[] = [];
    for (const row of reports[3]?.rows || []) {
      const date = (row.dimensionValues?.[0]?.value || '').trim();
      const surface = (row.dimensionValues?.[1]?.value || '').trim();
      const count = parseInt(row.metricValues?.[0]?.value || '0', 10) || 0;

      if (count > 0 && date && surface && surface !== '(not set)') {
        datedSurfaces.push({ date, surface, count });
      }
    }

    const now = Date.now();
    const rawDataset: RawDailyDataset = {
      schemaVersion: 2,
      utcDate: currentUtcDate,
      analyticsStartDate,
      timestamp: now,
      datedCountries,
      datedDevices,
      datedSources,
      datedSurfaces,
    };

    // Store in in-memory daily cache
    dailyBreakdownsMemoryCache.set(cacheKey, {
      rawDataset,
      utcDate: currentUtcDate,
      timestamp: now,
    });

    // Store in persistent Firestore Admin cache & release lock
    if (cacheDocRef) {
      try {
        await cacheDocRef.set(rawDataset);
        if (lockDocRef) {
          await lockDocRef.delete().catch(() => {});
        }
      } catch (dbSaveErr) {
        console.warn('[GA4 Data Service] Persistent cache write warning:', dbSaveErr);
      }
    }

    return buildCombinedBreakdownsResponse(rawDataset, currentUtcDate, false, days);
  } catch (err: any) {
    console.error('[GA4 Data API] Error fetching combined breakdowns:', err?.message || err);
    if (lockDocRef) {
      lockDocRef.delete().catch(() => {});
    }
    return {
      configured: true,
      analyticsStartDate,
      ranges: createEmptyRanges(),
      totalReach: 0,
      utcDate: currentUtcDate,
      countries: [],
      devices: emptyDeviceBreakdown(),
      sources: [],
      surfaces: [],
      data: [],
      total: 0,
      cached: false,
      message: err?.message || 'Failed to query GA4 Data API report.',
    };
  }
}

/**
 * Legacy wrapper for Top Countries only (calls combined batch report)
 */
export async function fetchGA4TopCountries(options: {
  creatorId?: string;
  postId?: string;
  days?: number;
}): Promise<GA4CountriesReportResponse> {
  const combined = await fetchGA4CombinedBreakdowns(options);
  return {
    configured: combined.configured,
    data: combined.countries,
    total: combined.total,
    cached: combined.cached,
    message: combined.message,
    updatedAt: combined.updatedAt,
  };
}
