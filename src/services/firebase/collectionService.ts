import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  increment,
  arrayUnion,
  arrayRemove,
  runTransaction,
  Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseDb, handleFirestoreError, OperationType } from './index';
import { Collection } from '../../types';

const COLLECTIONS_COLLECTION = 'collections';

/**
 * Normalizes raw Firestore document data into a safe Collection object
 */
export const mapFirestoreCollection = (
  data: Record<string, any>,
  id: string
): Collection => {
  const postIds = Array.isArray(data.postIds) ? data.postIds : [];
  return {
    id,
    userId: typeof data.userId === 'string' ? data.userId : '',
    title: typeof data.title === 'string' ? data.title : 'Untitled Collection',
    description: typeof data.description === 'string' ? data.description : '',
    isPrivate: Boolean(data.isPrivate),
    coverImageUrl: typeof data.coverImageUrl === 'string' ? data.coverImageUrl : '',
    postIds,
    postsCount: typeof data.postsCount === 'number' ? Math.max(0, data.postsCount) : postIds.length,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
  };
};

/**
 * Fetch collections created by a user or public collections
 */
export const fetchFirestoreCollections = async (
  userId?: string
): Promise<Collection[]> => {
  const db = getFirebaseDb();
  if (!db) return [];

  try {
    let q;
    if (userId) {
      q = query(
        collection(db, COLLECTIONS_COLLECTION),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
      );
    } else {
      q = query(
        collection(db, COLLECTIONS_COLLECTION),
        where('isPrivate', '==', false),
        orderBy('createdAt', 'desc')
      );
    }

    const snap = await getDocs(q);
    const collections: Collection[] = [];
    snap.forEach(docSnap => {
      collections.push(mapFirestoreCollection(docSnap.data(), docSnap.id));
    });
    return collections;
  } catch (err: any) {
    console.error('fetchFirestoreCollections with orderBy error:', err);
    // Graceful fallback if composite index (userId + createdAt) is not yet enabled or building
    if (userId) {
      try {
        console.warn('Attempting fallback fetchFirestoreCollections without orderBy...');
        const fallbackQ = query(
          collection(db, COLLECTIONS_COLLECTION),
          where('userId', '==', userId)
        );
        const snap = await getDocs(fallbackQ);
        const collections: Collection[] = [];
        snap.forEach(docSnap => {
          collections.push(mapFirestoreCollection(docSnap.data(), docSnap.id));
        });
        collections.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return collections;
      } catch (fallbackErr) {
        console.error('fetchFirestoreCollections fallback query failed:', fallbackErr);
      }
    }
    handleFirestoreError(err, OperationType.LIST, COLLECTIONS_COLLECTION);
    return [];
  }
};

/**
 * Subscribe to collections for a user
 */
export const subscribeToFirestoreCollections = (
  userId: string | undefined,
  onCollectionsUpdate: (collections: Collection[]) => void
): Unsubscribe => {
  const db = getFirebaseDb();
  if (!db || !userId) return () => {};

  const q = query(
    collection(db, COLLECTIONS_COLLECTION),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );

  let fallbackUnsub: Unsubscribe | null = null;

  const primaryUnsub = onSnapshot(
    q,
    snapshot => {
      const collections: Collection[] = [];
      snapshot.forEach(docSnap => {
        collections.push(mapFirestoreCollection(docSnap.data(), docSnap.id));
      });
      onCollectionsUpdate(collections);
    },
    error => {
      console.error('Firestore subscribeToFirestoreCollections full error:', error);
      handleFirestoreError(error, OperationType.LIST, COLLECTIONS_COLLECTION);

      // Fallback listener without orderBy in case composite index is not yet built/enabled
      try {
        console.warn('Attempting fallback onSnapshot without composite orderBy for collections...');
        const fallbackQ = query(
          collection(db, COLLECTIONS_COLLECTION),
          where('userId', '==', userId)
        );
        fallbackUnsub = onSnapshot(
          fallbackQ,
          fallbackSnap => {
            const collections: Collection[] = [];
            fallbackSnap.forEach(docSnap => {
              collections.push(mapFirestoreCollection(docSnap.data(), docSnap.id));
            });
            collections.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            onCollectionsUpdate(collections);
          },
          fallbackErr => {
            console.error('Firestore fallback collections onSnapshot error:', fallbackErr);
          }
        );
      } catch (e) {
        console.error('Failed to attach fallback collection subscription:', e);
      }
    }
  );

  return () => {
    primaryUnsub();
    if (fallbackUnsub) {
      fallbackUnsub();
    }
  };
};

/**
 * Create a new collection in Firestore
 */
export const createFirestoreCollection = async (
  collectionData: Collection
): Promise<void> => {
  const db = getFirebaseDb();
  if (!db) return;

  try {
    const colRef = doc(db, COLLECTIONS_COLLECTION, collectionData.id);
    const cleanedCol: Record<string, any> = {
      id: collectionData.id,
      userId: collectionData.userId,
      title: collectionData.title,
      description: collectionData.description || '',
      isPrivate: Boolean(collectionData.isPrivate),
      coverImageUrl: collectionData.coverImageUrl || '',
      postIds: Array.isArray(collectionData.postIds) ? collectionData.postIds : [],
      postsCount: typeof collectionData.postsCount === 'number' ? collectionData.postsCount : 0,
      createdAt: collectionData.createdAt || new Date().toISOString(),
    };
    if (collectionData.updatedAt) {
      cleanedCol.updatedAt = collectionData.updatedAt;
    }

    await setDoc(colRef, cleanedCol);

    // Update user collections count
    try {
      const userRef = doc(db, 'users', collectionData.userId);
      await updateDoc(userRef, {
        collectionsCount: increment(1),
      });
    } catch {
      // Non-blocking
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `${COLLECTIONS_COLLECTION}/${collectionData.id}`);
    throw err;
  }
};

/**
 * Add a post to a collection using a transaction for counter accuracy with updateDoc fallback
 */
export const addPostToFirestoreCollection = async (
  collectionId: string,
  postId: string
): Promise<void> => {
  const db = getFirebaseDb();
  if (!db || !collectionId || !postId) return;

  const colRef = doc(db, COLLECTIONS_COLLECTION, collectionId);

  // Try transaction first
  try {
    await runTransaction(db, async transaction => {
      const colSnap = await transaction.get(colRef);
      if (!colSnap.exists()) {
        throw new Error(`Collection ${collectionId} does not exist`);
      }
      const data = colSnap.data();
      const currentPostIds: string[] = Array.isArray(data.postIds) ? data.postIds : [];
      if (!currentPostIds.includes(postId)) {
        const nextPostIds = [...currentPostIds, postId];
        transaction.update(colRef, {
          postIds: nextPostIds,
          postsCount: nextPostIds.length,
          updatedAt: new Date().toISOString(),
        });
      }
    });
    return;
  } catch (txErr) {
    console.warn('Transaction on collection failed, attempting updateDoc fallback:', txErr);
  }

  // Direct update fallback
  try {
    await updateDoc(colRef, {
      postIds: arrayUnion(postId),
      postsCount: increment(1),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Error adding post to collection in Firestore:', err);
    handleFirestoreError(err, OperationType.UPDATE, `${COLLECTIONS_COLLECTION}/${collectionId}`);
    throw err;
  }
};

/**
 * Remove a post from a collection using a transaction with updateDoc fallback
 */
export const removePostFromFirestoreCollection = async (
  collectionId: string,
  postId: string
): Promise<void> => {
  const db = getFirebaseDb();
  if (!db || !collectionId || !postId) return;

  const colRef = doc(db, COLLECTIONS_COLLECTION, collectionId);

  // Try transaction first
  try {
    await runTransaction(db, async transaction => {
      const colSnap = await transaction.get(colRef);
      if (!colSnap.exists()) return;
      const data = colSnap.data();
      const currentPostIds: string[] = Array.isArray(data.postIds) ? data.postIds : [];
      if (currentPostIds.includes(postId)) {
        const nextPostIds = currentPostIds.filter(id => id !== postId);
        transaction.update(colRef, {
          postIds: nextPostIds,
          postsCount: Math.max(0, nextPostIds.length),
          updatedAt: new Date().toISOString(),
        });
      }
    });
    return;
  } catch (txErr) {
    console.warn('Transaction on collection failed, attempting updateDoc fallback:', txErr);
  }

  // Direct update fallback
  try {
    await updateDoc(colRef, {
      postIds: arrayRemove(postId),
      postsCount: increment(-1),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Error removing post from collection in Firestore:', err);
    handleFirestoreError(err, OperationType.UPDATE, `${COLLECTIONS_COLLECTION}/${collectionId}`);
    throw err;
  }
};

/**
 * Delete a collection
 */
export const deleteFirestoreCollection = async (
  collectionId: string,
  userId?: string
): Promise<void> => {
  const db = getFirebaseDb();
  if (!db) return;

  try {
    await deleteDoc(doc(db, COLLECTIONS_COLLECTION, collectionId));
    if (userId) {
      try {
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, {
          collectionsCount: increment(-1),
        });
      } catch {
        // Non-blocking
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `${COLLECTIONS_COLLECTION}/${collectionId}`);
    throw err;
  }
};
