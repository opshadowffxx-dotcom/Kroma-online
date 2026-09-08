/**
 * KROMA - Local Recent Searches Manager
 * Provides lightweight, local persistence for user-device search history (capped at 8 unique items).
 */

const RECENT_SEARCHES_STORAGE_KEY = 'kroma_recent_searches';
export const MAX_RECENT_SEARCHES = 8;

export const getRecentSearches = (): string[] => {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, MAX_RECENT_SEARCHES);
    }
    return [];
  } catch (err) {
    console.warn('Error reading recent searches from localStorage:', err);
    return [];
  }
};

export const saveRecentSearch = (query: string): string[] => {
  const clean = (query || '').trim();
  if (!clean || clean.length < 2) {
    return getRecentSearches();
  }

  try {
    const current = getRecentSearches();
    // Filter out case-insensitive duplicate
    const filtered = current.filter(item => item.toLowerCase() !== clean.toLowerCase());
    // Prepend new search to front
    const updated = [clean, ...filtered].slice(0, MAX_RECENT_SEARCHES);
    localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.warn('Error saving recent search to localStorage:', err);
    return getRecentSearches();
  }
};

export const deleteRecentSearch = (query: string): string[] => {
  try {
    const current = getRecentSearches();
    const updated = current.filter(item => item.toLowerCase() !== query.trim().toLowerCase());
    localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.warn('Error removing recent search from localStorage:', err);
    return getRecentSearches();
  }
};

export const clearAllRecentSearches = (): void => {
  try {
    localStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY);
  } catch (err) {
    console.warn('Error clearing recent searches from localStorage:', err);
  }
};
