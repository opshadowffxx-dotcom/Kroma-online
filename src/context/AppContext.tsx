import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  Post,
  User,
  Collection,
  Category,
  Comment,
  ViewRoute,
  CategorySlug,
  AppNotification,
  normalizeCategorySlug,
} from '../types';
import {
  INITIAL_POSTS,
  INITIAL_USERS,
  INITIAL_COLLECTIONS,
  INITIAL_CATEGORIES,
  INITIAL_COMMENTS,
  INITIAL_NOTIFICATIONS,
} from '../services/mockData';
import { isFirebaseAvailable, getFirebaseAuth } from '../services/firebase';
import { isMockModeEnabled } from '../config/firebase';
import { subscribeToAuthState, signOutFirebase } from '../services/firebase/authService';
import {
  fetchFirestorePostsPage,
  fetchFirestorePostById,
  searchFirestorePosts,
  createFirestorePost,
  toggleFirestorePostLike,
  fetchUserLikedPostIds,
  toggleFirestorePostSave,
  deleteFirestorePost,
  addFirestorePostComment,
  deleteFirestorePostComment,
  recordFirestorePostView,
  incrementFirestorePostView,
  recordFirestorePostImpression,
  incrementFirestorePostImpression,
  recordDailyAnalyticsBucket,
  recordFirestorePostLinkClick,
  syncCreatorIdentityToPosts,
} from '../services/firebase/postService';
import { initGA, trackReach, trackView, trackLinkClick } from '../services/analytics/ga4';
import { rankPostsByRelevance } from '../utils/searchEngine';
import { saveRecentSearch } from '../utils/recentSearches';
import { parseUrlToRoute, syncBrowserUrl } from '../utils/router';
import { collectViewTrackingData } from '../utils/trafficTracker';
import {
  fetchFirestoreCollections,
  subscribeToFirestoreCollections,
  createFirestoreCollection,
  addPostToFirestoreCollection,
  removePostFromFirestoreCollection,
  deleteFirestoreCollection,
} from '../services/firebase/collectionService';
import {
  subscribeToFirestoreNotifications,
  markFirestoreNotificationRead,
  markAllFirestoreNotificationsRead,
} from '../services/firebase/notificationService';
import {
  fetchFirestoreUser,
  fetchFirestoreUserByUsername,
  toggleFirestoreFollowUser,
  fetchUserFollowingIds,
  updateFirestoreUserProfile,
} from '../services/firebase/userService';
import { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';

interface AppContextType {
  // State
  posts: Post[];
  users: User[];
  currentUser: User | null;
  isAuthLoading: boolean;
  isLoadingPosts: boolean;
  isLoadingMore: boolean;
  hasMorePosts: boolean;
  postsError: string | null;
  searchResults: Post[];
  isSearching: boolean;
  searchError: string | null;
  collections: Collection[];
  categories: Category[];
  comments: Comment[];
  notifications: AppNotification[];
  unreadNotificationsCount: number;
  savedPostIds: string[];
  likedPostIds: string[];
  followingUserIds: string[];
  activeCategory: CategorySlug | string;
  searchQuery: string;
  theme: 'light' | 'dark';
  activeRoute: ViewRoute;
  previousRoute: ViewRoute | null;
  selectedPostId: string | null;
  isCreateModalOpen: boolean;
  isAuthModalOpen: boolean;
  authModalTab: 'login' | 'signup';
  isSaveModalOpen: boolean;
  postToSave: Post | null;
  isFirebaseConnected: boolean;
  isMockMode: boolean;

  // Actions
  navigateTo: (route: ViewRoute) => void;
  openPostDetail: (postId: string) => void;
  closePostDetail: () => void;
  setCategory: (category: CategorySlug | string) => void;
  setSearch: (query: string) => void;
  executeSearch: (query: string, category?: string) => Promise<void>;
  toggleTheme: () => void;
  toggleLikePost: (postId: string) => Promise<void>;
  toggleFollowUser: (userId: string) => Promise<void>;
  openSaveModal: (post: Post) => void;
  closeSaveModal: () => void;
  savePostToCollection: (postId: string, collectionId: string) => Promise<void>;
  removePostFromCollection: (postId: string, collectionId: string) => Promise<void>;
  createCollection: (title: string, description?: string, isPrivate?: boolean) => Promise<Collection>;
  deleteCollection: (collectionId: string) => Promise<void>;
  createPost: (postData: Partial<Post>) => Promise<Post>;
  deletePost: (postId: string) => Promise<void>;
  toggleFeaturedPost: (postId: string) => void;
  addComment: (postId: string, content: string) => Promise<Comment | null>;
  deleteComment: (postId: string, commentId: string) => Promise<void>;
  markNotificationAsRead: (notificationId: string) => void;
  markAllNotificationsAsRead: () => void;
  loadMorePosts: () => Promise<void>;
  refreshPosts: () => Promise<void>;
  retryLoadPosts: () => Promise<void>;
  openCreateModal: () => void;
  closeCreateModal: () => void;
  openAuthModal: (tab?: 'login' | 'signup') => void;
  closeAuthModal: () => void;
  loginUser: (user: User) => void;
  updateUserProfile: (updates: Partial<User>) => Promise<void>;
  logoutUser: () => void;
  getUserByUsername: (username: string) => Promise<User | null> | User | undefined;
  getUserById: (userId: string) => Promise<User | null> | User | undefined;
  getPostById: (postId: string) => Promise<Post | null> | Post | undefined;
  getCollectionsByUserId: (userId: string) => Collection[];
  recordPostView: (postId: string, creatorId?: string) => void;
  recordPostImpression: (postId: string, creatorId?: string, source?: string) => void;
  recordPostLinkClick: (postId: string, creatorId?: string, source?: string) => Promise<boolean>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isFirebaseConnected = isFirebaseAvailable();
  const isMockMode = isMockModeEnabled();

  // Controlled Auth State
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    if (isMockMode) {
      const demo = INITIAL_USERS.find(u => u.username === 'oliverchen');
      return demo || null;
    }
    return null;
  });
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(!isMockMode && isFirebaseConnected);

  // Feed & Posts State
  const [posts, setPosts] = useState<Post[]>(() => {
    if (isMockMode) return INITIAL_POSTS;
    return [];
  });
  const [isLoadingPosts, setIsLoadingPosts] = useState<boolean>(!isMockMode && isFirebaseConnected);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [hasMorePosts, setHasMorePosts] = useState<boolean>(true);
  const [postsError, setPostsError] = useState<string | null>(null);
  const lastDocRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);

  // Dedicated Production Search State
  const [searchResults, setSearchResults] = useState<Post[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchRequestIdRef = useRef<number>(0);

  // Cached Users & Content
  const [users, setUsers] = useState<User[]>(() => {
    if (isMockMode) return INITIAL_USERS;
    return [];
  });
  const [collections, setCollections] = useState<Collection[]>(() => {
    if (isMockMode) return INITIAL_COLLECTIONS;
    return [];
  });
  const [categories] = useState<Category[]>(INITIAL_CATEGORIES);
  const [comments, setComments] = useState<Comment[]>(() => {
    if (isMockMode) return INITIAL_COMMENTS;
    return [];
  });
  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    if (isMockMode) return INITIAL_NOTIFICATIONS;
    return [];
  });

  // User Engagement State
  const [savedPostIds, setSavedPostIds] = useState<string[]>(() => {
    if (isMockMode) return ['post-1', 'post-2'];
    return [];
  });
  const [likedPostIds, setLikedPostIds] = useState<string[]>(() => {
    if (isMockMode) return ['post-1', 'post-8'];
    return [];
  });
  const [followingUserIds, setFollowingUserIds] = useState<string[]>(() => {
    if (isMockMode) return ['user-elena', 'user-mono'];
    return [];
  });

  // UI Navigation & Preferences
  const [activeCategory, setActiveCategory] = useState<CategorySlug | string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('kroma_theme');
    return saved === 'dark' ? 'dark' : 'light';
  });
  const [activeRoute, setActiveRoute] = useState<ViewRoute>(() => parseUrlToRoute());
  const [previousRoute, setPreviousRoute] = useState<ViewRoute | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(() => {
    const initialRoute = parseUrlToRoute();
    return initialRoute.type === 'post' ? initialRoute.postId : null;
  });

  // Listen for browser popstate (back / forward navigation) & Initialize GA4
  useEffect(() => {
    initGA();
    const handlePopState = () => {
      const route = parseUrlToRoute();
      setPreviousRoute(activeRoute);
      setActiveRoute(route);
      if (route.type === 'post') {
        setSelectedPostId(route.postId);
      } else {
        setSelectedPostId(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<'login' | 'signup'>('login');
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [postToSave, setPostToSave] = useState<Post | null>(null);

  // In-flight interaction locks
  const likeInFlightRef = useRef<Set<string>>(new Set());
  const viewInFlightRef = useRef<Set<string>>(new Set());
  const impressionInFlightRef = useRef<Set<string>>(new Set());

  // Apply Theme Class
  useEffect(() => {
    localStorage.setItem('kroma_theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const feedRequestIdRef = useRef<number>(0);

  // Load Initial Posts (Paginated)
  const loadPostsForCategory = useCallback(async (cat: string) => {
    const requestId = ++feedRequestIdRef.current;
    const normalizedCat = normalizeCategorySlug(cat);

    if (isMockMode || !isFirebaseConnected) {
      if (isMockMode) {
        if (normalizedCat === 'all') {
          setPosts(INITIAL_POSTS);
        } else {
          setPosts(INITIAL_POSTS.filter(p => normalizeCategorySlug(p.category) === normalizedCat));
        }
      }
      setPostsError(null);
      setIsLoadingPosts(false);
      return;
    }

    setIsLoadingPosts(true);
    setPostsError(null);
    lastDocRef.current = null;

    try {
      const result = await fetchFirestorePostsPage({
        category: normalizedCat === 'all' ? undefined : normalizedCat,
        limitCount: 24,
      });

      if (requestId !== feedRequestIdRef.current) return;

      setPosts(result.posts);
      lastDocRef.current = result.lastDoc;
      setHasMorePosts(result.hasMore);
      setPostsError(null);
    } catch (err: any) {
      if (requestId === feedRequestIdRef.current) {
        setPosts([]);
        setHasMorePosts(false);
        setPostsError(err?.message || 'Unable to load visuals. Please check your connection and try again.');
      }
    } finally {
      if (requestId === feedRequestIdRef.current) {
        setIsLoadingPosts(false);
      }
    }
  }, [isMockMode, isFirebaseConnected]);

  const retryLoadPosts = useCallback(async () => {
    await loadPostsForCategory(activeCategory);
  }, [loadPostsForCategory, activeCategory]);

  // Production Discovery Search Execution
  const executeSearch = useCallback(
    async (queryText: string, category?: string) => {
      const requestId = ++searchRequestIdRef.current;
      const cleanQuery = (queryText || '').trim();

      if (!cleanQuery) {
        setSearchResults([]);
        setIsSearching(false);
        setSearchError(null);
        return;
      }

      setIsSearching(true);
      setSearchError(null);

      try {
        if (isMockMode || !isFirebaseConnected) {
          const basePosts = posts.length > 0 ? posts : INITIAL_POSTS;
          const filtered = category && category !== 'all'
            ? basePosts.filter(p => normalizeCategorySlug(p.category) === normalizeCategorySlug(category))
            : basePosts;
          const ranked = rankPostsByRelevance(filtered, cleanQuery);
          if (requestId === searchRequestIdRef.current) {
            setSearchResults(ranked);
          }
        } else {
          const results = await searchFirestorePosts(cleanQuery, category, 60);
          if (requestId === searchRequestIdRef.current) {
            setSearchResults(results);
          }
        }
      } catch (err: any) {
        if (requestId === searchRequestIdRef.current) {
          setSearchError(err?.message || 'Search encountered a momentary issue. Please try again.');
          setSearchResults([]);
        }
      } finally {
        if (requestId === searchRequestIdRef.current) {
          setIsSearching(false);
        }
      }
    },
    [isMockMode, isFirebaseConnected, posts]
  );

  // Fetch posts when category changes
  useEffect(() => {
    loadPostsForCategory(activeCategory);
  }, [activeCategory, loadPostsForCategory]);

  // Load More Posts (Cursor-based Pagination)
  const loadMorePosts = async () => {
    if (isMockMode || !isFirebaseConnected || isLoadingMore || !hasMorePosts) return;

    setIsLoadingMore(true);
    const normalizedCat = normalizeCategorySlug(activeCategory);
    try {
      const result = await fetchFirestorePostsPage({
        category: normalizedCat === 'all' ? undefined : normalizedCat,
        startAfterDoc: lastDocRef.current,
        limitCount: 24,
      });

      if (result.posts.length > 0) {
        setPosts(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const newPosts = result.posts.filter(p => !existingIds.has(p.id));
          return [...prev, ...newPosts];
        });
      }

      lastDocRef.current = result.lastDoc;
      setHasMorePosts(result.hasMore);
    } catch {
      setHasMorePosts(false);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const refreshPosts = async () => {
    await loadPostsForCategory(activeCategory);
  };

  // Real Firebase Auth Listener
  useEffect(() => {
    if (!isFirebaseConnected || isMockMode) {
      setIsAuthLoading(false);
      return;
    }

    const unsubAuth = subscribeToAuthState(async fbUser => {
      // Anonymous Firebase Auth is used exclusively for telemetry writes and must never be treated as a KROMA creator session
      if (fbUser && !fbUser.isAnonymous) {
        try {
          const profile = await fetchFirestoreUser(fbUser.uid);
          if (profile) {
            setCurrentUser(profile);
          } else {
            // Fallback profile from auth token for real authenticated users
            const derivedProfile: User = {
              id: fbUser.uid,
              username: (fbUser.displayName || fbUser.email?.split('@')[0] || 'creator').toLowerCase().replace(/[^a-z0-9_]/g, ''),
              displayName: fbUser.displayName || 'Creator',
              email: fbUser.email || '',
              avatarUrl: fbUser.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=300&auto=format&fit=crop',
              followersCount: 0,
              followingCount: 0,
              postsCount: 0,
              collectionsCount: 0,
              createdAt: new Date().toISOString(),
            };
            setCurrentUser(derivedProfile);
          }

          // Fetch user following list and liked post IDs from Firestore
          const [following, likedIds] = await Promise.all([
            fetchUserFollowingIds(fbUser.uid),
            fetchUserLikedPostIds(fbUser.uid),
          ]);
          setFollowingUserIds(following);
          setLikedPostIds(likedIds);
        } catch {
          setCurrentUser(null);
        }
      } else {
        // Guest or Anonymous session (used strictly for telemetry writes)
        setCurrentUser(null);
        setFollowingUserIds([]);
        setSavedPostIds([]);
        setLikedPostIds([]);
        setCollections([]);
        setNotifications([]);
      }
      setIsAuthLoading(false);
    });

    return () => unsubAuth();
  }, [isFirebaseConnected, isMockMode]);

  // Real Collections Subscription & Immediate Fetch for Logged-In User
  useEffect(() => {
    if (!isFirebaseConnected || isMockMode || !currentUser?.id) return;

    let isMounted = true;

    // Immediate direct fetch to guarantee collections appear on reload even before snapshot
    fetchFirestoreCollections(currentUser.id)
      .then(userCols => {
        if (!isMounted) return;
        if (userCols.length > 0) {
          setCollections(prev => {
            const fetchedIds = new Set(userCols.map(c => c.id));
            const existingOther = prev.filter(c => !fetchedIds.has(c.id));
            return [...userCols, ...existingOther];
          });
          const savedIds = new Set<string>();
          userCols.forEach(c => {
            c.postIds?.forEach(id => savedIds.add(id));
          });
          setSavedPostIds(Array.from(savedIds));
        }
      })
      .catch(err => {
        console.error('Initial fetchFirestoreCollections error in AppContext:', err);
      });

    const unsubCollections = subscribeToFirestoreCollections(
      currentUser.id,
      userCols => {
        if (!isMounted) return;
        setCollections(userCols);
        // Aggregate saved post IDs from collections
        const savedIds = new Set<string>();
        userCols.forEach(c => {
          c.postIds?.forEach(id => savedIds.add(id));
        });
        setSavedPostIds(Array.from(savedIds));
      }
    );

    return () => {
      isMounted = false;
      unsubCollections();
    };
  }, [isFirebaseConnected, isMockMode, currentUser?.id]);

  // Real Notifications Subscription for Logged-In User
  useEffect(() => {
    if (!isFirebaseConnected || isMockMode || !currentUser?.id) return;

    const unsubNotifs = subscribeToFirestoreNotifications(
      currentUser.id,
      userNotifs => {
        setNotifications(userNotifs);
      }
    );

    return () => unsubNotifs();
  }, [isFirebaseConnected, isMockMode, currentUser?.id]);

  // Unread notifications count
  const unreadNotificationsCount = notifications.filter(n => !n.isRead).length;

  // Navigation
  const navigateTo = (route: ViewRoute, replace: boolean = false) => {
    setPreviousRoute(activeRoute);
    setActiveRoute(route);
    syncBrowserUrl(route, replace);
    if (route.type === 'post') {
      setSelectedPostId(route.postId);
    } else {
      setSelectedPostId(null);
    }
    if (route.type === 'home') {
      // Prevent stale category filter on Home feed
      setActiveCategory('all');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openPostDetail = (postId: string) => {
    setSelectedPostId(postId);
    navigateTo({ type: 'post', postId });
  };

  const closePostDetail = () => {
    setSelectedPostId(null);
    if (activeRoute.type === 'post') {
      if (typeof window !== 'undefined' && window.history && window.history.length > 1) {
        window.history.back();
      } else {
        navigateTo({ type: 'home' });
      }
    }
  };

  const setCategory = (category: CategorySlug | string) => {
    setActiveCategory(category);
    if (activeRoute.type !== 'home' && activeRoute.type !== 'explore') {
      navigateTo({ type: 'home' });
    }
  };

  const setSearch = (query: string) => {
    setSearchQuery(query);
    if (query.trim()) {
      saveRecentSearch(query.trim());
      navigateTo({ type: 'search', query: query.trim() });
      executeSearch(query.trim());
    } else {
      executeSearch('');
    }
  };

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  // Record Lifetime Deduplicated Unique Post View (1 User + 1 Post = Lifetime 1 View)
  const recordPostView = useCallback(async (postId: string, creatorId?: string) => {
    if (!postId) return;

    const targetPost = posts.find(p => p.id === postId);
    const resolvedCreatorId = creatorId || targetPost?.creatorId;

    // Defense-in-depth: Never count creator's own view of their own post
    if (currentUser?.id) {
      if (resolvedCreatorId && currentUser.id === resolvedCreatorId) {
        return;
      }
      if (targetPost && targetPost.creatorId === currentUser.id) {
        return;
      }
    }

    const applyLocalViewIncrement = () => {
      setPosts(prev =>
        prev.map(p => (p.id === postId ? { ...p, viewsCount: (p.viewsCount || 0) + 1 } : p))
      );
    };

    // 1) Authenticated user: lifetime dedupe (No 24-hour reset window)
    if (currentUser?.id) {
      const userStorageKey = `kroma_user_view_${currentUser.id}_${postId}`;
      const legacyUserKey = `kroma_view_${currentUser.id}_${postId}`;

      // Fast-path client check: already viewed in this browser
      if (localStorage.getItem(userStorageKey) || localStorage.getItem(legacyUserKey)) {
        return;
      }

      const inFlightKey = `auth_${currentUser.id}_${postId}`;
      if (viewInFlightRef.current.has(inFlightKey)) {
        return;
      }
      viewInFlightRef.current.add(inFlightKey);

      if (isMockMode || !isFirebaseConnected) {
        try {
          const nowIso = new Date().toISOString();
          localStorage.setItem(userStorageKey, nowIso);
          localStorage.setItem(legacyUserKey, nowIso);
          applyLocalViewIncrement();
          trackView(postId, resolvedCreatorId, 'Direct');
          collectViewTrackingData()
            .then(tr => {
              recordDailyAnalyticsBucket(postId, resolvedCreatorId, tr, 'view');
              if (tr?.source) {
                trackView(postId, resolvedCreatorId, tr.source);
              }
            })
            .catch(() => {});
        } finally {
          viewInFlightRef.current.delete(inFlightKey);
        }
        return;
      }

      try {
        // Atomic Firestore transaction: checks users/{userId}/postViews/{postId}
        // If not exists -> creates record + increments post viewsCount + updates telemetry maps
        const viewResult = await recordFirestorePostView(postId, currentUser.id, resolvedCreatorId);

        if (viewResult.didIncrement) {
          const nowIso = new Date().toISOString();
          localStorage.setItem(userStorageKey, nowIso);
          localStorage.setItem(legacyUserKey, nowIso);
          applyLocalViewIncrement();
          trackView(postId, resolvedCreatorId, 'Direct');
        } else if (viewResult.alreadyViewed) {
          // Firestore already has the lifetime dedup doc (genuine prior view) -> safe to cache
          const nowIso = new Date().toISOString();
          localStorage.setItem(userStorageKey, nowIso);
          localStorage.setItem(legacyUserKey, nowIso);
        }
        // If false for any other reason (post not found, error, transaction issue), do NOT cache
      } catch (err) {
        console.warn('Could not record Firestore post view:', err);
      } finally {
        viewInFlightRef.current.delete(inFlightKey);
      }
    } else {
      // 2) Logged-out / Guest viewer: Lifetime same-browser dedupe (No 24-hour reset)
      const guestKey = `kroma_guest_view_${postId}`;
      const legacyKey = `kroma_view_${postId}`;

      // If already viewed on this device -> +0 forever unless storage is manually cleared
      if (localStorage.getItem(guestKey) || localStorage.getItem(legacyKey)) {
        return;
      }

      const inFlightKey = `guest_${postId}`;
      if (viewInFlightRef.current.has(inFlightKey)) {
        return;
      }
      viewInFlightRef.current.add(inFlightKey);

      try {
        if (isFirebaseConnected && !isMockMode) {
          const didIncrement = await incrementFirestorePostView(postId, resolvedCreatorId);
          if (didIncrement) {
            const nowIso = new Date().toISOString();
            localStorage.setItem(guestKey, nowIso);
            localStorage.setItem(legacyKey, nowIso);
            applyLocalViewIncrement();
            trackView(postId, resolvedCreatorId, 'Direct');
          }
        } else {
          const nowIso = new Date().toISOString();
          localStorage.setItem(guestKey, nowIso);
          localStorage.setItem(legacyKey, nowIso);
          applyLocalViewIncrement();
          trackView(postId, resolvedCreatorId, 'Direct');
          collectViewTrackingData()
            .then(tr => {
              recordDailyAnalyticsBucket(postId, resolvedCreatorId, tr, 'view');
              if (tr?.source) {
                trackView(postId, resolvedCreatorId, tr.source);
              }
            })
            .catch(() => {});
        }
      } catch (err) {
        console.warn('Could not record guest post view:', err);
      } finally {
        viewInFlightRef.current.delete(inFlightKey);
      }
    }
  }, [currentUser?.id, posts, isMockMode, isFirebaseConnected]);

  // Record Lifetime Deduplicated Unique Post Impression / Reach (1 User + 1 Post = Lifetime 1 Impression)
  const recordPostImpression = useCallback(async (postId: string, creatorId?: string, source: string = 'home') => {
    if (!postId) return;

    const targetPost = posts.find(p => p.id === postId);
    const resolvedCreatorId = creatorId || targetPost?.creatorId;

    // Defense-in-depth: Never count creator's own impression of their own post
    if (currentUser?.id) {
      if (resolvedCreatorId && currentUser.id === resolvedCreatorId) {
        return;
      }
      if (targetPost && targetPost.creatorId === currentUser.id) {
        return;
      }
    }

    const safeSource = ['home', 'search', 'related', 'profile', 'collection'].includes(source)
      ? source
      : 'home';

    const applyLocalImpressionIncrement = () => {
      setPosts(prev =>
        prev.map(p => {
          if (p.id !== postId) return p;
          return {
            ...p,
            uniqueImpressionsCount: (p.uniqueImpressionsCount || 0) + 1,
          };
        })
      );
    };

    // 1) Authenticated user: lifetime dedupe (No 24-hour reset window, no TTL)
    if (currentUser?.id) {
      const userStorageKey = `kroma_user_imp_${currentUser.id}_${postId}`;

      // Fast-path client check: already impressed in this browser
      if (localStorage.getItem(userStorageKey)) {
        return;
      }

      const inFlightKey = `auth_imp_${currentUser.id}_${postId}`;
      if (impressionInFlightRef.current.has(inFlightKey)) {
        return;
      }
      impressionInFlightRef.current.add(inFlightKey);

      if (isMockMode || !isFirebaseConnected) {
        try {
          const nowIso = new Date().toISOString();
          localStorage.setItem(userStorageKey, nowIso);
          applyLocalImpressionIncrement();
          trackReach(postId, resolvedCreatorId, safeSource);
          recordDailyAnalyticsBucket(postId, resolvedCreatorId, { source: safeSource }, 'impression').catch(() => {});
        } finally {
          impressionInFlightRef.current.delete(inFlightKey);
        }
        return;
      }

      try {
        // Atomic Firestore transaction: checks users/{userId}/postImpressions/{postId}
        // If not exists -> creates record + increments post uniqueImpressionsCount + updates source map
        const impResult = await recordFirestorePostImpression(postId, currentUser.id, resolvedCreatorId, safeSource);

        if (impResult.didIncrement) {
          const nowIso = new Date().toISOString();
          localStorage.setItem(userStorageKey, nowIso);
          applyLocalImpressionIncrement();
          trackReach(postId, resolvedCreatorId, safeSource);
        } else if (impResult.alreadyImpressed) {
          const nowIso = new Date().toISOString();
          localStorage.setItem(userStorageKey, nowIso);
        }
      } catch (err) {
        console.warn('Could not record Firestore post impression:', err);
      } finally {
        impressionInFlightRef.current.delete(inFlightKey);
      }
    } else {
      // 2) Logged-out / Guest viewer: Lifetime same-browser dedupe (No 24-hour reset)
      // Note: Anonymous lifetime uniqueness is per-browser/device storage and cannot be guaranteed
      // across cleared browser storage, incognito, or different devices.
      const guestKey = `kroma_guest_imp_${postId}`;

      // If already impressed on this device -> +0 forever unless storage is manually cleared
      if (localStorage.getItem(guestKey)) {
        return;
      }

      const inFlightKey = `guest_imp_${postId}`;
      if (impressionInFlightRef.current.has(inFlightKey)) {
        return;
      }
      impressionInFlightRef.current.add(inFlightKey);

      try {
        if (isFirebaseConnected && !isMockMode) {
          const didIncrement = await incrementFirestorePostImpression(postId, resolvedCreatorId, safeSource);
          if (didIncrement) {
            const nowIso = new Date().toISOString();
            localStorage.setItem(guestKey, nowIso);
            applyLocalImpressionIncrement();
            trackReach(postId, resolvedCreatorId, safeSource);
          }
        } else {
          const nowIso = new Date().toISOString();
          localStorage.setItem(guestKey, nowIso);
          applyLocalImpressionIncrement();
          trackReach(postId, resolvedCreatorId, safeSource);
          recordDailyAnalyticsBucket(postId, resolvedCreatorId, { source: safeSource }, 'impression').catch(() => {});
        }
      } catch (err) {
        console.warn('Could not record guest post impression:', err);
      } finally {
        impressionInFlightRef.current.delete(inFlightKey);
      }
    }
  }, [currentUser?.id, posts, isMockMode, isFirebaseConnected]);

  // Real Like / Unlike
  const toggleLikePost = async (postId: string) => {
    if (!currentUser) {
      openAuthModal('login');
      return;
    }

    if (likeInFlightRef.current.has(postId)) return;
    likeInFlightRef.current.add(postId);

    const isLiked = likedPostIds.includes(postId);
    const targetPost = posts.find(p => p.id === postId);
    const resolvedCreatorId = targetPost?.creatorId || targetPost?.creator?.id;

    // Optimistic Update
    setLikedPostIds(prev =>
      isLiked ? prev.filter(id => id !== postId) : [...prev, postId]
    );

    setPosts(prev =>
      prev.map(post => {
        if (post.id === postId) {
          return {
            ...post,
            likesCount: isLiked ? Math.max(0, post.likesCount - 1) : post.likesCount + 1,
          };
        }
        return post;
      })
    );

    if (isFirebaseConnected && !isMockMode) {
      try {
        await toggleFirestorePostLike(postId, currentUser.id, !isLiked);
        // Only record daily analytics event after Firestore operation confirms success
        if (!isLiked) {
          recordDailyAnalyticsBucket(postId, resolvedCreatorId, undefined, 'like').catch(() => {});
        }
      } catch (err) {
        console.warn('Could not sync post like to remote Firestore:', err);
        // Rollback optimistic state on failure
        setLikedPostIds(prev =>
          isLiked ? [...prev, postId] : prev.filter(id => id !== postId)
        );
        setPosts(prev =>
          prev.map(post => {
            if (post.id === postId) {
              return {
                ...post,
                likesCount: isLiked ? post.likesCount + 1 : Math.max(0, post.likesCount - 1),
              };
            }
            return post;
          })
        );
      } finally {
        likeInFlightRef.current.delete(postId);
      }
    } else {
      if (!isLiked) {
        recordDailyAnalyticsBucket(postId, resolvedCreatorId, undefined, 'like').catch(() => {});
      }
      likeInFlightRef.current.delete(postId);
    }
  };

  // Real Follow / Unfollow
  const toggleFollowUser = async (targetUserId: string) => {
    if (!currentUser) {
      openAuthModal('login');
      return;
    }
    if (currentUser.id === targetUserId) return;

    const isFollowing = followingUserIds.includes(targetUserId);

    // Optimistic Update
    setFollowingUserIds(prev =>
      isFollowing ? prev.filter(id => id !== targetUserId) : [...prev, targetUserId]
    );

    setCurrentUser(prev =>
      prev
        ? {
            ...prev,
            followingCount: isFollowing
              ? Math.max(0, prev.followingCount - 1)
              : prev.followingCount + 1,
          }
        : null
    );

    setUsers(prev =>
      prev.map(u => {
        if (u.id === targetUserId) {
          return {
            ...u,
            followersCount: isFollowing
              ? Math.max(0, u.followersCount - 1)
              : u.followersCount + 1,
          };
        }
        return u;
      })
    );

    if (isFirebaseConnected && !isMockMode) {
      try {
        await toggleFirestoreFollowUser(currentUser.id, targetUserId, !isFollowing);
      } catch {
        // Rollback
        setFollowingUserIds(prev =>
          isFollowing ? [...prev, targetUserId] : prev.filter(id => id !== targetUserId)
        );
      }
    }
  };

  // Save Modal Helpers
  const openSaveModal = (post: Post) => {
    if (!currentUser) {
      openAuthModal('login');
      return;
    }
    setPostToSave(post);
    setIsSaveModalOpen(true);
  };

  const closeSaveModal = () => {
    setIsSaveModalOpen(false);
    setPostToSave(null);
  };

  // Real Save Post to Collection
  const savePostToCollection = async (postId: string, collectionId: string) => {
    if (!currentUser) {
      openAuthModal('login');
      return;
    }

    const previousCollections = [...collections];
    const previousSavedPostIds = [...savedPostIds];
    const previousPosts = [...posts];

    const isAlreadySaved = savedPostIds.includes(postId);

    setCollections(prev =>
      prev.map(col => {
        const safeIds = Array.isArray(col.postIds) ? col.postIds : [];
        if (col.id === collectionId && !safeIds.includes(postId)) {
          const nextIds = [...safeIds, postId];
          return {
            ...col,
            postIds: nextIds,
            postsCount: nextIds.length,
            updatedAt: new Date().toISOString(),
          };
        }
        return col;
      })
    );

    if (!isAlreadySaved) {
      setSavedPostIds(prev => [...prev, postId]);
      setPosts(prev =>
        prev.map(post => {
          if (post.id === postId) {
            return { ...post, savesCount: (post.savesCount || 0) + 1 };
          }
          return post;
        })
      );
    }

    if (isFirebaseConnected && !isMockMode) {
      try {
        await addPostToFirestoreCollection(collectionId, postId);
        if (!isAlreadySaved) {
          await toggleFirestorePostSave(postId, currentUser.id, true);
          const targetPost = posts.find(p => p.id === postId);
          const resolvedCreatorId = targetPost?.creatorId || targetPost?.creator?.id;
          // Only record daily analytics event after successful Firestore write
          recordDailyAnalyticsBucket(postId, resolvedCreatorId, undefined, 'save').catch(() => {});
        }
      } catch (err) {
        console.error('Error saving post to collection in Firestore:', err);
        // Rollback on error
        setCollections(previousCollections);
        setSavedPostIds(previousSavedPostIds);
        setPosts(previousPosts);
      }
    } else {
      if (!isAlreadySaved) {
        const targetPost = posts.find(p => p.id === postId);
        const resolvedCreatorId = targetPost?.creatorId || targetPost?.creator?.id;
        recordDailyAnalyticsBucket(postId, resolvedCreatorId, undefined, 'save').catch(() => {});
      }
    }
  };

  // Remove Post from Collection
  const removePostFromCollection = async (postId: string, collectionId: string) => {
    if (!currentUser) return;

    const previousCollections = [...collections];
    const previousSavedPostIds = [...savedPostIds];
    const previousPosts = [...posts];

    const remainingInCollections = collections.filter(
      c => c.id !== collectionId && Array.isArray(c.postIds) && c.postIds.includes(postId)
    );
    const isNowUnsaved = remainingInCollections.length === 0;

    setCollections(prev =>
      prev.map(col => {
        if (col.id === collectionId) {
          const safeIds = Array.isArray(col.postIds) ? col.postIds : [];
          const nextIds = safeIds.filter(id => id !== postId);
          return {
            ...col,
            postIds: nextIds,
            postsCount: nextIds.length,
            updatedAt: new Date().toISOString(),
          };
        }
        return col;
      })
    );

    if (isNowUnsaved) {
      setSavedPostIds(prev => prev.filter(id => id !== postId));
      setPosts(prev =>
        prev.map(post => {
          if (post.id === postId) {
            return { ...post, savesCount: Math.max(0, (post.savesCount || 0) - 1) };
          }
          return post;
        })
      );
    }

    if (isFirebaseConnected && !isMockMode) {
      try {
        await removePostFromFirestoreCollection(collectionId, postId);
        if (isNowUnsaved) {
          await toggleFirestorePostSave(postId, currentUser.id, false);
        }
      } catch (err) {
        console.error('Error removing post from collection in Firestore:', err);
        // Rollback on error
        setCollections(previousCollections);
        setSavedPostIds(previousSavedPostIds);
        setPosts(previousPosts);
      }
    }
  };

  // Create Collection
  const createCollection = async (
    title: string,
    description?: string,
    isPrivate: boolean = false
  ): Promise<Collection> => {
    if (!currentUser) {
      openAuthModal('login');
      throw new Error('You must be signed in to create a collection.');
    }

    const newCol: Collection = {
      id: `col-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      userId: currentUser.id,
      title: title.trim(),
      description: description?.trim() || '',
      isPrivate,
      postIds: [],
      postsCount: 0,
      createdAt: new Date().toISOString(),
    };

    setCollections(prev => [newCol, ...prev]);

    if (isFirebaseConnected && !isMockMode) {
      await createFirestoreCollection(newCol);
    }

    return newCol;
  };

  // Delete Collection
  const deleteCollection = async (collectionId: string) => {
    if (!currentUser) return;

    setCollections(prev => prev.filter(c => c.id !== collectionId));

    if (isFirebaseConnected && !isMockMode) {
      await deleteFirestoreCollection(collectionId, currentUser.id);
    }
  };

  // Real Create Post
  const createPost = async (postData: Partial<Post>): Promise<Post> => {
    if (!currentUser) {
      openAuthModal('login');
      throw new Error('You must be logged in to create a post.');
    }

    const auth = getFirebaseAuth();
    const effectiveCreatorId = (isFirebaseConnected && !isMockMode && auth?.currentUser?.uid)
      ? auth.currentUser.uid
      : currentUser.id;

    const newPost: Post = {
      id: postData.id || `post-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      creatorId: effectiveCreatorId,
      creator: {
        id: effectiveCreatorId,
        username: currentUser.username,
        displayName: currentUser.displayName,
        avatarUrl: currentUser.avatarUrl,
      },
      title: postData.title?.trim() || 'Untitled Visual',
      description: postData.description?.trim() || '',
      imageUrl: postData.imageUrl?.trim() || '',
      thumbnailUrl: postData.thumbnailUrl?.trim() || postData.imageUrl?.trim() || '',
      aspectRatio: postData.aspectRatio || 0.75,
      imageWidth: postData.imageWidth,
      imageHeight: postData.imageHeight,
      imageMimeType: postData.imageMimeType,
      imageSize: postData.imageSize,
      thumbnailWidth: postData.thumbnailWidth,
      thumbnailHeight: postData.thumbnailHeight,
      imageObjectKey: postData.imageObjectKey,
      thumbnailObjectKey: postData.thumbnailObjectKey,
      category: postData.category ? normalizeCategorySlug(postData.category) : undefined,
      tags: Array.isArray(postData.tags) ? postData.tags : [],
      styleTags: postData.styleTags || [],
      toolsUsed: postData.toolsUsed || [],
      isAIGenerated: Boolean(postData.isAIGenerated),
      imageAltText: postData.imageAltText?.trim() || postData.title?.trim() || undefined,
      publishStatus: postData.publishStatus === 'scheduled' ? 'scheduled' : 'published',
      scheduledPublishAt: postData.scheduledPublishAt || undefined,
      sourceUrl: postData.sourceUrl?.trim() || undefined,
      ctaLabel:
        postData.sourceUrl?.trim() && postData.ctaLabel?.trim()
          ? postData.ctaLabel.trim().slice(0, 32)
          : undefined,
      likesCount: 0,
      savesCount: 0,
      viewsCount: 0,
      uniqueImpressionsCount: 0,
      linkClicksCount: 0,
      commentsCount: 0,
      isPublished:
        postData.isPublished !== undefined
          ? postData.isPublished
          : postData.publishStatus !== 'scheduled',
      isFeatured: false,
      createdAt: new Date().toISOString(),
    };

    // Prepend to global posts feed if published immediately
    if (newPost.isPublished) {
      setPosts(prev => [newPost, ...prev]);
      // Update currentUser postsCount
      setCurrentUser(prev => (prev ? { ...prev, postsCount: prev.postsCount + 1 } : null));
    }

    if (isFirebaseConnected && !isMockMode) {
      try {
        await createFirestorePost(newPost);
      } catch (err) {
        // Rollback optimistic post and postsCount on failure
        if (newPost.isPublished) {
          setPosts(prev => prev.filter(p => p.id !== newPost.id));
          setCurrentUser(prev => (prev ? { ...prev, postsCount: Math.max(0, prev.postsCount - 1) } : null));
        }
        throw err;
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kroma-post-created', { detail: newPost }));
    }

    return newPost;
  };

  // Real Delete Post
  const deletePost = async (postId: string) => {
    if (!currentUser) return;

    setPosts(prev => prev.filter(p => p.id !== postId));
    setSavedPostIds(prev => prev.filter(id => id !== postId));
    setLikedPostIds(prev => prev.filter(id => id !== postId));

    if (selectedPostId === postId) {
      setSelectedPostId(null);
    }

    if (isFirebaseConnected && !isMockMode) {
      await deleteFirestorePost(postId, currentUser.id);
    }
  };

  const toggleFeaturedPost = (postId: string) => {
    setPosts(prev =>
      prev.map(p => (p.id === postId ? { ...p, isFeatured: !p.isFeatured } : p))
    );
  };

  // Real Comments
  const addComment = async (postId: string, content: string): Promise<Comment | null> => {
    if (!currentUser) {
      openAuthModal('login');
      return null;
    }
    if (!content.trim()) return null;

    const newComment: Comment = {
      id: `comment-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      postId,
      userId: currentUser.id,
      user: {
        id: currentUser.id,
        username: currentUser.username,
        displayName: currentUser.displayName,
        avatarUrl: currentUser.avatarUrl,
      },
      content: content.trim(),
      createdAt: new Date().toISOString(),
    };

    setComments(prev => [...prev, newComment]);

    // Update post comments count
    setPosts(prev =>
      prev.map(p => (p.id === postId ? { ...p, commentsCount: p.commentsCount + 1 } : p))
    );

    const targetPost = posts.find(p => p.id === postId);
    const resolvedCreatorId = targetPost?.creatorId || targetPost?.creator?.id;

    if (isFirebaseConnected && !isMockMode) {
      try {
        await addFirestorePostComment(postId, newComment);
        // Only record daily analytics event after successful Firestore comment write
        recordDailyAnalyticsBucket(postId, resolvedCreatorId, undefined, 'comment').catch(() => {});
      } catch (err) {
        console.error('Error adding comment to Firestore:', err);
        // Rollback optimistic comment and commentsCount on failure
        setComments(prev => prev.filter(c => c.id !== newComment.id));
        setPosts(prev =>
          prev.map(p => (p.id === postId ? { ...p, commentsCount: Math.max(0, p.commentsCount - 1) } : p))
        );
        throw err;
      }
    } else {
      recordDailyAnalyticsBucket(postId, resolvedCreatorId, undefined, 'comment').catch(() => {});
    }

    return newComment;
  };

  const deleteComment = async (postId: string, commentId: string) => {
    if (!currentUser) return;

    setComments(prev => prev.filter(c => c.id !== commentId));
    setPosts(prev =>
      prev.map(p => (p.id === postId ? { ...p, commentsCount: Math.max(0, p.commentsCount - 1) } : p))
    );

    if (isFirebaseConnected && !isMockMode) {
      await deleteFirestorePostComment(postId, commentId);
    }
  };

  // Notifications
  const markNotificationAsRead = (notificationId: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === notificationId ? { ...n, isRead: true } : n))
    );
    if (isFirebaseConnected && !isMockMode) {
      markFirestoreNotificationRead(notificationId);
    }
  };

  const markAllNotificationsAsRead = () => {
    const unread = notifications.filter(n => !n.isRead);
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    if (isFirebaseConnected && !isMockMode && currentUser) {
      markAllFirestoreNotificationsRead(currentUser.id, unread);
    }
  };

  // Modals & Auth Actions
  const openCreateModal = () => {
    if (!currentUser) {
      openAuthModal('signup');
      return;
    }
    setIsCreateModalOpen(true);
  };
  const closeCreateModal = () => setIsCreateModalOpen(false);

  const openAuthModal = (tab: 'login' | 'signup' = 'login') => {
    setAuthModalTab(tab);
    setIsAuthModalOpen(true);
  };
  const closeAuthModal = () => setIsAuthModalOpen(false);

  const loginUser = (user: User) => {
    setCurrentUser(user);
    closeAuthModal();
  };

  const updateUserProfile = async (updates: Partial<User>) => {
    if (!currentUser) return;
    const updatedUser = { ...currentUser, ...updates };
    setCurrentUser(updatedUser);
    setUsers(prev => prev.map(u => (u.id === currentUser.id ? updatedUser : u)));

    // Immediately update matching posts in AppContext local state so the UI changes without refresh
    setPosts(prev =>
      prev.map(p => {
        const pCreatorId = p.creatorId || p.creator?.id;
        if (pCreatorId === currentUser.id) {
          return {
            ...p,
            creator: {
              ...p.creator,
              avatarUrl: updatedUser.avatarUrl || p.creator.avatarUrl,
              displayName: updatedUser.displayName || p.creator.displayName,
              username: updatedUser.username || p.creator.username,
            },
          };
        }
        return p;
      })
    );

    if (isFirebaseConnected && !isMockMode) {
      await updateFirestoreUserProfile(currentUser.id, updates);
      await syncCreatorIdentityToPosts(currentUser.id, {
        avatarUrl: updatedUser.avatarUrl,
        displayName: updatedUser.displayName,
        username: updatedUser.username,
      });
    }
  };

  const logoutUser = () => {
    setCurrentUser(null);
    setFollowingUserIds([]);
    setSavedPostIds([]);
    setLikedPostIds([]);
    setCollections([]);
    setNotifications([]);
    if (isFirebaseConnected) {
      signOutFirebase();
    }
  };

  // Data Lookup Helpers with Firestore fallback
  const getUserByUsername = useCallback(
    async (username: string): Promise<User | null> => {
      if (!username) return null;
      const target = username.trim().toLowerCase();
      const match = users.find(u => (u.username || '').toLowerCase() === target);
      if (match) return match;

      if (isFirebaseConnected && !isMockMode) {
        const remoteUser = await fetchFirestoreUserByUsername(target);
        if (remoteUser) {
          setUsers(prev => {
            if (prev.some(u => u.id === remoteUser.id)) return prev;
            return [...prev, remoteUser];
          });
          return remoteUser;
        }
      }
      return null;
    },
    [users, isFirebaseConnected, isMockMode]
  );

  const getUserById = useCallback(
    async (userId: string): Promise<User | null> => {
      const match = users.find(u => u.id === userId);
      if (match) return match;

      if (isFirebaseConnected && !isMockMode) {
        const remoteUser = await fetchFirestoreUser(userId);
        if (remoteUser) {
          setUsers(prev => {
            if (prev.some(u => u.id === remoteUser.id)) return prev;
            return [...prev, remoteUser];
          });
          return remoteUser;
        }
      }
      return null;
    },
    [users, isFirebaseConnected, isMockMode]
  );

  const getPostById = useCallback(
    async (postId: string): Promise<Post | null> => {
      const match = posts.find(p => p.id === postId);
      if (match) return match;

      if (isFirebaseConnected && !isMockMode) {
        return await fetchFirestorePostById(postId);
      }
      return null;
    },
    [posts, isFirebaseConnected, isMockMode]
  );

  const getCollectionsByUserId = useCallback(
    (userId: string) => {
      return collections.filter(c => c.userId === userId);
    },
    [collections]
  );

  // Record Controlled Outbound Link Click (CTA Button)
  const recordPostLinkClick = useCallback(async (postId: string, creatorId?: string, source: string = 'post_detail'): Promise<boolean> => {
    if (!postId) return false;

    const targetPost = posts.find(p => p.id === postId);
    const resolvedCreatorId = creatorId || targetPost?.creatorId;

    // Dispatch GA4 Link Click Event (non-blocking)
    trackLinkClick(postId, resolvedCreatorId, source);

    if (isFirebaseConnected && !isMockMode) {
      // Optimistically increment post linkClicksCount
      setPosts(prev =>
        prev.map(p => {
          if (p.id !== postId) return p;
          return {
            ...p,
            linkClicksCount: (p.linkClicksCount || 0) + 1,
          };
        })
      );

      try {
        const success = await recordFirestorePostLinkClick(postId, resolvedCreatorId);
        if (!success) {
          // Rollback optimistic increment if Firestore write was not successful
          setPosts(prev =>
            prev.map(p => {
              if (p.id !== postId) return p;
              return {
                ...p,
                linkClicksCount: Math.max(0, (p.linkClicksCount || 1) - 1),
              };
            })
          );
          return false;
        }
        return true;
      } catch (err) {
        console.warn('Could not record post link click in Firestore:', err);
        // Rollback optimistic increment on error
        setPosts(prev =>
          prev.map(p => {
            if (p.id !== postId) return p;
            return {
              ...p,
              linkClicksCount: Math.max(0, (p.linkClicksCount || 1) - 1),
            };
          })
        );
        return false;
      }
    } else {
      setPosts(prev =>
        prev.map(p => {
          if (p.id !== postId) return p;
          return {
            ...p,
            linkClicksCount: (p.linkClicksCount || 0) + 1,
          };
        })
      );
      recordDailyAnalyticsBucket(postId, resolvedCreatorId, undefined, 'linkClick').catch(() => {});
      return true;
    }
  }, [posts, isFirebaseConnected, isMockMode]);

  return (
    <AppContext.Provider
      value={{
        posts,
        users,
        currentUser,
        isAuthLoading,
        isLoadingPosts,
        isLoadingMore,
        hasMorePosts,
        postsError,
        searchResults,
        isSearching,
        searchError,
        collections,
        categories,
        comments,
        notifications,
        unreadNotificationsCount,
        savedPostIds,
        likedPostIds,
        followingUserIds,
        activeCategory,
        searchQuery,
        theme,
        activeRoute,
        previousRoute,
        selectedPostId,
        isCreateModalOpen,
        isAuthModalOpen,
        authModalTab,
        isSaveModalOpen,
        postToSave,
        isFirebaseConnected,
        isMockMode,
        navigateTo,
        openPostDetail,
        closePostDetail,
        setCategory,
        setSearch,
        executeSearch,
        toggleTheme,
        toggleLikePost,
        toggleFollowUser,
        openSaveModal,
        closeSaveModal,
        savePostToCollection,
        removePostFromCollection,
        createCollection,
        deleteCollection,
        createPost,
        deletePost,
        toggleFeaturedPost,
        addComment,
        deleteComment,
        markNotificationAsRead,
        markAllNotificationsAsRead,
        loadMorePosts,
        refreshPosts,
        retryLoadPosts,
        openCreateModal,
        closeCreateModal,
        openAuthModal,
        closeAuthModal,
        loginUser,
        updateUserProfile,
        logoutUser,
        getUserByUsername,
        getUserById,
        getPostById,
        getCollectionsByUserId,
        recordPostView,
        recordPostImpression,
        recordPostLinkClick,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
