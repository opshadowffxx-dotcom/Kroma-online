import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  increment,
  limit,
  writeBatch,
} from 'firebase/firestore';
import { getFirebaseDb, handleFirestoreError, OperationType } from './index';
import { User } from '../../types';

const USERS_COLLECTION = 'users';

/**
 * Fetch a single user profile by UID
 */
export const fetchFirestoreUser = async (userId: string): Promise<User | null> => {
  const db = getFirebaseDb();
  if (!db || !userId) return null;

  try {
    const userSnap = await getDoc(doc(db, USERS_COLLECTION, userId));
    if (userSnap.exists()) {
      return { ...userSnap.data(), id: userSnap.id } as User;
    }
    return null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `${USERS_COLLECTION}/${userId}`);
    return null;
  }
};

/**
 * Fetch user by username slug
 */
export const fetchFirestoreUserByUsername = async (
  username: string
): Promise<User | null> => {
  const db = getFirebaseDb();
  if (!db || !username) return null;

  const normalized = username.trim().toLowerCase();

  try {
    const q = query(
      collection(db, USERS_COLLECTION),
      where('username', '==', normalized),
      limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const docSnap = snap.docs[0];
      return { ...docSnap.data(), id: docSnap.id } as User;
    }
    return null;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, USERS_COLLECTION);
    return null;
  }
};

/**
 * Check if a username is available (for signup/profile changes)
 */
export const checkUsernameAvailable = async (
  username: string,
  excludeUserId?: string
): Promise<boolean> => {
  const db = getFirebaseDb();
  if (!db) return true;

  const normalized = username.trim().toLowerCase();
  if (!normalized || normalized.length < 2) return false;

  try {
    const q = query(
      collection(db, USERS_COLLECTION),
      where('username', '==', normalized),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return true;
    if (excludeUserId && snap.docs[0].id === excludeUserId) return true;
    return false;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, USERS_COLLECTION);
    return true; // Don't hard-block on transient read error
  }
};

/**
 * Update user profile
 */
export const updateFirestoreUserProfile = async (
  userId: string,
  updates: Partial<User>
): Promise<void> => {
  const db = getFirebaseDb();
  if (!db || !userId) return;

  try {
    // Remove undefined properties and protect system/immutable fields
    const cleanedUpdates: Record<string, any> = {};
    Object.entries(updates).forEach(([key, val]) => {
      if (
        val !== undefined &&
        key !== 'id' &&
        key !== 'createdAt' &&
        key !== 'isAdmin' &&
        key !== 'isVerified'
      ) {
        cleanedUpdates[key] = val;
      }
    });

    const userRef = doc(db, USERS_COLLECTION, userId);
    // Use setDoc with merge to ensure non-existent or partial profiles update without permissions error
    await setDoc(userRef, cleanedUpdates, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `${USERS_COLLECTION}/${userId}`);
    throw err;
  }
};

/**
 * Toggle follow/unfollow user in Firestore with subcollections and atomic increments
 */
export const toggleFirestoreFollowUser = async (
  currentUserId: string,
  targetUserId: string,
  isFollowing: boolean
): Promise<void> => {
  const db = getFirebaseDb();
  if (!db || !currentUserId || !targetUserId || currentUserId === targetUserId) return;

  const now = new Date().toISOString();
  const followingDocRef = doc(db, USERS_COLLECTION, currentUserId, 'following', targetUserId);
  const followerDocRef = doc(db, USERS_COLLECTION, targetUserId, 'followers', currentUserId);
  const currentUserRef = doc(db, USERS_COLLECTION, currentUserId);
  const targetUserRef = doc(db, USERS_COLLECTION, targetUserId);

  // Try batch first
  try {
    const batch = writeBatch(db);
    if (isFollowing) {
      batch.set(followingDocRef, {
        targetUserId,
        createdAt: now,
      });
      batch.set(followerDocRef, {
        sourceUserId: currentUserId,
        createdAt: now,
      });
      batch.update(currentUserRef, {
        followingCount: increment(1),
      });
      batch.update(targetUserRef, {
        followersCount: increment(1),
      });
    } else {
      batch.delete(followingDocRef);
      batch.delete(followerDocRef);
      batch.update(currentUserRef, {
        followingCount: increment(-1),
      });
      batch.update(targetUserRef, {
        followersCount: increment(-1),
      });
    }

    await batch.commit();
    return;
  } catch (batchErr) {
    console.warn('Batch follow commit had an issue, attempting individual operations:', batchErr);
  }

  // Fallback: Individual operations
  try {
    if (isFollowing) {
      await setDoc(followingDocRef, { targetUserId, createdAt: now });
    } else {
      await deleteDoc(followingDocRef);
    }
  } catch (err) {
    console.error('Error updating following doc:', err);
    handleFirestoreError(err, OperationType.UPDATE, `${USERS_COLLECTION}/${currentUserId}/following/${targetUserId}`);
    throw err;
  }

  try {
    if (isFollowing) {
      await setDoc(followerDocRef, { sourceUserId: currentUserId, createdAt: now });
    } else {
      await deleteDoc(followerDocRef);
    }
  } catch (fErr) {
    console.warn('Could not write target follower doc (non-blocking):', fErr);
  }

  try {
    await updateDoc(currentUserRef, {
      followingCount: increment(isFollowing ? 1 : -1),
    });
  } catch (cErr) {
    console.warn('Could not update currentUser followingCount (non-blocking):', cErr);
  }

  try {
    await updateDoc(targetUserRef, {
      followersCount: increment(isFollowing ? 1 : -1),
    });
  } catch (tErr) {
    console.warn('Could not update targetUser followersCount (non-blocking):', tErr);
  }
};

/**
 * Fetch all user IDs that current user is following
 */
export const fetchUserFollowingIds = async (userId: string): Promise<string[]> => {
  const db = getFirebaseDb();
  if (!db || !userId) return [];

  try {
    const snap = await getDocs(collection(db, USERS_COLLECTION, userId, 'following'));
    const ids: string[] = [];
    snap.forEach(docSnap => {
      ids.push(docSnap.id);
    });
    return ids;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `${USERS_COLLECTION}/${userId}/following`);
    return [];
  }
};

/**
 * Increment total profile views for a user doc in Firestore
 */
export const incrementFirestoreProfileViews = async (targetUserId: string): Promise<void> => {
  const db = getFirebaseDb();
  if (!db || !targetUserId) return;

  try {
    const userRef = doc(db, USERS_COLLECTION, targetUserId);
    await updateDoc(userRef, {
      profileViews: increment(1),
    });
  } catch (err) {
    console.warn('Could not increment profile views:', err);
  }
};

/**
 * Fetch followers history for a creator from their followers subcollection
 */
export interface CreatorFollowerRecord {
  sourceUserId: string;
  createdAt: string;
}

export const fetchCreatorFollowersHistory = async (
  creatorId: string
): Promise<CreatorFollowerRecord[]> => {
  const db = getFirebaseDb();
  if (!db || !creatorId) return [];

  try {
    const snap = await getDocs(collection(db, USERS_COLLECTION, creatorId, 'followers'));
    const records: CreatorFollowerRecord[] = [];
    snap.forEach(docSnap => {
      const data = docSnap.data();
      if (data && data.createdAt) {
        records.push({
          sourceUserId: data.sourceUserId || docSnap.id,
          createdAt: data.createdAt,
        });
      }
    });
    return records;
  } catch {
    return [];
  }
};

export { syncCreatorIdentityToPosts } from './postService';
