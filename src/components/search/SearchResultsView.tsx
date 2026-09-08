import React, { useMemo, useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { MasonryFeed } from '../feed/MasonryFeed';
import { findGroundedRelatedQueries } from '../../utils/relatedQueries';
import { fetchRealPopularSearches } from '../../services/firebase/searchAnalyticsService';
import { Search, SearchX, RefreshCw, AlertCircle } from 'lucide-react';

export const SearchResultsView: React.FC = () => {
  const {
    searchQuery,
    setSearch,
    searchResults,
    isSearching,
    searchError,
    executeSearch,
    posts,
    navigateTo,
  } = useApp();

  const [realPopularTerms, setRealPopularTerms] = useState<string[]>([]);

  // Trigger search on mount or when searchQuery changes
  useEffect(() => {
    if (searchQuery.trim()) {
      executeSearch(searchQuery.trim());
    }
  }, [searchQuery, executeSearch]);

  // Query real aggregate search terms if available for authentic suggestion ranking
  useEffect(() => {
    fetchRealPopularSearches(10).then(terms => {
      if (terms && terms.length > 0) {
        setRealPopularTerms(terms);
      }
    });
  }, []);

  // Organic relevance-ranked results from KROMA search engine
  const displayPosts = useMemo(() => {
    return searchResults || [];
  }, [searchResults]);

  // Strictly content-grounded related queries derived from real post metadata or authentic search volume
  // Zero generic fallback chips or artificial expansions.
  const groundedRelatedQueries = useMemo(() => {
    if (!searchQuery.trim() || displayPosts.length > 0) {
      return [];
    }
    return findGroundedRelatedQueries(searchQuery, posts, realPopularTerms, 5);
  }, [searchQuery, displayPosts.length, posts, realPopularTerms]);

  return (
    <div id="search-results-view" className="w-full max-w-[1920px] mx-auto px-3.5 sm:px-6 lg:px-8 xl:px-10 py-5 sm:py-6 space-y-5 sm:space-y-6">
      {/* Search Header */}
      <div id="search-results-header" className="border-b border-border pb-4 sm:pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
            <Search className="w-3.5 h-3.5 text-accent" />
            <span>Search</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-text-primary tracking-tight break-words">
            {searchQuery ? `"${searchQuery}"` : 'All Visuals'}
          </h1>
          <p className="text-xs sm:text-sm text-text-muted pt-0.5">
            {isSearching ? (
              <span className="inline-flex items-center gap-1.5 text-text-muted">
                <RefreshCw className="w-3 h-3 animate-spin text-accent" /> Searching...
              </span>
            ) : (
              `Found ${displayPosts.length} ${displayPosts.length === 1 ? 'result' : 'results'}`
            )}
          </p>
        </div>
      </div>

      {/* Error state */}
      {searchError && (
        <div
          id="search-error-banner"
          className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs sm:text-sm"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
            <span>{searchError}</span>
          </div>
          <button
            id="btn-retry-search"
            onClick={() => executeSearch(searchQuery.trim())}
            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-medium text-xs transition-colors shrink-0 cursor-pointer"
          >
            Retry Search
          </button>
        </div>
      )}

      {/* Loading state indicator */}
      {isSearching && (
        <div className="py-16 text-center text-xs text-text-muted flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-accent" />
          <span>Searching visuals...</span>
        </div>
      )}

      {/* Zero Results State: Truthful and strictly content-grounded */}
      {!isSearching && displayPosts.length === 0 && (
        <>
          {groundedRelatedQueries.length > 0 ? (
            /* Case: No direct matching posts, but authentic related terms exist in post metadata */
            <div
              id="search-empty-state-related"
              className="max-w-md mx-auto py-16 px-4 text-center animate-in fade-in"
            >
              <div className="w-12 h-12 rounded-2xl bg-surface-elevated flex items-center justify-center mx-auto mb-3 text-accent shadow-soft border border-border">
                <SearchX className="w-5 h-5 text-accent" />
              </div>
              <h3 className="text-base font-semibold text-text-primary mb-1">
                No exact posts found
              </h3>
              <p className="text-xs text-text-secondary mb-6 leading-relaxed">
                We couldn't find any exact posts for "{searchQuery}".
              </p>

              {/* Related searches section (strictly grounded in actual KROMA data) */}
              <div className="space-y-2.5">
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                  Related searches
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {groundedRelatedQueries.map(term => (
                    <button
                      key={term}
                      type="button"
                      id={`btn-related-${term.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                      onClick={() => setSearch(term)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium bg-surface-elevated border border-border text-text-primary hover:border-accent hover:text-accent transition-colors cursor-pointer shadow-soft"
                    >
                      <Search className="w-3 h-3 text-accent" />
                      <span>{term}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Case: Clean, truthful zero-result empty state with no generic chips */
            <div
              id="search-empty-state-no-results"
              className="max-w-md mx-auto py-16 px-4 text-center animate-in fade-in"
            >
              <div className="w-12 h-12 rounded-2xl bg-surface-elevated flex items-center justify-center mx-auto mb-3 text-accent shadow-soft border border-border">
                <SearchX className="w-5 h-5 text-accent" />
              </div>
              <h3 className="text-base font-semibold text-text-primary mb-1">
                No posts found
              </h3>
              <p className="text-xs text-text-secondary mb-6 leading-relaxed">
                We couldn't find any posts for "{searchQuery}". Try another keyword or check your spelling.
              </p>
              <div>
                <button
                  type="button"
                  id="btn-back-to-search"
                  onClick={() => navigateTo({ type: 'explore' })}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent hover:bg-accent-hover text-white font-medium text-xs shadow-soft cursor-pointer transition-colors"
                >
                  <Search className="w-4 h-4 text-white" />
                  <span>Explore all visuals</span>
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Matching Posts Grid (Only rendered when matches exist) */}
      {!isSearching && displayPosts.length > 0 && (
        <MasonryFeed posts={displayPosts} discoverySource="search" />
      )}
    </div>
  );
};


