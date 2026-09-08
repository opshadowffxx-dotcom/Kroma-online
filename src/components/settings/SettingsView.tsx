import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Avatar } from '../common/Avatar';
import { ImageCropperModal, CropMode } from '../media/ImageCropperModal';
import { LocationAutocomplete } from './LocationAutocomplete';
import { toUserSafeErrorMessage } from '../../services/media/uploadStatus';
import {
  Settings as SettingsIcon,
  ArrowLeft,
  Check,
  Camera,
  Save,
  Image as ImageIcon,
} from 'lucide-react';

export const SettingsView: React.FC = () => {
  const { currentUser, updateUserProfile, navigateTo, previousRoute } = useApp();

  const [displayName, setDisplayName] = useState(currentUser?.displayName || '');
  const [bio, setBio] = useState(currentUser?.bio || '');
  const [location, setLocation] = useState(currentUser?.location || '');
  const [isLocationValid, setIsLocationValid] = useState(true);
  const [locationValidationError, setLocationValidationError] = useState<string | null>(null);
  const [websiteUrl, setWebsiteUrl] = useState(currentUser?.websiteUrl || '');
  const [isSavedNotice, setIsSavedNotice] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Image Cropper Modal
  const [isCropperOpen, setIsCropperOpen] = useState(false);
  const [cropperMode, setCropperMode] = useState<CropMode>('avatar');

  const handleBack = () => {
    // 1. Prefer previous route/history
    if (previousRoute && previousRoute.type === 'profile') {
      if (typeof window !== 'undefined' && window.history && window.history.length > 1) {
        window.history.back();
      } else {
        navigateTo(previousRoute);
      }
      return;
    }

    if (previousRoute) {
      if (typeof window !== 'undefined' && window.history && window.history.length > 1) {
        window.history.back();
      } else {
        navigateTo(previousRoute);
      }
      return;
    }

    // 2. Fallback to existing Profile route if usable history is unavailable
    if (currentUser?.username) {
      navigateTo({ type: 'profile', username: currentUser.username });
    } else {
      navigateTo({ type: 'home' });
    }
  };

  const handleOpenAvatarUpload = () => {
    setCropperMode('avatar');
    setIsCropperOpen(true);
  };

  const handleOpenCoverUpload = () => {
    setCropperMode('cover');
    setIsCropperOpen(true);
  };

  const handleCropperSuccess = async (res: { publicUrl: string; objectKey: string }) => {
    if (!currentUser) return;
    if (cropperMode === 'avatar') {
      await updateUserProfile({
        avatarUrl: res.publicUrl,
        avatarObjectKey: res.objectKey,
      });
    } else {
      await updateUserProfile({
        bannerUrl: res.publicUrl,
        bannerObjectKey: res.objectKey,
      });
    }
  };

  const handleLocationChange = (validatedLocation: string, isValid: boolean) => {
    setLocation(validatedLocation);
    setIsLocationValid(isValid);
    if (isValid) {
      setLocationValidationError(null);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || isSaving) return;

    // Strict validation: raw unselected text cannot be saved
    if (!isLocationValid) {
      setLocationValidationError('Select a city from the suggestions.');
      return;
    }
    setLocationValidationError(null);

    setIsSaving(true);
    setErrorMessage(null);
    try {
      await updateUserProfile({
        displayName: displayName.trim() || currentUser.displayName,
        bio: bio.trim(),
        location: location.trim(),
        websiteUrl: websiteUrl.trim(),
      });
      setIsSavedNotice(true);
      setTimeout(() => setIsSavedNotice(false), 2500);
    } catch (err: any) {
      console.error('Failed to update profile:', err);
      setErrorMessage(
        toUserSafeErrorMessage(err, "We couldn't save your profile changes. Please try again.")
      );
      setTimeout(() => setErrorMessage(null), 5000);
    } finally {
      setIsSaving(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="w-full max-w-md mx-auto py-24 px-4 text-center">
        {/* Back Button */}
        <button
          id="btn-settings-error-back"
          type="button"
          onClick={handleBack}
          className="mb-6 mx-auto w-10 h-10 rounded-full bg-surface text-text-primary border border-border shadow-soft flex items-center justify-center hover:bg-surface-elevated hover:scale-105 active:scale-95 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent"
          aria-label="Back"
          title="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <p className="text-sm text-neutral-500">
          Please log in to manage your account settings.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl lg:max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-3 sm:pt-6 pb-28 sm:pb-32 lg:pb-12 space-y-5 sm:space-y-6">
      {/* Settings Header in normal document flow with inline Back Button */}
      <div className="border-b border-border pb-3.5 flex items-center gap-3 sm:gap-4">
        <button
          id="btn-settings-back"
          type="button"
          onClick={handleBack}
          className="shrink-0 w-10 h-10 rounded-full bg-surface text-text-primary border border-border shadow-soft flex items-center justify-center hover:bg-surface-elevated hover:scale-105 active:scale-95 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent"
          aria-label="Back"
          title="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs font-medium text-text-muted mb-0.5">
            <SettingsIcon className="w-3.5 h-3.5 text-accent" />
            <span>Account & Profile</span>
          </div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-semibold text-text-primary tracking-tight">
            Settings
          </h1>
        </div>
      </div>

      {/* Visual Identity & Avatar Management */}
      <div className="rounded-2xl sm:rounded-3xl bg-surface border border-border p-4 sm:p-5 lg:p-6 shadow-soft space-y-3 sm:space-y-3.5">
        <h3 className="text-sm sm:text-base font-semibold text-text-primary">
          Visual Identity
        </h3>

        {/* Upload Controls - Stacked unified media rows */}
        <div className="flex flex-col gap-3">
          {/* Profile Photo Row */}
          <div className="flex items-center gap-3 p-3 sm:p-3.5 rounded-xl sm:rounded-2xl bg-surface-elevated border border-border">
            <div
              className="relative group cursor-pointer shrink-0"
              onClick={handleOpenAvatarUpload}
            >
              <Avatar
                src={currentUser.avatarUrl}
                alt={currentUser.displayName}
                size="lg"
              />
              <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                <Camera className="w-3.5 h-3.5" />
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-semibold text-text-primary truncate">
                Profile Photo
              </p>
              <p className="text-[11px] sm:text-xs text-text-muted mt-0.5 leading-snug">
                Recommended 400×400 · JPG or PNG
              </p>
            </div>

            <button
              type="button"
              id="btn-change-avatar"
              onClick={handleOpenAvatarUpload}
              className="shrink-0 px-3.5 py-1.5 rounded-full bg-surface hover:bg-surface-elevated text-text-primary text-xs font-medium border border-border transition-colors cursor-pointer"
            >
              Change
            </button>
          </div>

          {/* Cover Image Row */}
          <div className="flex items-center gap-3 p-3 sm:p-3.5 rounded-xl sm:rounded-2xl bg-surface-elevated border border-border">
            <div
              className="w-14 h-11 sm:w-16 sm:h-12 rounded-xl bg-surface border border-border flex items-center justify-center overflow-hidden cursor-pointer relative group shrink-0"
              onClick={handleOpenCoverUpload}
            >
              {currentUser.bannerUrl ? (
                <img
                  src={currentUser.bannerUrl}
                  alt="Cover"
                  className="w-full h-full object-cover"
                />
              ) : (
                <ImageIcon className="w-5 h-5 text-text-muted" />
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                <Camera className="w-3.5 h-3.5" />
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-semibold text-text-primary truncate">
                Cover Image
              </p>
              <p className="text-[11px] sm:text-xs text-text-muted mt-0.5 leading-snug">
                Recommended 1920×640 · Landscape
              </p>
            </div>

            <button
              type="button"
              id="btn-change-cover"
              onClick={handleOpenCoverUpload}
              className="shrink-0 px-3.5 py-1.5 rounded-full bg-surface hover:bg-surface-elevated text-text-primary text-xs font-medium border border-border transition-colors cursor-pointer"
            >
              Change
            </button>
          </div>
        </div>
      </div>

      {/* Account Settings */}
      <div className="rounded-2xl sm:rounded-3xl bg-surface border border-border p-4 sm:p-5 lg:p-6 shadow-soft space-y-4 sm:space-y-5">
        <h3 className="text-sm sm:text-base font-semibold text-text-primary">
          Profile Information
        </h3>

        {/* Profile Details Form */}
        <form onSubmit={handleSaveProfile} className="space-y-4 sm:space-y-5 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="input-display-name" className="block font-medium text-text-secondary mb-2">
                Display Name
              </label>
              <input
                id="input-display-name"
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-elevated border border-border text-text-primary focus:outline-none focus:ring-2 focus:ring-accent transition-all text-xs"
              />
            </div>

            <div>
              <label htmlFor="input-location-autocomplete" className="block font-medium text-text-secondary mb-2">
                Location
              </label>
              <LocationAutocomplete
                id="input-location-autocomplete"
                value={location}
                onChange={handleLocationChange}
                hasError={Boolean(locationValidationError)}
                placeholder="Search city or country (e.g. London, United Kingdom)"
              />
              {locationValidationError && (
                <p id="location-validation-error" className="text-[11px] text-rose-500 font-medium mt-1.5 flex items-center gap-1">
                  <span>{locationValidationError}</span>
                </p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="input-website" className="block font-medium text-text-secondary mb-2">
              Website
            </label>
            <input
              id="input-website"
              type="url"
              value={websiteUrl}
              onChange={e => setWebsiteUrl(e.target.value)}
              placeholder="https://yourwebsite.com"
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-elevated border border-border text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent transition-all text-xs"
            />
          </div>

          <div>
            <label htmlFor="input-bio" className="block font-medium text-text-secondary mb-2">
              About
            </label>
            <textarea
              id="input-bio"
              value={bio}
              onChange={e => setBio(e.target.value)}
              rows={3}
              placeholder="Tell people a little about yourself..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-elevated border border-border text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent transition-all text-xs resize-none"
            />
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
            <div className="min-h-[20px] flex items-center">
              {isSavedNotice && (
                <span id="notice-settings-saved" className="text-emerald-500 font-medium flex items-center gap-1 text-xs">
                  <Check className="w-3.5 h-3.5" /> Changes saved successfully
                </span>
              )}
              {errorMessage && (
                <span id="error-settings-save" className="text-rose-500 font-medium text-xs">
                  {errorMessage}
                </span>
              )}
            </div>
            <button
              type="submit"
              id="btn-save-settings"
              disabled={isSaving}
              className="w-full sm:w-auto h-12 sm:h-10 px-6 rounded-full bg-accent hover:bg-accent-hover text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-soft transition-colors cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Image Cropper Modal */}
      <ImageCropperModal
        isOpen={isCropperOpen}
        onClose={() => setIsCropperOpen(false)}
        mode={cropperMode}
        onSaveSuccess={handleCropperSuccess}
      />
    </div>
  );
};
