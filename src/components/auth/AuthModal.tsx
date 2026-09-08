import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Avatar } from '../common/Avatar';
import { X, LogIn, UserPlus, AlertCircle, CheckCircle2, KeyRound } from 'lucide-react';
import { User } from '../../types';
import {
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  resetPassword,
  formatAuthErrorMessage,
} from '../../services/firebase/authService';
import { isFirebaseAvailable } from '../../services/firebase';

export const AuthModal: React.FC = () => {
  const {
    isAuthModalOpen,
    closeAuthModal,
    authModalTab,
    openAuthModal,
    loginUser,
    users,
    isMockMode,
  } = useApp();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resetSentMessage, setResetSentMessage] = useState<string | null>(null);
  const [isForgotPassword, setIsForgotPassword] = useState(false);

  if (!isAuthModalOpen) return null;

  const isFbReady = isFirebaseAvailable();

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setResetSentMessage(null);
    setIsLoading(true);

    try {
      if (isForgotPassword) {
        if (!email.trim()) {
          setErrorMessage('Please enter your email address to reset your password.');
          setIsLoading(false);
          return;
        }
        if (isFbReady && !isMockMode) {
          await resetPassword(email.trim());
        }
        setResetSentMessage(`Password reset link has been sent to ${email.trim()}. Please check your inbox.`);
        setIsLoading(false);
        return;
      }

      if (authModalTab === 'login') {
        if (isFbReady && !isMockMode) {
          await signInWithEmail(email.trim(), password);
          closeAuthModal();
        } else if (isMockMode) {
          // Local demo login
          const matched = users.find(u => u.email?.toLowerCase() === email.trim().toLowerCase()) || {
            id: `user-${Date.now()}`,
            username: email.split('@')[0] || 'creator',
            displayName: email.split('@')[0] || 'Creator',
            email: email.trim(),
            avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=300&auto=format&fit=crop',
            followersCount: 0,
            followingCount: 0,
            postsCount: 0,
            collectionsCount: 0,
            createdAt: new Date().toISOString(),
          };
          loginUser(matched);
        }
      } else {
        // Sign Up
        if (isFbReady && !isMockMode) {
          const { userProfile } = await signUpWithEmail(
            email.trim(),
            password,
            displayName.trim() || username.trim(),
            username.trim()
          );
          loginUser(userProfile);
        } else if (isMockMode) {
          const newUser: User = {
            id: `user-${Date.now()}`,
            username: username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '') || 'newcreator',
            displayName: displayName.trim() || 'New Creator',
            email: email.trim(),
            avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=300&auto=format&fit=crop',
            followersCount: 0,
            followingCount: 0,
            postsCount: 0,
            collectionsCount: 0,
            createdAt: new Date().toISOString(),
          };
          loginUser(newUser);
        }
      }
    } catch (err) {
      setErrorMessage(formatAuthErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    setIsLoading(true);
    try {
      if (isFbReady && !isMockMode) {
        const { userProfile } = await signInWithGoogle();
        loginUser(userProfile);
      } else if (isMockMode) {
        const googleUser: User = {
          id: `user-google-${Date.now()}`,
          username: 'google_creator',
          displayName: 'Google Creator',
          email: 'creator@google.com',
          avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=300&auto=format&fit=crop',
          followersCount: 0,
          followingCount: 0,
          postsCount: 0,
          collectionsCount: 0,
          createdAt: new Date().toISOString(),
        };
        loginUser(googleUser);
      }
    } catch (err) {
      setErrorMessage(formatAuthErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-surface rounded-3xl p-6 sm:p-8 shadow-premium border border-border space-y-5">
        {/* Close Button */}
        <button
          id="btn-close-auth-modal"
          onClick={closeAuthModal}
          className="absolute top-5 right-5 w-8 h-8 rounded-full bg-surface-elevated flex items-center justify-center text-text-muted hover:text-text-primary transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="text-center space-y-1">
          <div className="w-10 h-10 rounded-2xl bg-accent text-white flex items-center justify-center font-bold text-xl mx-auto mb-2 shadow-soft">
            K
          </div>
          <h2 className="text-xl font-semibold text-text-primary">
            {isForgotPassword
              ? 'Reset Password'
              : authModalTab === 'login'
              ? 'Log in to KROMA'
              : 'Create an Account'}
          </h2>
          <p className="text-xs text-text-muted leading-relaxed">
            {isForgotPassword
              ? 'Enter your email to receive a password reset link.'
              : authModalTab === 'login'
              ? 'Log in to continue to your account.'
              : 'Sign up to save collections and publish your work.'}
          </p>
        </div>

        {/* Tab Switcher (if not forgot password) */}
        {!isForgotPassword && (
          <div className="flex p-1 rounded-2xl bg-surface-elevated border border-border">
            <button
              id="tab-login"
              type="button"
              onClick={() => {
                openAuthModal('login');
                setErrorMessage(null);
              }}
              className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                authModalTab === 'login'
                  ? 'bg-accent text-white shadow-soft font-semibold'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Log In
            </button>
            <button
              id="tab-signup"
              type="button"
              onClick={() => {
                openAuthModal('signup');
                setErrorMessage(null);
              }}
              className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                authModalTab === 'signup'
                  ? 'bg-accent text-white shadow-soft font-semibold'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Sign Up
            </button>
          </div>
        )}

        {/* Social Login: Google Provider ONLY */}
        {!isForgotPassword && (
          <div className="space-y-3">
            <button
              id="btn-google-signin"
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-full border border-border bg-surface-elevated hover:bg-surface text-text-primary font-medium text-xs transition-colors shadow-soft cursor-pointer disabled:opacity-50"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[11px] text-text-muted font-medium">
                or email
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>
          </div>
        )}

        {/* Error Alert */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-2.5 text-xs text-rose-500 animate-in fade-in">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p className="leading-relaxed">{errorMessage}</p>
          </div>
        )}

        {/* Reset Success */}
        {resetSentMessage && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-2.5 text-xs text-emerald-500">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p className="leading-relaxed">{resetSentMessage}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleAuthSubmit} className="space-y-3 text-xs">
          {!isForgotPassword && authModalTab === 'signup' && (
            <>
              <div>
                <label className="block font-medium text-text-secondary mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  id="auth-input-name"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="e.g. Mia Lindqvist"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-elevated border border-border text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>

              <div>
                <label className="block font-medium text-text-secondary mb-1">
                  Username
                </label>
                <input
                  type="text"
                  id="auth-input-username"
                  value={username}
                  onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  placeholder="e.g. mialindqvist"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-elevated border border-border text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <p className="text-[10px] text-text-muted mt-1">Lowercase letters, numbers, and underscores only</p>
              </div>
            </>
          )}

          <div>
            <label className="block font-medium text-text-secondary mb-1">
              Email Address
            </label>
            <input
              type="email"
              id="auth-input-email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@domain.com"
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-elevated border border-border text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          {!isForgotPassword && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-medium text-text-secondary">
                  Password
                </label>
                {authModalTab === 'login' && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsForgotPassword(true);
                      setErrorMessage(null);
                    }}
                    className="text-[11px] text-text-muted hover:text-text-primary cursor-pointer"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                type="password"
                id="auth-input-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-elevated border border-border text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          )}

          <button
            type="submit"
            id="btn-auth-submit"
            disabled={isLoading}
            className="w-full py-2.5 rounded-full bg-accent hover:bg-accent-hover text-white font-medium transition-colors mt-2 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 shadow-soft"
          >
            {isLoading ? (
              <span>Please wait...</span>
            ) : isForgotPassword ? (
              <>
                <KeyRound className="w-3.5 h-3.5" />
                <span>Send Reset Link</span>
              </>
            ) : authModalTab === 'login' ? (
              <>
                <LogIn className="w-3.5 h-3.5" />
                <span>Log In</span>
              </>
            ) : (
              <>
                <UserPlus className="w-3.5 h-3.5" />
                <span>Create Account</span>
              </>
            )}
          </button>

          {isForgotPassword && (
            <button
              type="button"
              onClick={() => {
                setIsForgotPassword(false);
                setErrorMessage(null);
              }}
              className="w-full text-center text-xs text-text-muted hover:text-text-primary pt-1 cursor-pointer"
            >
              Back to Log In
            </button>
          )}
        </form>

        {/* Demo Quick Sign-in Grid (ONLY in mock mode) */}
        {isMockMode && (
          <div className="pt-2 border-t border-border space-y-2">
            <div className="flex items-center justify-between text-[11px] font-medium text-text-muted">
              <span>Quick Demo Accounts (Mock Mode):</span>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {users.slice(0, 4).map(u => (
                <button
                  key={u.id}
                  id={`quick-login-${u.username}`}
                  onClick={() => loginUser(u)}
                  className="flex items-center gap-2 p-2 rounded-xl bg-surface-elevated border border-border text-left hover:border-accent transition-all text-xs cursor-pointer"
                >
                  <Avatar src={u.avatarUrl} alt={u.displayName} size="xs" />
                  <div className="min-w-0">
                    <p className="font-medium text-text-primary truncate text-[11px]">
                      {u.displayName}
                    </p>
                    <p className="text-[10px] text-text-muted truncate">
                      @{u.username}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
