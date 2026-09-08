import React from 'react';
import { Collection } from '../../types';
import { useApp } from '../../context/AppContext';
import { LazyImage } from '../common/LazyImage';
import { Lock, Bookmark, Sparkles, Plus } from 'lucide-react';

interface CollectionsGridProps {
  collections: Collection[];
  emptyTitle?: string;
  emptyDescription?: string;
  onOpenCreate?: () => void;
}

export const CollectionsGrid: React.FC<CollectionsGridProps> = ({
  collections,
  emptyTitle = 'No Collections Yet',
  emptyDescription = 'Save posts into collections to organize your visuals.',
  onOpenCreate,
}) => {
  const { posts, navigateTo, currentUser } = useApp();

  if (collections.length === 0) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center">
        <div className="w-12 h-12 rounded-2xl bg-surface-elevated flex items-center justify-center mx-auto mb-3 text-accent shadow-soft border border-border">
          <Bookmark className="w-5 h-5 text-accent" />
        </div>
        <h3 className="text-base font-semibold text-text-primary mb-1">
          {emptyTitle}
        </h3>
        <p className="text-xs text-text-secondary mb-6 leading-relaxed">
          {emptyDescription}
        </p>

        {onOpenCreate && currentUser && (
          <button
            id="btn-create-collection-empty"
            onClick={onOpenCreate}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent hover:bg-accent-hover text-white font-medium text-xs shadow-soft cursor-pointer transition-colors"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Create Collection</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
      {collections.map(collection => {
        // Retrieve preview images for up to 3 posts in the collection
        const colPosts = posts.filter(p => collection.postIds?.includes(p.id));
        const coverImg = collection.coverImageUrl || colPosts[0]?.imageUrl;

        return (
          <div
            key={collection.id}
            id={`collection-card-${collection.id}`}
            onClick={() =>
              navigateTo({
                type: 'collection-detail',
                collectionId: collection.id,
              })
            }
            className="group rounded-3xl overflow-hidden bg-surface border border-border p-3 shadow-soft hover:shadow-premium transition-all cursor-pointer flex flex-col justify-between"
          >
            {/* Stacked Visual Collage Preview */}
            <div className="grid grid-cols-3 gap-1.5 h-44 rounded-2xl overflow-hidden bg-surface-elevated mb-3 border border-border">
              {/* Main large image */}
              <div className="col-span-2 h-full overflow-hidden bg-surface-elevated">
                {coverImg ? (
                  <LazyImage
                    src={coverImg}
                    alt={collection.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center opacity-30">
                    <Bookmark className="w-6 h-6 text-text-muted" />
                  </div>
                )}
              </div>

              {/* 2 stacked side images */}
              <div className="col-span-1 grid grid-rows-2 gap-1.5 h-full">
                <div className="overflow-hidden bg-surface-elevated">
                  {colPosts[1] ? (
                    <LazyImage
                      src={colPosts[1].imageUrl}
                      alt="preview 2"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center opacity-30">
                      <Sparkles className="w-4 h-4 text-text-muted" />
                    </div>
                  )}
                </div>
                <div className="overflow-hidden bg-surface-elevated">
                  {colPosts[2] ? (
                    <LazyImage
                      src={colPosts[2].imageUrl}
                      alt="preview 3"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center opacity-30">
                      <Bookmark className="w-4 h-4 text-text-muted" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Collection Title & Meta */}
            <div className="px-1.5 pb-1">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold text-sm text-text-primary group-hover:text-accent transition-colors truncate">
                  {collection.title}
                </h3>
                {collection.isPrivate && (
                  <span title="Private Collection">
                    <Lock className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between text-xs text-text-secondary mt-1">
                <span>{collection.postIds?.length || 0} items</span>
                {collection.description && (
                  <span className="truncate max-w-[60%] text-[11px] text-text-muted">
                    {collection.description}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
