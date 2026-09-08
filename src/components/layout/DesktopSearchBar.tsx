import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { Avatar } from '../common/Avatar';
import { searchFirestorePosts } from '../../services/firebase/postService';
import { rankPostsByRelevance } from '../../utils/searchEngine';
import { buildRelatedQueries } from '../../utils/relatedQueries';
import {
  recordCommittedSearch,
  fetchRealPopularSearches,
} from '../../services/firebase/searchAnalyticsService';
import {
  getRecentSearches,
  deleteRecentSearch,
  clearAllRecentSearches,
  saveRecentSearch,
} from '../../utils/recentSearches';
import { POPULAR_SEARCH_TERMS } from '../explore/ExploreView';
import { Post } from '../../types';
import { Search, X, Clock, ArrowRight, Flame, Compass } from 'lucide-react';

// In-memory 60s cache for autocomplete candidate post fetches
const autocompleteCandidateCache = new Map<string, { posts: Post[]; timestamp: number }>();
const CACHE_TTL_MS = 60000;

export const DesktopSearchBar: React.FC = () => {
  const {
    searchQuery,
    setSearch,
    navigateTo,
    users,
    posts,
    openPostDetail,
    isMockMode,
    isFirebaseConnected,
  } = useApp();

  const [inputVal, setInputVal] = useState(searchQuery || '');
  const [isFocused, setIsFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [realPopularTerms, setRealPopularTerms] = useState<string[]>([]);
  const [isLiveLoading, setIsLiveLoading] = useState(false);
  const [liveResults, setLiveResults] = useState<{
    posts: Post[];
    relatedQueries: string[];
    creators: typeof users;
  }>({ posts: [], relatedQueries: [], creators: [] });

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const liveRequestIdRef = useRef<number>(0);

  // Sync with global searchQuery (e.g. if user navigates or clicks a tag)
  useEffect(() => {
    setInputVal(searchQuery || '');
  }, [searchQuery]);

  // Load recent searches and check for real aggregate popular queries
  useEffect(() => {
    if (isFocused) {
      setRecentSearches(getRecentSearches());
      fetchRealPopularSearches(6).then(terms => {
        if (terms && terms.length > 0) {
          setRealPopularTerms(terms);
        }
      });
    }
  }, [isFocused]);

  // Click outside and Escape key listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFocused(false);
        inputRef.current?.blur();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Debounced search suggestion and related queries engine
  useEffect(() => {
    const queryText = inputVal.trim();

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (queryText.length < 2) {
      setLiveResults({ posts: [], relatedQueries: [], creators: [] });
      setIsLiveLoading(false);
      return;
    }

    setIsLiveLoading(true);

    debounceTimerRef.current = setTimeout(async () => {
      const requestId = ++liveRequestIdRef.current;
      try {
        let matchedPosts: Post[] = [];
        const normKey = queryText.toLowerCase();

        // Check in-memory cache first to eliminate redundant Firestore queries
        const cached = autocompleteCandidateCache.get(normKey);
        const now = Date.now();
        if (cached && now - cached.timestamp < CACHE_TTL_MS) {
          matchedPosts = cached.posts;
        } else {
          if (isMockMode || !isFirebaseConnected) {
            matchedPosts = rankPostsByRelevance(posts, queryText);
          } else {
            matchedPosts = await searchFirestorePosts(queryText, undefined, 8);
          }
          autocompleteCandidateCache.set(normKey, { posts: matchedPosts, timestamp: now });
        }

        if (requestId !== liveRequestIdRef.current) return;

        const termLower = queryText.toLowerCase();

        // Deterministic related query suggestions derived strictly from matched post content
        const derivedQueries = buildRelatedQueries(queryText, matchedPosts, 6);

        // Matching creators
        const matchedCreators = users
          .filter(
            u =>
              u.displayName.toLowerCase().includes(termLower) ||
              u.username.toLowerCase().includes(termLower)
          )
          .slice(0, 3);

        setLiveResults({
          // Strictly 3-4 top posts ranked by existing organic relevance
          posts: matchedPosts.slice(0, 4),
          relatedQueries: derivedQueries,
          creators: matchedCreators,
        });
      } catch (err) {
        console.warn('Desktop live search error:', err);
      } finally {
        if (requestId === liveRequestIdRef.current) {
          setIsLiveLoading(false);
        }
      }
    }, 220);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [inputVal, posts, users, isMockMode, isFirebaseConnected]);

  // Handle committed search: updates recent searches, logs aggregate popularity, runs search
  const handleSearchSubmit = useCallback(
    (query: string) => {
      const clean = query.trim();
      if (!clean) return;
      setIsFocused(false);

      // Local recent searches
      const updated = saveRecentSearch(clean);
      setRecentSearches(updated);

      // Non-blocking aggregate popularity write (committed search only, never on keystroke)
      recordCommittedSearch(clean);

      // Execute global search
      setSearch(clean);
    },
    [setSearch]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputVal.trim()) {
      handleSearchSubmit(inputVal);
    }
  };

  const handleClear = () => {
    setInputVal('');
    inputRef.current?.focus();
  };

  const handleDeleteRecent = (query: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = deleteRecentSearch(query);
    setRecentSearches(updated);
  };

  const handleClearAllRecent = (e: React.MouseEvent) => {
    e.stopPropagation();
    clearAllRecentSearches();
    setRecentSearches([]);
  };

  return (
    <div
      ref={containerRef}
      className="hidden lg:flex flex-1 max-w-2xl mx-4 xl:mx-8 relative items-center"
    >
      {/* Primary Search Bar */}
      <form onSubmit={handleSubmit} className="relative w-full">
        <div className="relative flex items-center">
          <Search className="absolute left-3.5 w-4 h-4 text-text-muted pointer-events-none" />
          <input
            ref={inputRef}
            id="desktop-search-input"
            type="text"
            value={inputVal}
            onFocus={() => setIsFocused(true)}
            onChange={e => {
              setInputVal(e.target.value);
              setIsFocused(true);
            }}
            placeholder="Search visuals, ideas, styles..."
            className="w-full pl-10 pr-9 py-2 rounded-full bg-surface-elevated border border-border text-xs sm:text-sm text-text-primary placeholder-text-muted shadow-soft hover:border-text-muted/40 focus:outline-none focus:bg-surface focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
            aria-label="Search visuals, ideas, styles"
          />
          {inputVal && (
            <button
              type="button"
              id="desktop-clear-search-btn"
              onClick={handleClear}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
              aria-label="Clear search query"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </form>

      {/* Dropdown Panel anchored below search input */}
      {isFocused && (
        <div
          id="desktop-search-dropdown"
          className="absolute top-full left-0 right-0 mt-2 rounded-2xl bg-surface border border-border shadow-elevated p-3.5 z-50 max-h-[75vh] overflow-y-auto animate-in fade-in zoom-in-95"
        >
          {/* Loading Indicator */}
          {isLiveLoading && (
            <div className="flex items-center justify-center py-6 text-xs text-text-muted gap-2">
              <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <span>Searching suggestions...</span>
            </div>
          )}

          {/* Initial State (< 2 characters): Recent Searches or Truthful Topic Suggestions */}
          {!isLiveLoading && inputVal.trim().length < 2 && (
            <div className="space-y-3 p-1">
              {recentSearches.length > 0 ? (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-text-muted uppercase tracking-wider">
                      <Clock className="w-3 h-3" />
                      <span>Recent Searches</span>
                    </div>
                    <button
                      type="button"
                      id="btn-desktop-clear-all-recent"
                      onClick={handleClearAllRecent}
                      className="text-[11px] font-medium text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                    >
                      Clear all
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {recentSearches.slice(0, 8).map(query => (
                      <div
                        key={query}
                        onClick={() => handleSearchSubmit(query)}
                        className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-elevated text-xs font-medium text-text-primary hover:bg-border transition-colors cursor-pointer"
                      >
                        <span className="truncate max-w-[220px]">{query}</span>
                        <button
                          type="button"
                          onClick={e => handleDeleteRecent(query, e)}
                          className="p-0.5 rounded-full text-text-muted hover:text-text-primary transition-colors"
                          aria-label={`Remove ${query}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : realPopularTerms.length > 0 ? (
                /* Truthful Popular Searches only shown when real aggregate volume exists */
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">
                    <Flame className="w-3.5 h-3.5 text-accent" />
                    <span>Popular Searches</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {realPopularTerms.map(term => (
                      <button
                        key={term}
                        type="button"
                        onClick={() => handleSearchSubmit(term)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-elevated text-xs font-medium text-text-primary hover:bg-border transition-colors cursor-pointer"
                      >
                        <Flame className="w-3 h-3 text-accent" />
                        <span>{term}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* Autocomplete Suggestions (>= 2 characters) */}
          {!isLiveLoading && inputVal.trim().length >= 2 && (
            <div className="space-y-4">
              {/* 1. Quick Submit Row */}
              <button
                type="button"
                id="btn-desktop-quick-submit"
                onClick={() => handleSearchSubmit(inputVal)}
                className="w-full flex items-center justify-between p-2.5 rounded-xl bg-surface-elevated hover:bg-border text-left transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-2.5 text-xs sm:text-sm font-semibold text-text-primary">
                  <Search className="w-4 h-4 text-text-muted group-hover:text-accent" />
                  <span>
                    Search for <span className="underline decoration-accent">"{inputVal.trim()}"</span>
                  </span>
                </div>
                <ArrowRight className="w-4 h-4 text-text-muted group-hover:translate-x-0.5 group-hover:text-accent transition-all" />
              </button>

              {/* 2. Related Searches Section (Content-grounded deterministic suggestions) */}
              {liveResults.relatedQueries.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider px-2 mb-1.5">
                    Related searches
                  </p>
                  <div className="space-y-0.5">
                    {liveResults.relatedQueries.map(item => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => handleSearchSubmit(item)}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-surface-elevated text-xs font-medium text-text-primary text-left transition-colors cursor-pointer group"
                      >
                        <Search className="w-3.5 h-3.5 text-text-muted group-hover:text-accent transition-colors shrink-0" />
                        <span className="truncate">{item}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 3. Posts Preview Section (Strictly "Posts" label, NO numeric count, 3-4 top ranked items) */}
              {liveResults.posts.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider px-2 mb-1.5">
                    Posts
                  </p>
                  <div className="space-y-1">
                    {liveResults.posts.map(post => (
                      <div
                        key={post.id}
                        onClick={() => {
                          setIsFocused(false);
                          openPostDetail(post.id);
                        }}
                        className="flex items-center gap-3 p-2 rounded-xl hover:bg-surface-elevated transition-colors cursor-pointer"
                      >
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-surface-elevated shrink-0 border border-border">
                          <img
                            src={post.thumbnailUrl || post.imageUrl}
                            alt={post.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-text-primary truncate">
                            {post.title}
                          </p>
                          <p className="text-[11px] text-text-secondary truncate">
                            by {post.creator.displayName} •{' '}
                            <span className="capitalize">{post.category}</span>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 4. Creators Matches (if applicable) */}
              {liveResults.creators.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider px-2 mb-1.5">
                    Creators
                  </p>
                  <div className="space-y-1">
                    {liveResults.creators.map(creator => (
                      <div
                        key={creator.id}
                        onClick={() => {
                          setIsFocused(false);
                          navigateTo({ type: 'profile', username: creator.username });
                        }}
                        className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-surface-elevated transition-colors cursor-pointer"
                      >
                        <Avatar src={creator.avatarUrl} alt={creator.displayName} size="xs" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <p className="text-xs font-semibold text-text-primary truncate">
                              {creator.displayName}
                            </p>
                          </div>
                          <p className="text-[11px] text-text-secondary truncate">
                            @{creator.username}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 5. Graceful empty state when no matching content exists */}
              {liveResults.posts.length === 0 &&
                liveResults.relatedQueries.length === 0 &&
                liveResults.creators.length === 0 && (
                  <div className="py-5 text-center space-y-2">
                    <p className="text-xs font-medium text-text-muted">
                      No matching visuals found for "{inputVal.trim()}"
                    </p>
                    <button
                      type="button"
                      onClick={() => handleSearchSubmit(inputVal)}
                      className="px-4 py-1.5 rounded-full bg-accent hover:bg-accent-hover text-white text-xs font-semibold transition-colors shadow-soft cursor-pointer"
                    >
                      Search all results
                    </button>
                  </div>
                )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
