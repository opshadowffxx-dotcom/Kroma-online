import React, { useEffect } from 'react';
import { X, MapPin, Globe, Eye, Image, Users, UserCheck, Calendar } from 'lucide-react';
import { User } from '../../types';
import { Avatar } from '../common/Avatar';
import { formatCompactNumber, formatJoinedDate } from '../../utils/numberFormatter';

interface AboutBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  postsCount: number;
  totalViews?: number;
  defaultAboutText?: string;
}

export const AboutBottomSheet: React.FC<AboutBottomSheetProps> = ({
  isOpen,
  onClose,
  user,
  postsCount,
  totalViews = 0,
  defaultAboutText = 'Sharing visual ideas and creative inspiration on KROMA.',
}) => {
  // Lock background body scroll while sheet is open
  useEffect(() => {
    if (isOpen) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [isOpen]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const displayBio = user.bio && user.bio.trim().length > 0 ? user.bio : defaultAboutText;
  const rawWebsite = user.websiteUrl || (user as any).website || '';
  const websiteHref = rawWebsite.startsWith('http') ? rawWebsite : `https://${rawWebsite}`;
  const websiteDomain = rawWebsite.replace(/^https?:\/\//, '').replace(/\/$/, '');

  // Format exact real Joined date from Firebase user data
  const formattedJoinedDate = formatJoinedDate(user.createdAt, (user as any).authCreationTime);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop overlay */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet Content Container */}
      <div className="relative w-full max-w-lg bg-surface rounded-t-[28px] sm:rounded-[28px] shadow-premium overflow-hidden flex flex-col max-h-[90dvh] z-10 animate-in slide-in-from-bottom duration-250 border border-border">
        {/* Mobile Drag Handle */}
        <div className="w-full flex justify-center pt-3 pb-1 cursor-grab">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="px-5 py-3 border-b border-border flex items-center justify-between shrink-0">
          <h2 className="text-base font-bold text-text-primary tracking-tight">
            About
          </h2>
          <button
            id="btn-close-about-sheet"
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full bg-surface-elevated text-text-muted hover:text-text-primary transition-colors cursor-pointer"
            aria-label="Close details"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
          {/* User Header Profile Card */}
          <div className="flex items-center gap-4 p-4 rounded-2xl bg-surface-elevated border border-border">
            <Avatar
              src={user.avatarUrl}
              alt={user.displayName}
              size="lg"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="text-base font-bold text-text-primary truncate">
                  {user.displayName}
                </h3>
              </div>
              <div className="flex items-center gap-1 pt-0.5">
                <p className="text-xs text-text-muted font-medium">
                  @{user.username}
                </p>
              </div>
            </div>
          </div>

          {/* Complete About / Bio */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Bio
            </h4>
            <p className="text-xs sm:text-sm text-text-secondary leading-relaxed whitespace-pre-line">
              {displayBio}
            </p>
          </div>

          {/* Details & Location / Website */}
          {(user.location || rawWebsite) && (
            <div className="space-y-2.5 pt-2 border-t border-border">
              <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                Info
              </h4>
              <div className="space-y-2 text-xs">
                {user.location && (
                  <div className="flex items-center gap-2.5 text-text-secondary">
                    <MapPin className="w-4 h-4 text-text-muted shrink-0" />
                    <span>{user.location}</span>
                  </div>
                )}
                {rawWebsite && (
                  <div className="flex items-center gap-2.5">
                    <Globe className="w-4 h-4 text-text-muted shrink-0" />
                    <a
                      href={websiteHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-text-primary font-medium hover:underline truncate"
                    >
                      {websiteDomain}
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Profile Statistics Grid */}
          <div className="space-y-2.5 pt-2 border-t border-border">
            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Profile Details
            </h4>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 rounded-2xl bg-surface-elevated border border-border flex items-center gap-3">
                <div className="p-2 rounded-xl bg-surface text-text-secondary shadow-soft">
                  <Eye className="w-4 h-4 text-text-secondary" />
                </div>
                <div>
                  <div className="text-sm font-bold text-text-primary">
                    {formatCompactNumber(totalViews)}
                  </div>
                  <div className="text-[10px] text-text-muted font-medium">
                    Views
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-surface-elevated border border-border flex items-center gap-3">
                <div className="p-2 rounded-xl bg-surface text-text-secondary shadow-soft">
                  <Image className="w-4 h-4 text-text-secondary" />
                </div>
                <div>
                  <div className="text-sm font-bold text-text-primary">
                    {postsCount.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-text-muted font-medium">
                    Posts
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-surface-elevated border border-border flex items-center gap-3">
                <div className="p-2 rounded-xl bg-surface text-text-secondary shadow-soft">
                  <Users className="w-4 h-4 text-text-secondary" />
                </div>
                <div>
                  <div className="text-sm font-bold text-text-primary">
                    {(user.followersCount || 0).toLocaleString()}
                  </div>
                  <div className="text-[10px] text-text-muted font-medium">
                    Followers
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-surface-elevated border border-border flex items-center gap-3">
                <div className="p-2 rounded-xl bg-surface text-text-secondary shadow-soft">
                  <UserCheck className="w-4 h-4 text-text-secondary" />
                </div>
                <div>
                  <div className="text-sm font-bold text-text-primary">
                    {(user.followingCount || 0).toLocaleString()}
                  </div>
                  <div className="text-[10px] text-text-muted font-medium">
                    Following
                  </div>
                </div>
              </div>
            </div>

            {formattedJoinedDate && (
              <div className="flex items-center gap-2 pt-1 text-xs text-text-muted">
                <Calendar className="w-3.5 h-3.5 text-text-muted shrink-0" />
                <span>Joined {formattedJoinedDate}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
