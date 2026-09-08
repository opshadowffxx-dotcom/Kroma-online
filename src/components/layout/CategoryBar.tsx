import React, { useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export const CategoryBar: React.FC = () => {
  const { categories, activeCategory, setCategory } = useApp();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleScroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const offset = direction === 'left' ? -240 : 240;
      scrollContainerRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };

  return (
    <div className="sticky top-14 sm:top-16 z-20 bg-bg/90 backdrop-blur-md border-b border-border py-2 sm:py-3 transition-colors">
      <div className="w-full max-w-[1920px] mx-auto px-3.5 sm:px-6 lg:px-8 xl:px-10 relative flex items-center">
        {/* Scroll Left Button */}
        <button
          id="btn-category-scroll-left"
          onClick={() => handleScroll('left')}
          className="hidden md:flex absolute left-2 z-10 w-7 h-7 rounded-full bg-surface shadow-soft border border-border items-center justify-center text-text-secondary hover:text-text-primary cursor-pointer transition-colors"
          aria-label="Scroll categories left"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Scrollable Container */}
        <div
          ref={scrollContainerRef}
          className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth w-full px-1"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {categories.map(category => {
            const isActive = activeCategory === category.slug;
            return (
              <button
                key={category.id}
                id={`btn-category-${category.slug}`}
                onClick={() => setCategory(category.slug)}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-xs transition-all duration-200 cursor-pointer ${
                  isActive
                    ? 'bg-accent text-white font-semibold shadow-soft'
                    : 'bg-surface-elevated text-text-secondary font-medium hover:bg-border hover:text-text-primary'
                }`}
              >
                {category.name}
              </button>
            );
          })}
        </div>

        {/* Scroll Right Button */}
        <button
          id="btn-category-scroll-right"
          onClick={() => handleScroll('right')}
          className="hidden md:flex absolute right-2 z-10 w-7 h-7 rounded-full bg-surface shadow-soft border border-border items-center justify-center text-text-secondary hover:text-text-primary cursor-pointer transition-colors"
          aria-label="Scroll categories right"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
