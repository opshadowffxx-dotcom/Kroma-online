import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { ExploreSearchBar } from './ExploreSearchBar';
import {
  getRecentSearches,
  deleteRecentSearch,
  clearAllRecentSearches,
  saveRecentSearch,
} from '../../utils/recentSearches';
import {
  recordCommittedSearch,
  fetchRealPopularSearches,
} from '../../services/firebase/searchAnalyticsService';
import { Clock, Flame, Compass, X } from 'lucide-react';

// Suggested discovery search terms (natural phrases without hashtag prefix)
export const SUGGESTED_SEARCH_TERMS = [
  'Apple Watch',
  'iPhone Wallpaper',
  'Minimalist Logo',
  'Wedding Invitation',
  'Instagram Post Template',
  'App UI Design',
];

// Alias for backwards compatibility
export const POPULAR_SEARCH_TERMS = SUGGESTED_SEARCH_TERMS;
export const CURATED_DISCOVERY_TERMS = SUGGESTED_SEARCH_TERMS;

export const ExploreView: React.FC = () => {
  const { setSearch } = useApp();
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [realPopularTerms, setRealPopularTerms] = useState<string[]>([]);

  // Load recent searches and query aggregate popularity
  useEffect(() => {
    setRecentSearches(getRecentSearches());
    fetchRealPopularSearches(6).then(terms => {
      if (terms && terms.length > 0) {
        setRealPopularTerms(terms);
      }
    });
  }, []);

  const handleSearchSubmit = useCallback((query: string) => {
    const clean = query.trim();
    if (!clean) return;

    // Save locally
    const updated = saveRecentSearch(clean);
    setRecentSearches(updated);

    // Record committed search in aggregate popularity service (one write per committed search)
    recordCommittedSearch(clean);

    // Execute search
    setSearch(clean);
  }, [setSearch]);

  const handleDeleteRecent = useCallback((query: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = deleteRecentSearch(query);
    setRecentSearches(updated);
  }, []);

  const handleClearAllRecent = useCallback(() => {
    clearAllRecentSearches();
    setRecentSearches([]);
  }, []);

  const hasRealPopularity = realPopularTerms.length > 0;
  const displayFallbackTerms = hasRealPopularity ? realPopularTerms : SUGGESTED_SEARCH_TERMS;

  return (
    <div className="w-full max-w-[1920px] mx-auto px-3.5 sm:px-6 lg:px-8 xl:px-10 py-6 sm:py-10">
      {/* Primary Search Interface */}
      <section className="space-y-5 max-w-3xl mx-auto pt-2">
        <ExploreSearchBar
          onSearchSubmit={handleSearchSubmit}
          recentSearches={recentSearches}
          popularTerms={displayFallbackTerms}
          isRealPopularity={hasRealPopularity}
        />

        {/* Recent Searches (if available) OR Truthful Popular / Explore Topics */}
        <div>
          {recentSearches.length > 0 ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
                  <Clock className="w-3.5 h-3.5 text-text-muted" />
                  <span>Recent searches</span>
                </div>
                <button
                  type="button"
                  id="btn-clear-all-recent"
                  onClick={handleClearAllRecent}
                  className="text-[11px] font-medium text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                >
                  Clear all
                </button>
              </div>

              {/* Wrapping chips on all screen sizes */}
              <div className="flex flex-wrap items-center gap-2 py-0.5">
                {recentSearches.map(term => (
                  <div
                    key={term}
                    id={`recent-search-${term.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                    onClick={() => handleSearchSubmit(term)}
                    className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-surface border border-border text-text-primary hover:bg-surface-elevated transition-all shrink-0 cursor-pointer shadow-soft"
                  >
                    <span className="truncate max-w-[200px]">{term}</span>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteRecent(term, e)}
                      className="p-0.5 rounded-full text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                      aria-label={`Remove ${term} from recent searches`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : hasRealPopularity && realPopularTerms.length > 0 ? (
            /* Truthfully labelled: "Popular searches" only when real volume exists */
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
                <Flame className="w-3.5 h-3.5 text-accent" />
                <span>Popular searches</span>
              </div>

              <div className="flex flex-wrap items-center gap-2 py-0.5">
                {realPopularTerms.slice(0, 8).map(term => (
                  <button
                    key={term}
                    id={`popular-term-${term.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                    type="button"
                    onClick={() => handleSearchSubmit(term)}
                    className="px-3.5 py-1.5 rounded-full text-xs font-medium bg-surface border border-border text-text-secondary hover:bg-surface-elevated hover:text-text-primary hover:border-border-strong transition-all shrink-0 cursor-pointer shadow-soft active:scale-95"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
};
