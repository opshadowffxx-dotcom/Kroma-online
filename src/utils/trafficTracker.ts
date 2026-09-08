/**
 * Traffic, Device, and Geo tracking utilities for visual discovery view analytics.
 */

export type DeviceType = 'mobile' | 'tablet' | 'desktop';
export type TrafficSource = 'Direct' | 'Pinterest' | 'Google' | 'Instagram' | 'Facebook' | 'Other';

export interface GeoLocationInfo {
  country_code: string;
  country_name: string;
}

export interface ViewTrackingData {
  device: DeviceType;
  source: TrafficSource;
  geo: GeoLocationInfo | null;
  timestamp?: number;
}

/**
 * Categorize device type from userAgent with modern iPadOS touch detection
 */
export const detectDeviceType = (): DeviceType => {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = (navigator.userAgent || navigator.vendor || (window as any).opera || '').toLowerCase();

  // Modern iPadOS masquerades as Macintosh desktop userAgent but has multi-touch
  if (
    navigator.platform === 'MacIntel' &&
    navigator.maxTouchPoints &&
    navigator.maxTouchPoints > 1 &&
    !ua.includes('iphone')
  ) {
    return 'tablet';
  }

  // Tablet check
  if (
    /(ipad|tablet|(android(?!.*mobile))|(windows(?!.*phone)(.*touch))|kindle|playbook|silk)/i.test(ua)
  ) {
    return 'tablet';
  }

  // Mobile check
  if (
    /(mobi|ipod|iphone|android.*mobile|blackberry|opera mini|fennec|minimo|symbian|psp|nintendo)/i.test(
      ua
    )
  ) {
    return 'mobile';
  }

  return 'desktop';
};

/**
 * Categorize traffic source from document.referrer or utm_source query parameter
 */
export const detectTrafficSource = (): TrafficSource => {
  // Check for campaign query param if present on current landing URL
  if (typeof window !== 'undefined' && window.location?.search) {
    try {
      const params = new URLSearchParams(window.location.search);
      const utm = (params.get('utm_source') || '').toLowerCase();
      if (utm.includes('pinterest')) return 'Pinterest';
      if (utm.includes('google')) return 'Google';
      if (utm.includes('instagram')) return 'Instagram';
      if (utm.includes('facebook') || utm.includes('fb')) return 'Facebook';
    } catch {
      // Ignore parsing errors
    }
  }

  if (typeof document === 'undefined' || !document.referrer) {
    return 'Direct';
  }

  try {
    const refUrl = new URL(document.referrer);
    const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';

    if (!refUrl.hostname || refUrl.hostname === currentHost) {
      return 'Direct';
    }

    const host = refUrl.hostname.toLowerCase();
    if (host.includes('pinterest')) return 'Pinterest';
    if (host.includes('google')) return 'Google';
    if (host.includes('instagram')) return 'Instagram';
    if (host.includes('facebook') || host.includes('fb.com') || host.includes('fb.me')) return 'Facebook';

    return 'Other';
  } catch {
    return 'Other';
  }
};

// Memory & Session Storage cache for Geo Lookup
let sessionGeoCache: GeoLocationInfo | null = null;

/**
 * Privacy-safe viewer geo resolver.
 * With GA4 handling automatic geographic derivation without storing raw IPs,
 * client-side IP lookup calls to public APIs (ipapi.co / api.country.is) are retired.
 */
export const getViewerGeo = async (): Promise<GeoLocationInfo | null> => {
  if (sessionGeoCache) return sessionGeoCache;
  return null;
};

/**
 * Normalizes any device string (e.g. 'desktop', 'Desktop', 'mobile', 'Mobile')
 * into canonical lowercase key ('desktop' | 'mobile' | 'tablet' | 'other')
 */
export const normalizeDeviceKey = (rawKey: string): DeviceType | 'other' => {
  const lower = (rawKey || '').toLowerCase().trim();
  if (lower === 'desktop') return 'desktop';
  if (lower === 'mobile') return 'mobile';
  if (lower === 'tablet') return 'tablet';
  return 'other';
};

/**
 * Normalizes device count maps with mixed or legacy keys into a clean, canonical breakdown
 */
export const extractCanonicalDeviceCounts = (
  raw?: Record<string, number | undefined>
): { desktop: number; mobile: number; tablet: number; total: number } => {
  if (!raw) return { desktop: 0, mobile: 0, tablet: 0, total: 0 };
  let desktop = 0;
  let mobile = 0;
  let tablet = 0;

  for (const [k, v] of Object.entries(raw)) {
    const count = typeof v === 'number' && !isNaN(v) && v > 0 ? v : 0;
    const norm = normalizeDeviceKey(k);
    if (norm === 'desktop') desktop += count;
    else if (norm === 'mobile') mobile += count;
    else if (norm === 'tablet') tablet += count;
  }

  return { desktop, mobile, tablet, total: desktop + mobile + tablet };
};

/**
 * Helper to convert 2-letter ISO country code to flag emoji
 */
export const getCountryFlagEmoji = (countryCode: string): string => {
  if (!countryCode || typeof countryCode !== 'string' || countryCode.length !== 2) return '🌐';
  const upper = countryCode.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return '🌐';
  const codePoints = [...upper].map(c => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
};

// Fallback dictionary for common countries if Intl.DisplayNames is not supported
const COMMON_COUNTRY_NAMES: Record<string, string> = {
  US: 'United States',
  GB: 'United Kingdom',
  CA: 'Canada',
  DE: 'Germany',
  FR: 'France',
  JP: 'Japan',
  AU: 'Australia',
  BR: 'Brazil',
  IN: 'India',
  ES: 'Spain',
  IT: 'Italy',
  NL: 'Netherlands',
  SE: 'Sweden',
  KR: 'South Korea',
  SG: 'Singapore',
  MX: 'Mexico',
  PL: 'Poland',
  ID: 'Indonesia',
  TR: 'Turkey',
  ZA: 'South Africa',
};

/**
 * Format 2-letter ISO country code into full localized country name
 */
export const getCountryDisplayName = (countryCode: string): string => {
  if (!countryCode) return 'Unknown Region';
  const upper = countryCode.toUpperCase().trim();
  try {
    if (typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function') {
      const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
      const name = regionNames.of(upper);
      if (name) return name;
    }
  } catch {
    // Fall back to dictionary
  }
  return COMMON_COUNTRY_NAMES[upper] || upper;
};

/**
 * Collect all view metadata bundled for zero-extra-overhead writes
 */
export const collectViewTrackingData = async (): Promise<ViewTrackingData> => {
  const device = detectDeviceType();
  const source = detectTrafficSource();
  let geo: GeoLocationInfo | null = null;

  try {
    geo = await getViewerGeo();
  } catch {
    geo = null;
  }

  return { device, source, geo };
};
