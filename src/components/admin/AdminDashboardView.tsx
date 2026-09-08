import React from 'react';
import { useApp } from '../../context/AppContext';
import { LazyImage } from '../common/LazyImage';
import { Avatar } from '../common/Avatar';
import {
  Shield,
  Star,
  Trash2,
  ExternalLink,
  Layers,
  Users,
  Bookmark,
  Heart,
  CheckCircle2,
} from 'lucide-react';

export const AdminDashboardView: React.FC = () => {
  const {
    posts,
    users,
    collections,
    toggleFeaturedPost,
    deletePost,
    openPostDetail,
  } = useApp();

  const totalLikes = posts.reduce((sum, p) => sum + p.likesCount, 0);
  const totalSaves = posts.reduce((sum, p) => sum + p.savesCount, 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Admin Header */}
      <div className="border-b border-border pb-5">
        <div className="flex items-center gap-2 text-xs font-medium text-text-muted mb-1">
          <Shield className="w-3.5 h-3.5 text-accent" />
          <span>Admin Center</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold text-text-primary tracking-tight">
          Admin Dashboard
        </h1>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-surface border border-border shadow-soft">
          <div className="flex items-center justify-between text-text-muted mb-2">
            <span className="text-xs font-medium text-text-secondary">Total Visuals</span>
            <Layers className="w-4 h-4 text-accent" />
          </div>
          <p className="text-2xl font-semibold text-text-primary">
            {posts.length}
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-surface border border-border shadow-soft">
          <div className="flex items-center justify-between text-text-muted mb-2">
            <span className="text-xs font-medium text-text-secondary">Creators</span>
            <Users className="w-4 h-4 text-accent" />
          </div>
          <p className="text-2xl font-semibold text-text-primary">
            {users.length}
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-surface border border-border shadow-soft">
          <div className="flex items-center justify-between text-text-muted mb-2">
            <span className="text-xs font-medium text-text-secondary">Collections</span>
            <Bookmark className="w-4 h-4 text-accent" />
          </div>
          <p className="text-2xl font-semibold text-text-primary">
            {collections.length}
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-surface border border-border shadow-soft">
          <div className="flex items-center justify-between text-text-muted mb-2">
            <span className="text-xs font-medium text-text-secondary">Engagement</span>
            <Heart className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-2xl font-semibold text-text-primary">
            {totalLikes + totalSaves}
          </p>
        </div>
      </div>

      {/* Moderation & Curation Table */}
      <div className="rounded-3xl bg-surface border border-border overflow-hidden shadow-soft">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">
            Visual Posts Management
          </h2>
          <span className="text-xs text-text-muted font-medium">
            {posts.filter(p => p.isFeatured).length} featured on explore
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-text-secondary">
            <thead className="bg-surface-elevated text-[11px] font-medium text-text-muted border-b border-border">
              <tr>
                <th className="py-3.5 px-4">Visual & Title</th>
                <th className="py-3.5 px-4">Creator</th>
                <th className="py-3.5 px-4">Category</th>
                <th className="py-3.5 px-4">Engagement</th>
                <th className="py-3.5 px-4 text-center">Featured</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {posts.map(post => (
                <tr
                  key={post.id}
                  className="hover:bg-surface-elevated transition-colors"
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg overflow-hidden bg-surface-elevated flex-shrink-0">
                        <LazyImage
                          src={post.imageUrl}
                          alt={post.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-text-primary truncate max-w-xs">
                          {post.title}
                        </p>
                        <p className="text-[10px] text-text-muted">
                          {new Date(post.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </td>

                  <td className="py-3 px-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Avatar
                        src={post.creator?.avatarUrl}
                        alt={post.creator?.displayName || 'Creator'}
                        size="xs"
                      />
                      <span className="text-text-primary">{post.creator?.displayName || 'Creator'}</span>
                    </div>
                  </td>

                  <td className="py-3 px-4 whitespace-nowrap capitalize text-text-secondary">
                    {(post.category || 'design').replace(/-/g, ' ')}
                  </td>

                  <td className="py-3 px-4 whitespace-nowrap">
                    <div className="flex items-center gap-3 text-[11px] text-text-muted">
                      <span>❤️ {post.likesCount}</span>
                      <span>🔖 {post.savesCount}</span>
                    </div>
                  </td>

                  <td className="py-3 px-4 text-center whitespace-nowrap">
                    <button
                      onClick={() => toggleFeaturedPost(post.id)}
                      className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                        post.isFeatured
                          ? 'text-amber-500 hover:text-amber-600 bg-amber-500/10'
                          : 'text-text-muted hover:text-text-primary'
                      }`}
                      title={post.isFeatured ? 'Unmark featured' : 'Mark as featured spotlight'}
                    >
                      <Star className={`w-4 h-4 ${post.isFeatured ? 'fill-current' : ''}`} />
                    </button>
                  </td>

                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openPostDetail(post.id)}
                        className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
                        title="View post"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deletePost(post.id)}
                        className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Delete post"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
