import { ViewRoute } from '../types';

/**
 * Parses current window.location into a strongly typed ViewRoute
 */
export const parseUrlToRoute = (): ViewRoute => {
  try {
    if (typeof window === 'undefined') return { type: 'home' };

    const pathname = window.location.pathname || '/';
    const searchParams = new URLSearchParams(window.location.search || '');

    // /post/:postId
    if (pathname.startsWith('/post/')) {
      const postId = pathname.slice('/post/'.length).split('/')[0].trim();
      if (postId) {
        return { type: 'post', postId };
      }
    }

    // /analytics/post/:postId
    if (pathname.startsWith('/analytics/post/')) {
      const postId = pathname.slice('/analytics/post/'.length).split('/')[0].trim();
      if (postId) {
        return { type: 'post-analytics', postId };
      }
    }

    // /analytics or /creator-analytics
    if (pathname === '/analytics' || pathname === '/creator-analytics') {
      return { type: 'creator-analytics' };
    }

    // /profile/:username
    if (pathname.startsWith('/profile/')) {
      const username = decodeURIComponent(pathname.slice('/profile/'.length).split('/')[0].trim());
      if (username) {
        const rawTab = searchParams.get('tab');
        const tab = (rawTab === 'collections' || rawTab === 'liked' || rawTab === 'scheduled') ? rawTab : 'posts';
        return { type: 'profile', username, tab };
      }
    }

    // /collection/:collectionId or /collections/:collectionId
    if (pathname.startsWith('/collection/')) {
      const collectionId = decodeURIComponent(pathname.slice('/collection/'.length).split('/')[0].trim());
      if (collectionId) {
        return { type: 'collection-detail', collectionId };
      }
    }
    if (pathname.startsWith('/collections/')) {
      const collectionId = decodeURIComponent(pathname.slice('/collections/'.length).split('/')[0].trim());
      if (collectionId) {
        return { type: 'collection-detail', collectionId };
      }
    }

    // Static views
    if (pathname === '/collections') {
      return { type: 'collections' };
    }

    if (pathname === '/explore') {
      return { type: 'explore' };
    }

    if (pathname === '/search') {
      const q = searchParams.get('q') || searchParams.get('query') || '';
      if (q.trim()) {
        return { type: 'search', query: q.trim() };
      }
      return { type: 'explore' };
    }

    if (pathname === '/settings') {
      return { type: 'settings' };
    }

    if (pathname === '/admin') {
      return { type: 'admin' };
    }
  } catch (err) {
    console.warn('Could not parse window URL route:', err);
  }

  return { type: 'home' };
};

/**
 * Formats a ViewRoute into a clean, canonical URL path
 */
export const routeToUrl = (route: ViewRoute): string => {
  switch (route.type) {
    case 'home':
      return '/';
    case 'explore':
      return '/explore';
    case 'search':
      return `/search?q=${encodeURIComponent(route.query)}`;
    case 'post':
      return `/post/${route.postId}`;
    case 'post-analytics':
      return `/analytics/post/${route.postId}`;
    case 'creator-analytics':
      return '/analytics';
    case 'profile':
      return route.tab && route.tab !== 'posts'
        ? `/profile/${encodeURIComponent(route.username)}?tab=${route.tab}`
        : `/profile/${encodeURIComponent(route.username)}`;
    case 'collections':
      return '/collections';
    case 'collection-detail':
      return `/collection/${encodeURIComponent(route.collectionId)}`;
    case 'settings':
      return '/settings';
    case 'admin':
      return '/admin';
    default:
      return '/';
  }
};

/**
 * Synchronizes the browser address bar and history stack with active route
 */
export const syncBrowserUrl = (route: ViewRoute, replace: boolean = false): void => {
  try {
    if (typeof window === 'undefined' || !window.history) return;

    const targetUrl = routeToUrl(route);
    const currentUrl = window.location.pathname + window.location.search;

    if (currentUrl !== targetUrl) {
      if (replace) {
        window.history.replaceState({ route }, '', targetUrl);
      } else {
        window.history.pushState({ route }, '', targetUrl);
      }
    }
  } catch {
    // Graceful handling for sandboxed preview environments where pushState may be restricted
  }
};
