import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInAnonymously,
  GoogleAuthProvider,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb, handleFirestoreError, OperationType } from './index';
import { checkUsernameAvailable } from './userService';
import { User } from '../../types';

export const formatAuthErrorMessage = (error: unknown): string => {
  if (!(error instanceof Error)) return 'An unexpected authentication error occurred.';
  const message = error.message;

  if (message.includes('auth/invalid-credential') || message.includes('auth/wrong-password') || message.includes('auth/user-not-found')) {
    return 'Invalid email address or password. Please check your credentials and try again.';
  }
  if (message.includes('auth/email-already-in-use')) {
    return 'An account with this email already exists. Please sign in instead.';
  }
  if (message.includes('auth/weak-password')) {
    return 'Password should be at least 6 characters long.';
  }
  if (message.includes('auth/invalid-email')) {
    return 'Please enter a valid email address.';
  }
  if (message.includes('auth/popup-closed-by-user')) {
    return 'Google sign-in window was closed before completing.';
  }
  if (message.includes('auth/popup-blocked')) {
    return 'Google sign-in popup was blocked by your browser. Please allow popups for this site.';
  }
  if (message.includes('auth/network-request-failed')) {
    return 'Network connection failed. Please check your internet connection and try again.';
  }
  if (message.includes('username-taken')) {
    return 'This username is already taken. Please choose another username.';
  }
  return message.replace(/^Firebase:\s*/, '');
};

/**
 * Sign in with Email and Password
 */
export const signInWithEmail = async (email: string, password: string): Promise<FirebaseUser> => {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Firebase Auth is not initialized.');
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  return credential.user;
};

/**
 * Create a new account with Email and Password
 */
export const signUpWithEmail = async (
  email: string,
  password: string,
  displayName: string,
  username: string
): Promise<{ user: FirebaseUser; userProfile: User }> => {
  const auth = getFirebaseAuth();
  const db = getFirebaseDb();
  if (!auth) throw new Error('Firebase Auth is not initialized.');

  const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (!cleanUsername || cleanUsername.length < 2) {
    throw new Error('Username must be at least 2 characters (letters, numbers, underscores).');
  }

  // Check username availability
  const isAvailable = await checkUsernameAvailable(cleanUsername);
  if (!isAvailable) {
    throw new Error('username-taken: This username is already taken. Please choose another.');
  }

  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  const fbUser = credential.user;

  // Set display name in auth profile
  await updateProfile(fbUser, { displayName: displayName.trim() || cleanUsername });

  const userProfile: User = {
    id: fbUser.uid,
    username: cleanUsername,
    displayName: displayName.trim() || cleanUsername,
    email: fbUser.email || email.trim(),
    avatarUrl: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=300&auto=format&fit=crop`,
    bio: '',
    websiteUrl: '',
    followersCount: 0,
    followingCount: 0,
    postsCount: 0,
    collectionsCount: 0,
    isAdmin: false,
    createdAt: new Date().toISOString(),
  };

  if (db) {
    try {
      await setDoc(doc(db, 'users', fbUser.uid), userProfile);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${fbUser.uid}`);
    }
  }

  return { user: fbUser, userProfile };
};

/**
 * Sign in with Google Popup
 */
export const signInWithGoogle = async (): Promise<{ user: FirebaseUser; userProfile: User }> => {
  const auth = getFirebaseAuth();
  const db = getFirebaseDb();
  if (!auth) throw new Error('Firebase Auth is not initialized.');

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const credential = await signInWithPopup(auth, provider);
  const fbUser = credential.user;

  let userProfile: User;

  if (db) {
    try {
      const userDocRef = doc(db, 'users', fbUser.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        userProfile = { ...userDoc.data(), id: userDoc.id } as User;
      } else {
        // Derive initial clean username from email or display name
        const rawBase = (fbUser.displayName || fbUser.email?.split('@')[0] || 'creator')
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, '')
          .slice(0, 18);
        
        let initialUsername = rawBase || `creator_${fbUser.uid.slice(0, 5)}`;
        const isAvail = await checkUsernameAvailable(initialUsername);
        if (!isAvail) {
          initialUsername = `${initialUsername}_${Math.floor(100 + Math.random() * 900)}`;
        }

        userProfile = {
          id: fbUser.uid,
          username: initialUsername,
          displayName: fbUser.displayName || initialUsername,
          email: fbUser.email || '',
          avatarUrl:
            fbUser.photoURL ||
            'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=300&auto=format&fit=crop',
          bio: '',
          websiteUrl: '',
          followersCount: 0,
          followingCount: 0,
          postsCount: 0,
          collectionsCount: 0,
          isAdmin: false,
          createdAt: new Date().toISOString(),
        };
        await setDoc(userDocRef, userProfile);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `users/${fbUser.uid}`);
      userProfile = {
        id: fbUser.uid,
        username: (fbUser.email?.split('@')[0] || 'creator').toLowerCase().replace(/[^a-z0-9_]/g, ''),
        displayName: fbUser.displayName || 'Creator',
        email: fbUser.email || '',
        avatarUrl: fbUser.photoURL || '',
        followersCount: 0,
        followingCount: 0,
        postsCount: 0,
        collectionsCount: 0,
        isAdmin: false,
        createdAt: new Date().toISOString(),
      };
    }
  } else {
    userProfile = {
      id: fbUser.uid,
      username: (fbUser.email?.split('@')[0] || 'creator').toLowerCase().replace(/[^a-z0-9_]/g, ''),
      displayName: fbUser.displayName || 'Creator',
      email: fbUser.email || '',
      avatarUrl: fbUser.photoURL || '',
      followersCount: 0,
      followingCount: 0,
      postsCount: 0,
      collectionsCount: 0,
      isAdmin: false,
      createdAt: new Date().toISOString(),
    };
  }

  return { user: fbUser, userProfile };
};

/**
 * Send password reset email
 */
export const resetPassword = async (email: string): Promise<void> => {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Firebase Auth is not initialized.');
  await sendPasswordResetEmail(auth, email.trim());
};

/**
 * Sign out current user
 */
export const signOutFirebase = async (): Promise<void> => {
  const auth = getFirebaseAuth();
  if (auth) {
    await signOut(auth);
  }
};

/**
 * Auth state listener
 */
export const subscribeToAuthState = (
  callback: (user: FirebaseUser | null) => void
): (() => void) => {
  const auth = getFirebaseAuth();
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
};

let anonymousSignInPromise: Promise<FirebaseUser | null> | null = null;

/**
 * Ensures a valid Firebase Auth user session exists, attempting anonymous sign-in if no user is signed in.
 * Deduplicates concurrent calls via an in-flight promise.
 */
export const ensureFirebaseAuthUser = async (): Promise<FirebaseUser | null> => {
  const auth = getFirebaseAuth();
  if (!auth) return null;
  if (auth.currentUser) return auth.currentUser;

  if (anonymousSignInPromise) {
    return anonymousSignInPromise;
  }

  anonymousSignInPromise = (async () => {
    try {
      if (auth.currentUser) return auth.currentUser;
      const cred = await signInAnonymously(auth);
      return cred.user;
    } catch (err) {
      console.warn('Anonymous auth fallback unavailable (verify Anonymous sign-in provider is enabled in Firebase Console):', err);
      return null;
    } finally {
      anonymousSignInPromise = null;
    }
  })();

  return anonymousSignInPromise;
};

