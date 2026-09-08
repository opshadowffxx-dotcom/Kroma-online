import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { LazyImage } from '../common/LazyImage';
import { X, Plus, Bookmark, Check, Lock } from 'lucide-react';

export const SaveToCollectionModal: React.FC = () => {
  const {
    isSaveModalOpen,
    closeSaveModal,
    postToSave,
    collections,
    currentUser,
    savePostToCollection,
    removePostFromCollection,
    createCollection,
  } = useApp();

  const [newCollectionTitle, setNewCollectionTitle] = useState('');
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isSaveModalOpen || !postToSave) return null;

  const userCollections = collections.filter(
    c => c.userId === (currentUser?.id || 'guest')
  );

  const handleToggleCollection = async (colId: string, isSaved: boolean) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      if (isSaved) {
        await removePostFromCollection(postToSave.id, colId);
      } else {
        await savePostToCollection(postToSave.id, colId);
      }
    } catch (err: any) {
      console.error('Error toggling collection save:', err);
      setErrorMessage(err?.message || 'Failed to update board. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newCollectionTitle.trim();
    if (!title || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const newCol = await createCollection(title);
      if (!newCol || !newCol.id) {
        throw new Error('Failed to create collection board.');
      }
      await savePostToCollection(postToSave.id, newCol.id);
      setNewCollectionTitle('');
      setIsCreatingNew(false);
    } catch (err: any) {
      console.error('Error creating and saving to board:', err);
      setErrorMessage(err?.message || 'Failed to create collection. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        id="save-to-collection-modal"
        className="w-full max-w-sm bg-surface rounded-3xl p-5 border border-border shadow-premium space-y-4 animate-in zoom-in-95 duration-150"
      >
        {/* Header with thumbnail */}
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            <div className="w-10 h-10 rounded-xl overflow-hidden bg-surface-elevated border border-border flex-shrink-0">
              <LazyImage
                src={postToSave.imageUrl}
                alt={postToSave.title}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-xs text-text-primary truncate">
                Save to Collection
              </h3>
              <p className="text-[11px] text-text-muted truncate">
                {postToSave.title}
              </p>
            </div>
          </div>

          <button
            onClick={closeSaveModal}
            className="w-7 h-7 rounded-full bg-surface-elevated text-text-muted hover:text-text-primary flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMessage && (
          <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-500">
            {errorMessage}
          </div>
        )}

        {/* Collections list */}
        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
          {userCollections.length === 0 ? (
            <div className="text-center py-6 text-xs text-text-muted">
              No collections yet. Create your first board below!
            </div>
          ) : (
            userCollections.map(col => {
              const safePostIds = Array.isArray(col.postIds) ? col.postIds : [];
              const isSaved = safePostIds.includes(postToSave.id);
              const count = safePostIds.length || col.postsCount || 0;
              return (
                <button
                  key={col.id}
                  id={`save-col-btn-${col.id}`}
                  disabled={isSubmitting}
                  onClick={() => handleToggleCollection(col.id, isSaved)}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all text-xs font-medium cursor-pointer disabled:opacity-50 ${
                    isSaved
                      ? 'bg-accent/10 text-accent border border-accent/20'
                      : 'hover:bg-surface-elevated text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Bookmark className="w-4 h-4 text-text-muted flex-shrink-0" />
                    <div className="truncate">
                      <span className="font-semibold truncate">{col.title}</span>
                      <span className="text-[10px] text-text-muted ml-1.5">
                        ({count})
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {col.isPrivate && <Lock className="w-3 h-3 text-text-muted" />}
                    {isSaved ? (
                      <div className="w-5 h-5 rounded-full bg-accent text-white flex items-center justify-center">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    ) : (
                      <span className="text-[11px] font-medium text-text-muted">
                        Save
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Quick inline create */}
        <div className="pt-2 border-t border-border">
          {isCreatingNew ? (
            <form onSubmit={handleCreateAndSave} className="space-y-2">
              <input
                type="text"
                value={newCollectionTitle}
                onChange={e => setNewCollectionTitle(e.target.value)}
                placeholder="Collection name..."
                autoFocus
                className="w-full px-3 py-1.5 rounded-xl bg-surface-elevated border border-border text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
              />
              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsCreatingNew(false)}
                  className="px-3 py-1 text-xs text-text-muted hover:text-text-primary cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newCollectionTitle.trim()}
                  className="px-3.5 py-1 rounded-full bg-accent hover:bg-accent-hover text-white text-xs font-medium disabled:opacity-40 shadow-soft cursor-pointer transition-colors"
                >
                  Create & Save
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setIsCreatingNew(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-border text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-elevated cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-accent" />
              <span>Create New Collection</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
