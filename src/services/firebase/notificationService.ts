import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch,
  query,
  where,
  orderBy,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseDb, handleFirestoreError, OperationType } from './index';
import { AppNotification } from '../../types';

const NOTIFICATIONS_COLLECTION = 'notifications';

/**
 * Subscribe to user notifications in Firestore
 */
export const subscribeToFirestoreNotifications = (
  userId: string,
  onNotificationsUpdate: (notifications: AppNotification[]) => void
): Unsubscribe => {
  const db = getFirebaseDb();
  if (!db || !userId) return () => {};

  const q = query(
    collection(db, NOTIFICATIONS_COLLECTION),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(
    q,
    snapshot => {
      const notifications: AppNotification[] = [];
      snapshot.forEach(docSnap => {
        notifications.push({ ...docSnap.data(), id: docSnap.id } as AppNotification);
      });
      onNotificationsUpdate(notifications);
    },
    error => {
      handleFirestoreError(error, OperationType.LIST, NOTIFICATIONS_COLLECTION);
    }
  );
};

/**
 * Mark a single notification as read
 */
export const markFirestoreNotificationRead = async (
  notificationId: string
): Promise<void> => {
  const db = getFirebaseDb();
  if (!db) return;

  try {
    const notifRef = doc(db, NOTIFICATIONS_COLLECTION, notificationId);
    await updateDoc(notifRef, { isRead: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `${NOTIFICATIONS_COLLECTION}/${notificationId}`);
  }
};

/**
 * Mark all notifications as read for a user
 */
export const markAllFirestoreNotificationsRead = async (
  userId: string,
  unreadNotifications: AppNotification[]
): Promise<void> => {
  const db = getFirebaseDb();
  if (!db || unreadNotifications.length === 0) return;

  try {
    const batch = writeBatch(db);
    unreadNotifications.forEach(n => {
      const notifRef = doc(db, NOTIFICATIONS_COLLECTION, n.id);
      batch.update(notifRef, { isRead: true });
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, NOTIFICATIONS_COLLECTION);
  }
};

/**
 * Create a new notification
 */
export const createFirestoreNotification = async (
  notification: AppNotification
): Promise<void> => {
  const db = getFirebaseDb();
  if (!db) return;

  try {
    const notifRef = doc(db, NOTIFICATIONS_COLLECTION, notification.id);
    await setDoc(notifRef, notification);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `${NOTIFICATIONS_COLLECTION}/${notification.id}`);
  }
};
