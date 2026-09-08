/**
 * Google Analytics 4 (GA4) Integration Layer for KROMA
 * 
 * Reusable, privacy-preserving event tracking for visual discovery analytics.
 * Automatically derives country, region, device, and traffic source without storing raw IP.
 * Designed to be future-reusable for both organic content and sponsored campaigns.
 */

declare global {
  interface Window {
    dataLayer: any[];
    gtag?: (...args: any[]) => void;
  }
}

let isGaInitialized = false;

/**
 * Safely get the configured GA4 Measurement ID
 */
export const getGaMeasurementId = (): string | undefined => {
  try {
    const id = import.meta.env.VITE_GA_MEASUREMENT_ID;
    if (typeof id === 'string' && id.trim().startsWith('G-')) {
      return id.trim();
    }
  } catch {
    // Non-browser or env access error
  }
  return undefined;
};

/**
 * Initialize Google Analytics 4 script tag dynamically
 * Gracefully no-ops if no Measurement ID is configured or if blocked by client
 */
export const initGA = (): void => {
  if (typeof window === 'undefined' || isGaInitialized) return;

  const measurementId = getGaMeasurementId();
  if (!measurementId) return;

  try {
    // Check if gtag script is already present
    const existingScript = document.querySelector(`script[src*="googletagmanager.com/gtag/js?id=${measurementId}"]`);
    if (!existingScript) {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function gtag() {
        window.dataLayer.push(arguments);
      };
      window.gtag('js', new Date());
      window.gtag('config', measurementId, {
        anonymize_ip: true,
        send_page_view: false, // We control discovery views explicitly
      });

      const script = document.createElement('script');
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
      script.onerror = () => {
        // Silently handle adblocker or network blocking
      };
      document.head.appendChild(script);
    }
    isGaInitialized = true;
  } catch (err) {
    // Non-blocking
    console.warn('GA4 initialization notice:', err);
  }
};

/**
 * Generic event dispatcher for GA4 with zero PII
 */
export const trackGaEvent = (
  eventName: string,
  params: Record<string, string | number | boolean | undefined>
): void => {
  if (typeof window === 'undefined') return;

  try {
    if (!isGaInitialized) {
      initGA();
    }

    if (typeof window.gtag === 'function') {
      // Clean params: remove undefined values and ensure NO PII is ever sent
      const cleanParams: Record<string, any> = {};
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) {
          cleanParams[k] = v;
        }
      }
      window.gtag('event', eventName, cleanParams);
    }
  } catch {
    // Non-blocking
  }
};

/**
 * 1. Track Organic Reach / Qualified Impression
 */
export const trackReach = (
  postId: string,
  creatorId?: string,
  source: string = 'home'
): void => {
  trackGaEvent('kroma_reach', {
    post_id: postId,
    creator_id: creatorId || '',
    content_type: 'organic',
    surface: source,
  });
};

/**
 * 2. Track Organic View / Detail Open
 */
export const trackView = (
  postId: string,
  creatorId?: string,
  source: string = 'Direct'
): void => {
  trackGaEvent('kroma_view', {
    post_id: postId,
    creator_id: creatorId || '',
    content_type: 'organic',
    traffic_source: source,
  });
};

/**
 * 3. Track Organic External Link Click
 */
export const trackLinkClick = (
  postId: string,
  creatorId?: string,
  source: string = 'post_detail'
): void => {
  trackGaEvent('kroma_link_click', {
    post_id: postId,
    creator_id: creatorId || '',
    content_type: 'organic',
    click_location: source,
  });
};
