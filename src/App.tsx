import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Navbar } from './components/layout/Navbar';
import { MobileNav } from './components/layout/MobileNav';
import { MasonryFeed } from './components/feed/MasonryFeed';
import { ExploreView } from './components/explore/ExploreView';
import { SearchResultsView } from './components/search/SearchResultsView';
import { CreatorProfileView } from './components/profile/CreatorProfileView';
import { CollectionsView } from './components/collections/CollectionsView';
import { CollectionDetailView } from './components/collections/CollectionDetailView';
import { SettingsView } from './components/settings/SettingsView';
import { AdminDashboardView } from './components/admin/AdminDashboardView';
import { PostDetailView } from './components/post/PostDetailView';
import { PostAnalyticsView } from './components/analytics/PostAnalyticsView';
import { CreatorAnalyticsView } from './components/profile/CreatorAnalyticsView';
import { AnalyticsErrorBoundary } from './components/analytics/AnalyticsErrorBoundary';
import { CreatePostModal } from './components/create/CreatePostModal';
import { AuthModal } from './components/auth/AuthModal';
import { SaveToCollectionModal } from './components/collections/SaveToCollectionModal';
import { BarChart3 } from 'lucide-react';

const AppContent: React.FC = () => {
  const {
    activeRoute,
    posts,
    isLoadingPosts,
    loadMorePosts,
    hasMorePosts,
    isLoadingMore,
    postsError,
    retryLoadPosts,
    currentUser,
    navigateTo,
    openAuthModal,
  } = useApp();

  // Discovery feed posts for the Home route
  const homeFeedPosts = posts;

  return (
    <div className="min-h-screen flex flex-col bg-bg text-text-primary transition-colors pb-20 lg:pb-8 overflow-x-hidden">
      {/* Top Navigation - Excluded on post detail for immersive distraction-free view */}
      {activeRoute.type !== 'post' && <Navbar />}

      {/* Main View Router */}
      <main className="flex-1 w-full overflow-x-hidden">
        {activeRoute.type === 'home' && (
          <div className="pt-0 sm:pt-1">
            {postsError && (
              <div className="w-full max-w-[1920px] mx-auto px-3.5 sm:px-6 lg:px-8 xl:px-10 pt-4 pb-2">
                <div
                  id="feed-error-banner"
                  className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs sm:text-sm"
                >
                  <span>{postsError}</span>
                  <button
                    id="btn-retry-feed"
                    onClick={retryLoadPosts}
                    className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs transition-colors shrink-0 cursor-pointer"
                  >
                    Retry
                  </button>
                </div>
              </div>
            )}
            <MasonryFeed
              posts={homeFeedPosts}
              isLoading={isLoadingPosts}
              onLoadMore={loadMorePosts}
              hasMore={hasMorePosts}
              isLoadingMore={isLoadingMore}
              discoverySource="home"
            />
          </div>
        )}

        {activeRoute.type === 'explore' && <ExploreView />}

        {activeRoute.type === 'search' && <SearchResultsView />}

        {activeRoute.type === 'profile' && (
          <CreatorProfileView username={activeRoute.username} />
        )}

        {activeRoute.type === 'collections' && <CollectionsView />}

        {activeRoute.type === 'collection-detail' && (
          <CollectionDetailView collectionId={activeRoute.collectionId} />
        )}

        {activeRoute.type === 'settings' && <SettingsView />}

        {activeRoute.type === 'admin' && <AdminDashboardView />}

        {activeRoute.type === 'post' && (
          <PostDetailView postId={activeRoute.postId} />
        )}

        {activeRoute.type === 'post-analytics' && (
          <AnalyticsErrorBoundary
            onBack={() => navigateTo({ type: 'post', postId: activeRoute.postId })}
            title="Post Analytics"
          >
            <PostAnalyticsView postId={activeRoute.postId} />
          </AnalyticsErrorBoundary>
        )}

        {activeRoute.type === 'creator-analytics' && (
          currentUser ? (
            <AnalyticsErrorBoundary
              onBack={() => navigateTo({ type: 'profile', username: currentUser.username })}
              title="Creator Analytics"
            >
              <CreatorAnalyticsView
                posts={(posts || []).filter(p => p.creatorId === currentUser.id || p.creator?.id === currentUser.id)}
                onBack={() => navigateTo({ type: 'profile', username: currentUser.username })}
                creator={currentUser}
                totalViews={(posts || [])
                  .filter(p => p.creatorId === currentUser.id || p.creator?.id === currentUser.id)
                  .reduce((sum, p) => sum + (p.viewsCount || 0), 0)}
              />
            </AnalyticsErrorBoundary>
          ) : (
            <div className="w-full max-w-md mx-auto px-4 py-20 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-surface-elevated border border-border flex items-center justify-center mx-auto text-accent shadow-soft">
                <BarChart3 className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-text-primary">Creator Analytics</h2>
              <p className="text-sm text-text-muted leading-relaxed">
                Please sign in to view your creator performance dashboard, aggregate trends, and audience telemetry.
              </p>
              <button
                onClick={() => openAuthModal('login')}
                className="px-5 py-2.5 rounded-xl bg-accent text-white font-semibold text-sm transition-opacity hover:opacity-95 shadow-sm cursor-pointer"
              >
                Sign In
              </button>
            </div>
          )
        )}
      </main>

      {/* Persistent Interaction Modals */}
      <CreatePostModal />
      <AuthModal />
      <SaveToCollectionModal />

      {/* Bottom Navigation for Mobile */}
      <MobileNav />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
