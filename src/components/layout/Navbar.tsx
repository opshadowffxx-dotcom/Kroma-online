import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Avatar } from '../common/Avatar';
import { DesktopSearchBar } from './DesktopSearchBar';
import {
  Plus,
  Bell,
  Sun,
  Moon,
  Shield,
  Settings,
  LogOut,
  User as UserIcon,
  Bookmark,
  CheckCheck,
  ChevronDown,
} from 'lucide-react';

export const Navbar: React.FC = () => {
  const {
    currentUser,
    activeRoute,
    theme,
    notifications,
    unreadNotificationsCount,
    navigateTo,
    toggleTheme,
    openCreateModal,
    openAuthModal,
    logoutUser,
    loginUser,
    users,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    openPostDetail,
    isMockMode,
  } = useApp();

  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isSwitchDemoOpen, setIsSwitchDemoOpen] = useState(false);

  const userMenuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // Click outside & Escape key listener for dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
        setIsSwitchDemoOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setIsNotifOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsUserMenuOpen(false);
        setIsNotifOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleNotificationClick = (notifId: string, postId?: string, actorUsername?: string) => {
    markNotificationAsRead(notifId);
    setIsNotifOpen(false);
    if (postId) {
      openPostDetail(postId);
    } else if (actorUsername) {
      navigateTo({ type: 'profile', username: actorUsername });
    }
  };

  return (
    <header className="sticky top-0 z-30 w-full bg-surface/95 backdrop-blur-md border-b border-border transition-colors">
      <div className="w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 h-[60px] sm:h-16 flex items-center justify-between gap-4 relative">
        {/* Left: Brand Logo */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            id="brand-logo-btn"
            onClick={() => navigateTo({ type: 'home' })}
            className="flex items-center gap-2.5 text-text-primary group cursor-pointer focus:outline-none"
            aria-label="KROMA Home"
          >
            <div className="w-10 h-10 sm:w-10 sm:h-10 rounded-xl bg-accent text-white flex items-center justify-center font-bold text-base sm:text-lg shadow-soft group-hover:scale-105 transition-transform shrink-0">
              K
            </div>
            <span className="font-bold text-lg tracking-tight hidden sm:inline-block">
              KROMA
            </span>
          </button>
        </div>

        {/* Center: Desktop Real Search Input & Dropdown */}
        <DesktopSearchBar />

        {/* Right: Actions, Theme, Notifications, Profile / Auth */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Create Post Button (Desktop only) */}
          <button
            id="btn-create-post"
            onClick={openCreateModal}
            className="hidden lg:flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-accent hover:bg-accent-hover text-white text-xs font-semibold transition-colors shadow-soft cursor-pointer active:scale-95"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Create</span>
          </button>

          {/* Theme Toggle */}
          <button
            id="btn-theme-toggle"
            onClick={toggleTheme}
            className="w-10 h-10 rounded-full flex items-center justify-center text-text-secondary hover:bg-surface-elevated transition-colors cursor-pointer shrink-0"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5" />}
          </button>

          {/* Notifications Dropdown */}
          <div className="relative" ref={notifRef}>
            <button
              id="btn-notifications"
              onClick={() => setIsNotifOpen(!isNotifOpen)}
              className="w-10 h-10 rounded-full flex items-center justify-center text-text-secondary hover:bg-surface-elevated transition-colors cursor-pointer relative shrink-0"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-accent ring-2 ring-surface" />
              )}
            </button>

            {isNotifOpen && (
              <div className="absolute right-0 mt-2 w-[calc(100vw-32px)] sm:w-96 max-w-sm rounded-2xl bg-surface border border-border shadow-elevated p-3 z-50 animate-in fade-in zoom-in-95">
                <div className="flex items-center justify-between px-2 pb-2.5 border-b border-border mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-text-primary">
                      Notifications
                    </span>
                    {unreadNotificationsCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent-soft text-accent">
                        {unreadNotificationsCount} new
                      </span>
                    )}
                  </div>

                  {unreadNotificationsCount > 0 && (
                    <button
                      id="btn-mark-all-read"
                      onClick={markAllNotificationsAsRead}
                      className="flex items-center gap-1 text-[11px] font-medium text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span>Mark all as read</span>
                    </button>
                  )}
                </div>

                <div className="max-h-80 overflow-y-auto space-y-1.5 pr-0.5">
                  {notifications.length === 0 ? (
                    <div className="py-8 text-center text-xs text-text-muted">
                      You have no notifications yet.
                    </div>
                  ) : (
                    notifications.map(notif => (
                      <div
                        key={notif.id}
                        onClick={() =>
                          handleNotificationClick(
                            notif.id,
                            notif.relatedPostId,
                            notif.actor?.username
                          )
                        }
                        className={`p-2.5 rounded-xl flex items-start gap-3 transition-colors cursor-pointer text-xs ${
                          notif.isRead
                            ? 'bg-transparent hover:bg-surface-elevated text-text-secondary'
                            : 'bg-surface-elevated hover:bg-surface-elevated/80 text-text-primary'
                        }`}
                      >
                        <div className="relative flex-shrink-0 mt-0.5">
                          {notif.actor?.avatarUrl ? (
                            <Avatar
                              src={notif.actor.avatarUrl}
                              alt={notif.actor.displayName}
                              size="xs"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-accent text-white flex items-center justify-center font-semibold text-[10px]">
                              K
                            </div>
                          )}
                          {!notif.isRead && (
                            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-accent ring-1 ring-surface" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-xs leading-snug">
                            {notif.title}
                          </p>
                          <p className="text-[11px] text-text-secondary mt-0.5 leading-relaxed">
                            {notif.message}
                          </p>
                          <span className="text-[10px] text-text-muted mt-1 block">
                            {new Date(notif.createdAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        </div>

                        {notif.thumbnailUrl && (
                          <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-surface-elevated">
                            <img
                              src={notif.thumbnailUrl}
                              alt="Thumbnail"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Profile / Auth State */}
          {currentUser ? (
            <div className="hidden lg:block relative" ref={userMenuRef}>
              <button
                id="btn-user-avatar-menu"
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                aria-expanded={isUserMenuOpen}
                aria-label="Open account menu"
                className="flex items-center gap-1.5 p-1 rounded-full text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer shrink-0 ml-0.5 focus:outline-none"
              >
                <Avatar
                  src={currentUser.avatarUrl}
                  alt={currentUser.displayName}
                  size="sm"
                />
                <ChevronDown
                  className={`w-4 h-4 transition-transform duration-200 ${
                    isUserMenuOpen ? 'rotate-180' : 'rotate-0'
                  }`}
                />
              </button>

              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-[calc(100vw-32px)] sm:w-64 max-w-xs rounded-2xl bg-surface border border-border shadow-elevated p-2 z-50 animate-in fade-in zoom-in-95">
                  <div className="px-3 py-2.5 border-b border-border mb-1">
                    <div className="flex items-center gap-2.5">
                      <Avatar
                        src={currentUser.avatarUrl}
                        alt={currentUser.displayName}
                        size="md"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-text-primary truncate">
                          {currentUser.displayName}
                        </p>
                        <p className="text-xs text-text-secondary truncate pt-0.5">
                          @{currentUser.username}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-0.5 text-xs font-medium">
                    <button
                      id="menu-btn-profile"
                      onClick={() => {
                        navigateTo({ type: 'profile', username: currentUser.username });
                        setIsUserMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
                    >
                      <UserIcon className="w-4 h-4 text-text-muted" />
                      <span>My Profile</span>
                    </button>

                    <button
                      id="menu-btn-collections"
                      onClick={() => {
                        navigateTo({ type: 'collections' });
                        setIsUserMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
                    >
                      <Bookmark className="w-4 h-4 text-text-muted" />
                      <span>My Collections</span>
                    </button>

                    <button
                      id="menu-btn-settings"
                      onClick={() => {
                        navigateTo({ type: 'settings' });
                        setIsUserMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
                    >
                      <Settings className="w-4 h-4 text-text-muted" />
                      <span>Settings</span>
                    </button>

                    {currentUser.isAdmin && (
                      <button
                        id="menu-btn-admin"
                        onClick={() => {
                          navigateTo({ type: 'admin' });
                          setIsUserMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
                      >
                        <Shield className="w-4 h-4 text-text-muted" />
                        <span>Admin Curation</span>
                      </button>
                    )}

                    {/* Switch Demo Creator (Mock Mode Only) */}
                    {isMockMode && (
                      <div className="pt-1 mt-1 border-t border-border">
                        <button
                          id="menu-btn-switch-demo"
                          onClick={() => setIsSwitchDemoOpen(!isSwitchDemoOpen)}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-text-secondary hover:bg-surface-elevated cursor-pointer"
                        >
                          <span>Switch Demo User</span>
                          <span className="text-[10px] bg-surface-elevated px-1.5 py-0.5 rounded">
                            {users.length}
                          </span>
                        </button>

                        {isSwitchDemoOpen && (
                          <div className="my-1 pl-2 space-y-1">
                            {users.map(u => (
                              <button
                                key={u.id}
                                id={`demo-user-${u.username}`}
                                onClick={() => {
                                  loginUser(u);
                                  setIsUserMenuOpen(false);
                                  setIsSwitchDemoOpen(false);
                                }}
                                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs cursor-pointer ${
                                  currentUser.id === u.id
                                    ? 'bg-surface-elevated font-semibold text-text-primary'
                                    : 'hover:bg-surface-elevated text-text-secondary'
                                }`}
                              >
                                <Avatar
                                  src={u.avatarUrl}
                                  alt={u.displayName}
                                  size="xs"
                                />
                                <span className="truncate">{u.displayName}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="pt-1 mt-1 border-t border-border">
                      <button
                        id="menu-btn-logout"
                        onClick={() => {
                          logoutUser();
                          setIsUserMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-accent hover:bg-accent-soft transition-colors cursor-pointer"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="hidden lg:flex items-center gap-1.5 sm:gap-2 ml-0.5">
              <button
                id="btn-login"
                onClick={() => openAuthModal('login')}
                className="px-3 sm:px-3.5 py-1.5 rounded-full text-xs font-semibold text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
              >
                Log In
              </button>
              <button
                id="btn-signup"
                onClick={() => openAuthModal('signup')}
                className="px-3 sm:px-3.5 py-1.5 rounded-full bg-accent hover:bg-accent-hover text-white text-xs font-semibold transition-colors shadow-soft cursor-pointer"
              >
                Sign Up
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
