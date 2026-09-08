/**
 * Formats numbers into compact display strings:
 * e.g. 999, 1K, 1.2K, 12.4K, 1M
 */
export function formatCompactNumber(num: number | undefined | null): string {
  if (num === null || num === undefined || isNaN(num) || num <= 0) return '0';
  if (num < 1000) return num.toString();
  if (num < 1000000) {
    const k = num / 1000;
    return k % 1 === 0 ? `${k}K` : `${parseFloat(k.toFixed(1))}K`;
  }
  const m = num / 1000000;
  return m % 1 === 0 ? `${m}M` : `${parseFloat(m.toFixed(1))}M`;
}

/**
 * Formats user account creation timestamp into exact Joined date string:
 * e.g. "August 31, 2026"
 * Prefers exact day if valid timestamp exists, preserves month/year if legacy.
 */
export function formatJoinedDate(createdAt?: string, authCreationTime?: string): string | null {
  const raw = createdAt || authCreationTime;
  if (!raw) return null;

  try {
    const parsed = new Date(raw);
    if (isNaN(parsed.getTime())) {
      // If raw string is already formatted text like "August 2026" or "August 31, 2026"
      return raw;
    }

    // Check if input was month-year format "YYYY-MM"
    if (typeof raw === 'string' && /^\d{4}-\d{2}$/.test(raw.trim())) {
      return parsed.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      });
    }

    // Format exact date: e.g. "August 31, 2026"
    return parsed.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return null;
  }
}
