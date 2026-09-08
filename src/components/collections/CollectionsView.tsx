import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { CollectionsGrid } from './CollectionsGrid';
import { Plus, Bookmark, Lock, Globe, X } from 'lucide-react';

export const CollectionsView: React.FC = () => {
  const { collections, currentUser, createCollection } = useApp();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);

  const userCollections = collections.filter(
    c => c.userId === (currentUser?.id || 'guest')
  );

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTitle.trim()) {
      createCollection(newTitle.trim(), newDesc.trim(), isPrivate);
      setNewTitle('');
      setNewDesc('');
      setIsPrivate(false);
      setIsCreateOpen(false);
    }
  };

  return (
    <div className="w-full max-w-[1920px] mx-auto px-3.5 sm:px-6 lg:px-8 xl:px-10 py-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-text-primary tracking-tight">
            Collections
          </h1>
        </div>

        <button
          id="btn-new-collection"
          onClick={() => setIsCreateOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-accent hover:bg-accent-hover text-white text-xs font-medium shadow-soft cursor-pointer self-start sm:self-auto transition-colors"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>New Collection</span>
        </button>
      </div>

      {/* Grid of collections */}
      <CollectionsGrid
        collections={userCollections.length > 0 ? userCollections : collections}
      />

      {/* Create Collection Dialog Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            id="modal-create-collection"
            className="w-full max-w-md bg-surface rounded-3xl p-6 border border-border shadow-premium space-y-5 animate-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-text-primary">
                Create New Collection
              </h3>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="w-8 h-8 rounded-full bg-surface-elevated flex items-center justify-center text-text-muted hover:text-text-primary transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-text-secondary mb-1">
                  Collection Title *
                </label>
                <input
                  type="text"
                  id="input-collection-title"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="e.g. Swiss Typography & Grid Posters"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-elevated border border-border text-text-primary text-xs placeholder-text-muted focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block font-medium text-text-secondary mb-1">
                  Description (Optional)
                </label>
                <textarea
                  id="input-collection-desc"
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  placeholder="What is the mood, purpose, or theme of this board?"
                  rows={3}
                  className="w-full px-3.5 py-2 rounded-xl bg-surface-elevated border border-border text-text-primary text-xs placeholder-text-muted focus:outline-none focus:border-accent"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-surface-elevated border border-border">
                <div className="flex items-center gap-2">
                  {isPrivate ? (
                    <Lock className="w-4 h-4 text-amber-500" />
                  ) : (
                    <Globe className="w-4 h-4 text-accent" />
                  )}
                  <div>
                    <p className="font-medium text-text-primary">
                      {isPrivate ? 'Private Collection' : 'Public Collection'}
                    </p>
                    <p className="text-[11px] text-text-muted">
                      {isPrivate
                        ? 'Only you can view this collection'
                        : 'Visible on your public creator profile'}
                    </p>
                  </div>
                </div>

                <input
                  type="checkbox"
                  id="check-private-collection"
                  checked={isPrivate}
                  onChange={e => setIsPrivate(e.target.checked)}
                  className="w-4 h-4 rounded accent-accent cursor-pointer"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 rounded-full text-xs font-medium text-text-secondary hover:bg-surface-elevated transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="btn-confirm-create-collection"
                  disabled={!newTitle.trim()}
                  className="px-5 py-2 rounded-full bg-accent hover:bg-accent-hover text-white text-xs font-medium transition-colors disabled:opacity-40 shadow-soft cursor-pointer"
                >
                  Create Board
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
