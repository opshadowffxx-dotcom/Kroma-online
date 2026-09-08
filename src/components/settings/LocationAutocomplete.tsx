import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Loader2, X, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { searchCities, CityLocation } from '../../services/locationService';

export interface LocationAutocompleteProps {
  value: string;
  onChange: (validatedLocation: string, isValid: boolean) => void;
  placeholder?: string;
  id?: string;
  hasError?: boolean;
}

export const LocationAutocomplete: React.FC<LocationAutocompleteProps> = ({
  value,
  onChange,
  placeholder = 'Search city or country (e.g. London, United Kingdom)',
  id = 'input-location-autocomplete',
  hasError = false,
}) => {
  const [inputValue, setInputValue] = useState(value);
  const [selectedLocation, setSelectedLocation] = useState(value);
  const [suggestions, setSuggestions] = useState<CityLocation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const latestQueryRef = useRef<string>('');

  // Sync internal state when external value changes
  useEffect(() => {
    setInputValue(value);
    setSelectedLocation(value);
  }, [value]);

  // Handle outside clicks to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Perform search with abort controller
  const executeSearch = useCallback(async (query: string) => {
    const cleanQuery = query.trim();
    latestQueryRef.current = cleanQuery;

    if (cleanQuery.length < 2) {
      setSuggestions([]);
      setIsLoading(false);
      setHasSearched(false);
      setSearchError(null);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setSearchError(null);
    setHasSearched(false);

    try {
      const results = await searchCities(cleanQuery, controller.signal);
      if (latestQueryRef.current === cleanQuery) {
        setSuggestions(results);
        setIsOpen(true);
        setHighlightedIndex(-1);
        setHasSearched(true);
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        if (latestQueryRef.current === cleanQuery) {
          setSearchError('Could not load locations. Tap retry to try again.');
          setSuggestions([]);
          setHasSearched(true);
        }
      }
    } finally {
      if (latestQueryRef.current === cleanQuery) {
        setIsLoading(false);
      }
    }
  }, []);

  // Debounced search logic (300ms)
  useEffect(() => {
    const query = inputValue.trim();

    // If empty, clear suggestions and don't search
    if (query.length === 0) {
      setSuggestions([]);
      setIsLoading(false);
      setHasSearched(false);
      setSearchError(null);
      return;
    }

    // If input matches currently selected valid location, do not search
    if (selectedLocation && query.toLowerCase() === selectedLocation.trim().toLowerCase()) {
      setIsLoading(false);
      return;
    }

    if (query.length < 2) {
      setSuggestions([]);
      setIsLoading(false);
      setHasSearched(false);
      return;
    }

    setIsLoading(true);
    const timer = setTimeout(() => {
      executeSearch(query);
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [inputValue, selectedLocation, executeSearch]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setInputValue(newVal);
    setIsOpen(true);

    const trimmed = newVal.trim();

    // 1. Cleared input: optional field, valid empty
    if (trimmed === '') {
      setSelectedLocation('');
      onChange('', true);
      setSuggestions([]);
      setHasSearched(false);
      setSearchError(null);
      return;
    }

    // 2. User typed back the exact selected location
    if (selectedLocation && trimmed.toLowerCase() === selectedLocation.trim().toLowerCase()) {
      onChange(selectedLocation, true);
      return;
    }

    // 3. User edited text after a selection: INVALIDATE until a real suggestion is chosen
    setSelectedLocation('');
    onChange('', false); // raw typed text is never valid
  };

  const handleSelectSuggestion = (suggestion: CityLocation) => {
    setInputValue(suggestion.displayName);
    setSelectedLocation(suggestion.displayName);
    onChange(suggestion.displayName, true);
    setIsOpen(false);
    setSuggestions([]);
    setSearchError(null);
  };

  const handleClear = () => {
    setInputValue('');
    setSelectedLocation('');
    onChange('', true); // cleared is valid
    setSuggestions([]);
    setIsOpen(false);
    setSearchError(null);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if ((e.key === 'ArrowDown' || e.key === 'Enter') && suggestions.length > 0) {
        e.preventDefault();
        setIsOpen(true);
        setHighlightedIndex(0);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (suggestions.length > 0) {
        setHighlightedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (suggestions.length > 0) {
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
      }
    } else if (e.key === 'Enter') {
      // If a suggestion is highlighted, select it
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        e.preventDefault();
        handleSelectSuggestion(suggestions[highlightedIndex]);
      } else if (suggestions.length > 0) {
        // Default select first suggestion if enter is pressed
        e.preventDefault();
        handleSelectSuggestion(suggestions[0]);
      } else {
        // Prevent form submission on raw unvalidated input
        e.preventDefault();
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const isCurrentSelection = (displayName: string) => {
    return (
      Boolean(selectedLocation) &&
      selectedLocation.trim().toLowerCase() === displayName.trim().toLowerCase()
    );
  };

  return (
    <div ref={containerRef} id="location-autocomplete-container" className="relative w-full">
      <div className="relative flex items-center">
        <MapPin className="absolute left-3.5 w-4 h-4 text-text-muted pointer-events-none" />
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-invalid={hasError}
          className={`w-full pl-10 pr-9 py-2 rounded-xl bg-surface-elevated border text-text-primary placeholder-text-muted text-xs focus:outline-none focus:ring-2 transition-all ${
            hasError
              ? 'border-rose-500 focus:ring-rose-500/30'
              : 'border-border focus:ring-accent'
          }`}
        />
        {isLoading ? (
          <div className="absolute right-3 flex items-center pointer-events-none">
            <Loader2 className="w-3.5 h-3.5 text-accent animate-spin" />
          </div>
        ) : inputValue ? (
          <button
            type="button"
            id="btn-clear-location"
            onClick={handleClear}
            className="absolute right-3 p-1 rounded-full hover:bg-surface text-text-muted hover:text-text-primary transition-colors cursor-pointer"
            aria-label="Clear location"
            title="Clear location"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : null}
      </div>

      {/* Suggestion Dropdown */}
      {isOpen && (
        <div
          id="location-suggestions-dropdown"
          className="absolute left-0 right-0 top-full mt-1.5 z-50 max-h-64 sm:max-h-72 overflow-y-auto rounded-2xl bg-surface border border-border shadow-premium py-1.5 animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Loading state */}
          {isLoading && suggestions.length === 0 ? (
            <div className="px-4 py-3 text-xs text-text-muted flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
              <span>Searching cities worldwide...</span>
            </div>
          ) : searchError ? (
            /* Error state with retry */
            <div className="px-4 py-3 text-xs space-y-2">
              <div className="flex items-center gap-2 text-rose-500">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{searchError}</span>
              </div>
              <button
                type="button"
                id="btn-retry-location-search"
                onClick={() => executeSearch(inputValue)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-surface-elevated hover:bg-surface-elevated/80 text-text-primary text-[11px] font-medium border border-border cursor-pointer transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Retry search</span>
              </button>
            </div>
          ) : suggestions.length > 0 ? (
            /* Suggestions list */
            suggestions.map((suggestion, index) => {
              const isSelected = isCurrentSelection(suggestion.displayName);
              const isHighlighted = index === highlightedIndex;

              return (
                <button
                  key={suggestion.id}
                  type="button"
                  id={`suggestion-item-${index}`}
                  onClick={() => handleSelectSuggestion(suggestion)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`w-full px-3.5 py-2.5 text-left text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                    isHighlighted || isSelected
                      ? 'bg-surface-elevated text-text-primary font-medium'
                      : 'text-text-secondary hover:bg-surface-elevated'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <MapPin className="w-3.5 h-3.5 text-text-muted shrink-0" />
                    <div className="truncate">
                      <span className="font-semibold text-text-primary">
                        {suggestion.city}
                      </span>
                      {suggestion.country && suggestion.country !== suggestion.city && (
                        <span className="text-text-muted ml-1 font-normal">
                          , {suggestion.country}
                        </span>
                      )}
                    </div>
                  </div>
                  {isSelected && (
                    <Check className="w-3.5 h-3.5 text-accent shrink-0 stroke-[2.5]" />
                  )}
                </button>
              );
            })
          ) : hasSearched ? (
            /* No results state */
            <div className="px-4 py-3 text-xs text-text-muted text-center">
              No matching locations found
            </div>
          ) : (
            /* Empty prompt before typing */
            <div className="px-4 py-3 text-xs text-text-muted flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-accent shrink-0" />
              <span>Start typing a city or country</span>
            </div>
          )}

          <div className="px-3.5 py-1.5 border-t border-border text-[10px] text-text-muted flex items-center justify-between">
            <span>Global city & country search</span>
            <span className="font-mono text-[9px]">Open-Meteo</span>
          </div>
        </div>
      )}
    </div>
  );
};
