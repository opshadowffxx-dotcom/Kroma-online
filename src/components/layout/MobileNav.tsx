import React from 'react';
import { useApp } from '../../context/AppContext';
import { Home, Search, Plus, Bookmark, User as UserIcon } from 'lucide-react';
import { Avatar } from '../common/Avatar';

export const MobileNav: React.FC = () => {
  const { activeRoute, navigateTo, openCreateModal, currentUser, openAuthModal } = useApp();

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-surface/95 backdrop-blur-lg border-t border-border px-4 py-2 flex items-center justify-around safe-area-bottom">
      {/* Home */}
      <button
        id="mobile-nav-home"
        onClick={() => navigateTo({ type: 'home' })}
        className={`flex flex-col items-center gap-1 p-1 text-xs font-medium cursor-pointer ${
          activeRoute.type === 'home'
            ? 'text-accent font-semibold'
            : 'text-text-secondary hover:text-text-primary'
        }`}
      >
        <Home className="w-5 h-5" />
        <span className="text-[10px]">Discover</span>
      </button>

      {/* Search */}
      <button
        id="mobile-nav-explore"
        onClick={() => navigateTo({ type: 'explore' })}
        className={`flex flex-col items-center gap-1 p-1 text-xs font-medium cursor-pointer ${
          activeRoute.type === 'explore'
            ? 'text-accent font-semibold'
            : 'text-text-secondary hover:text-text-primary'
        }`}
      >
        <Search className="w-5 h-5" />
        <span className="text-[10px]">Search</span>
      </button>

      {/* Create Trigger */}
      <button
        id="mobile-nav-create"
        onClick={openCreateModal}
        className="w-10 h-10 -mt-3 rounded-full bg-accent text-white flex items-center justify-center shadow-elevated active:scale-95 transition-transform cursor-pointer"
        aria-label="Create Post"
      >
        <Plus className="w-5 h-5 stroke-[2.5]" />
      </button>

      {/* Collections */}
      <button
        id="mobile-nav-collections"
        onClick={() => navigateTo({ type: 'collections' })}
        className={`flex flex-col items-center gap-1 p-1 text-xs font-medium cursor-pointer ${
          activeRoute.type === 'collections' || activeRoute.type === 'collection-detail'
            ? 'text-accent font-semibold'
            : 'text-text-secondary hover:text-text-primary'
        }`}
      >
        <Bookmark className="w-5 h-5" />
        <span className="text-[10px]">Saved</span>
      </button>

      {/* Profile */}
      <button
        id="mobile-nav-profile"
        onClick={() => {
          if (currentUser) {
            navigateTo({ type: 'profile', username: currentUser.username });
          } else {
            openAuthModal('login');
          }
        }}
        className={`flex flex-col items-center gap-1 p-1 text-xs font-medium cursor-pointer ${
          activeRoute.type === 'profile'
            ? 'text-accent font-semibold'
            : 'text-text-secondary hover:text-text-primary'
        }`}
      >
        {currentUser ? (
          <Avatar src={currentUser.avatarUrl} alt={currentUser.displayName} size="xs" />
        ) : (
          <UserIcon className="w-5 h-5" />
        )}
        <span className="text-[10px]">Profile</span>
      </button>
    </div>
  );
};
