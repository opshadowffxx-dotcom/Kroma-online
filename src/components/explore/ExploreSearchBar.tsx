import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Avatar } from '../common/Avatar';
import { searchFirestorePosts } from '../../services/firebase/postService';
import { rankPostsByRelevance } from '../../utils/searchEngine';
import { buildRelatedQueries } from '../../utils/relatedQueries';
import { Post } from '../../types';
import { Search, X, Clock, ArrowRight, Flame, Compass } from 'lucide-react';

interface ExploreSearchBarProps {
  onSearchSubmit: (query: string) => void;
  recentSearches: string[];
  popularTerms: string[];
  isRealPopularity?: boolean;
}

// In-memory 60s cache for autocomplete candidate post fetches
const autocompleteCandidateCache = new Map<string, { posts: Post[]; timestamp: number }>();
const CACHE_TTL_MS = 60000;

export const ExploreSearchBar: React.FC<ExploreSearchBarProps> = ({
  onSearchSubmit,
  recentSearches,
  popularTerms,
  isRealPopularity = false,
}) => {
  const {
    searchQuery,
    navigateTo,
    users,
    posts,
    openPostDetail,
    isMockMode,
    isFirebaseConnected,
  } = useApp();

  const [inputVal, setInputVal] = useState(searchQuery || '');
  const [isFocused, setIsFocused] = useState(false);
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

  // Sync if external search changes
  useEffect(() => {
    setInputVal(searchQuery || '');
  }, [searchQuery]);

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

  // Debounced search suggestion engine with in-memory caching
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

        // Check in-memory cache to minimize read requests
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

        // Deterministic related query suggestions derived strictly from candidate post content
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
          // Strictly top 3-4 posts ranked by existing organic search relevance
          posts: matchedPosts.slice(0, 4),
          relatedQueries: derivedQueries,
          creators: matchedCreators,
        });
      } catch (err) {
        console.warn('Explore live search error:', err);
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = inputVal.trim();
    if (clean) {
      setIsFocused(false);
      onSearchSubmit(clean);
    }
  };

  const handleClear = () => {
    setInputVal('');
    setIsFocused(false);
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-3xl mx-auto">
      {/* Primary Search Bar */}
      <form onSubmit={handleSubmit} className="relative w-full">
        <div className="relative flex items-center">
          <Search className="absolute left-4 w-4 sm:w-5 h-4 sm:h-5 text-text-muted pointer-events-none" />
          <input
            ref={inputRef}
            id="explore-search-input"
            type="text"
            value={inputVal}
            onFocus={() => setIsFocused(true)}
            onChange={e => {
              setInputVal(e.target.value);
              setIsFocused(true);
            }}
            placeholder="Search visuals, styles, ideas…"
            className="w-full pl-11 sm:pl-12 pr-11 sm:pr-12 py-3 sm:py-3.5 rounded-2xl bg-surface border border-border text-sm sm:text-base text-text-primary placeholder-text-muted shadow-soft hover:border-border-strong focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
            aria-label="Search visuals, styles, ideas"
          />
          {inputVal && (
            <button
              type="button"
              id="explore-clear-search-btn"
              onClick={handleClear}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </form>

      {/* Autocomplete / Live Suggestions Overlay */}
      {isFocused && (
        <div
          id="explore-search-dropdown"
          className="absolute top-full left-0 right-0 mt-2 rounded-2xl bg-surface border border-border shadow-premium p-3.5 z-50 max-h-[70vh] overflow-y-auto animate-in fade-in zoom-in-95"
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
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">
                    <Clock className="w-3 h-3" />
                    <span>Recent Searches</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {recentSearches.slice(0, 6).map(query => (
                      <button
                        key={query}
                        type="button"
                        onClick={() => {
                          setIsFocused(false);
                          onSearchSubmit(query);
                        }}
                        className="px-3 py-1.5 rounded-full bg-surface-elevated text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-border transition-colors cursor-pointer"
                      >
                        {query}
                      </button>
                    ))}
                  </div>
                </div>
              ) : isRealPopularity && popularTerms.length > 0 ? (
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">
                    <Flame className="w-3.5 h-3.5 text-accent" />
                    <span>Popular Searches</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {popularTerms.slice(0, 6).map(term => (
                      <button
                        key={term}
                        type="button"
                        onClick={() => {
                          setIsFocused(false);
                          onSearchSubmit(term);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-elevated text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-border transition-colors cursor-pointer"
                      >
                        <Search className="w-3 h-3 text-text-muted" />
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
                id="btn-explore-quick-submit"
                onClick={() => {
                  setIsFocused(false);
                  onSearchSubmit(inputVal.trim());
                }}
                className="w-full flex items-center justify-between p-2.5 rounded-xl bg-surface-elevated hover:bg-border text-left transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-2.5 text-xs sm:text-sm font-semibold text-text-primary">
                  <Search className="w-4 h-4 text-text-muted group-hover:text-accent transition-colors" />
                  <span>
                    Search for <span className="underline decoration-accent">"{inputVal.trim()}"</span>
                  </span>
                </div>
                <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
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
                        onClick={() => {
                          setIsFocused(false);
                          onSearchSubmit(item);
                        }}
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
                        <div className="w-11 h-11 rounded-lg overflow-hidden bg-surface-elevated shrink-0 border border-border">
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
                        <Avatar
                          src={creator.avatarUrl}
                          alt={creator.displayName}
                          size="xs"
                        />
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
                    <p className="text-xs font-medium text-text-secondary">
                      No matching visuals found for "{inputVal.trim()}"
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setIsFocused(false);
                        onSearchSubmit(inputVal.trim());
                      }}
                      className="px-4 py-1.5 rounded-full bg-accent hover:bg-accent-hover text-white text-xs font-semibold transition-colors cursor-pointer shadow-soft"
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
