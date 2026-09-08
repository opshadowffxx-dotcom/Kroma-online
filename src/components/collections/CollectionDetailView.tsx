import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { MasonryFeed } from '../feed/MasonryFeed';
import { Bookmark, Lock, Globe, ArrowLeft, Trash2, LayoutGrid } from 'lucide-react';
import { fetchFirestorePostsByIds } from '../../services/firebase/postService';
import { Post } from '../../types';

interface CollectionDetailViewProps {
  collectionId: string;
}

export const CollectionDetailView: React.FC<CollectionDetailViewProps> = ({ collectionId }) => {
  const { collections, posts, navigateTo, currentUser, deleteCollection, isMockMode, isFirebaseConnected } = useApp();

  const collection = collections.find(c => c.id === collectionId);

  const [collectionPosts, setCollectionPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    if (!collection?.postIds || collection.postIds.length === 0) {
      setCollectionPosts([]);
      setIsLoading(false);
      return;
    }

    const loadPosts = async () => {
      setIsLoading(true);
      if (isMockMode || !isFirebaseConnected) {
        if (isMounted) {
          setCollectionPosts(posts.filter(p => collection.postIds?.includes(p.id)));
          setIsLoading(false);
        }
        return;
      }

      try {
        const cachedMap = new Map<string, Post>(posts.map(p => [p.id, p]));
        const missingIds: string[] = [];
        const resolved: Post[] = [];

        for (const id of collection.postIds) {
          if (cachedMap.has(id)) {
            resolved.push(cachedMap.get(id)!);
          } else {
            missingIds.push(id);
          }
        }

        if (missingIds.length > 0) {
          const fetchedMissing = await fetchFirestorePostsByIds(missingIds);
          resolved.push(...fetchedMissing);
        }

        if (isMounted) {
          setCollectionPosts(resolved);
        }
      } catch (err) {
        console.error('Failed to fetch collection posts:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadPosts();

    return () => {
      isMounted = false;
    };
  }, [collection?.postIds, posts, isMockMode, isFirebaseConnected]);

  if (!collection) {
    return (
      <div className="max-w-md mx-auto py-24 px-4 text-center">
        <h2 className="text-xl font-semibold text-text-primary mb-2">
          Collection Not Found
        </h2>
        <p className="text-xs text-text-secondary mb-6">
          This collection might have been removed or does not exist.
        </p>
        <button
          onClick={() => navigateTo({ type: 'collections' })}
          className="px-5 py-2.5 rounded-full bg-accent hover:bg-accent-hover text-white text-xs font-medium shadow-soft cursor-pointer transition-colors"
        >
          Return to Collections
        </button>
      </div>
    );
  }

  const isOwner = currentUser?.id === collection.userId || currentUser?.isAdmin;

  const handleConfirmDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteCollection(collection.id);
      setIsDeleteDialogOpen(false);
      navigateTo({ type: 'collections' });
    } catch (err) {
      console.error('Failed to delete collection:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="w-full max-w-[1920px] mx-auto px-3.5 sm:px-6 lg:px-8 xl:px-10 py-6 space-y-6">
      {/* Back Button */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigateTo({ type: 'collections' })}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>All Collections</span>
        </button>

        {isOwner && (
          <button
            id="btn-delete-collection"
            onClick={() => setIsDeleteDialogOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Collection</span>
          </button>
        )}
      </div>

      {/* Collection Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-surface-elevated border border-border text-text-secondary">
              {collection.isPrivate ? (
                <>
                  <Lock className="w-3 h-3 text-amber-500" /> Private
                </>
              ) : (
                <>
                  <Globe className="w-3 h-3 text-accent" /> Public
                </>
              )}
            </span>
            <span className="text-xs text-text-muted">
              {isLoading ? '...' : collectionPosts.length} {collectionPosts.length === 1 ? 'visual' : 'visuals'}
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-semibold text-text-primary tracking-tight break-words">
            {collection.title}
          </h1>

          {collection.description && (
            <p className="text-sm text-text-secondary mt-2 max-w-2xl leading-relaxed">
              {collection.description}
            </p>
          )}
        </div>
      </div>

      {/* Masonry of visuals in collection */}
      {isLoading ? (
        <div className="columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-2.5 sm:gap-4 lg:gap-5 space-y-2.5 sm:space-y-4">
          {[1, 2, 3, 4].map(i => (
            <div
              key={i}
              className="break-inside-avoid rounded-2xl bg-surface-elevated border border-border animate-pulse h-64 w-full mb-2.5 sm:mb-4"
            />
          ))}
        </div>
      ) : (
        <MasonryFeed
          posts={collectionPosts}
          emptyTitle="No visuals in this collection"
          emptyDescription="Browse visuals and tap the bookmark icon on any post to add it to this collection."
          emptyIcon={<Bookmark className="w-5 h-5 text-accent" />}
          emptyActionLabel="Browse Posts"
          emptyActionIcon={<LayoutGrid className="w-4 h-4 text-white" />}
          onEmptyAction={() => navigateTo({ type: 'home' })}
          discoverySource="collection"
        />
      )}

      {/* In-App Delete Confirmation Modal */}
      {isDeleteDialogOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !isDeleting && setIsDeleteDialogOpen(false)}
        >
          <div
            id="modal-delete-collection"
            onClick={e => e.stopPropagation()}
            className="w-full max-w-sm bg-surface rounded-3xl p-6 border border-border shadow-premium space-y-4 animate-in zoom-in-95 duration-150"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-text-primary">
                  Delete Collection
                </h3>
                <p className="text-xs text-text-muted">
                  This action cannot be undone.
                </p>
              </div>
            </div>

            <p className="text-xs text-text-secondary leading-relaxed">
              Are you sure you want to delete <span className="font-semibold text-text-primary">&ldquo;{collection.title}&rdquo;</span>? All saved visuals will remain in your library, but this collection will be permanently removed.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                id="btn-cancel-delete-collection"
                disabled={isDeleting}
                onClick={() => setIsDeleteDialogOpen(false)}
                className="px-4 py-2 rounded-full border border-border bg-surface-elevated text-text-secondary text-xs font-medium hover:text-text-primary hover:bg-surface transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-delete-collection"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium transition-colors shadow-soft cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Deleting…</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
