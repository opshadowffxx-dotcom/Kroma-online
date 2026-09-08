/**
 * Firebase Client Configuration
 */

export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

// Project Firebase configuration (public Web client credentials)
export const firebaseConfig: FirebaseClientConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCZWSt408Yfuqu2x9EvvDSk4CQf89hZMxw",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "kroma-f42e2.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "kroma-f42e2",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "kroma-f42e2.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "178368660820",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:178368660820:web:29391f926e1bacbf44f4c1",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-33T9JXXM27",
};

/**
 * Status indicator to check whether Firebase credentials have been configured.
 */
export const isFirebaseConfigured = (): boolean => {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    !firebaseConfig.apiKey.includes('mock')
  );
};

/**
 * Check if mock mode is explicitly enabled via environment variable.
 * Default is FALSE in production, meaning 100% real Firebase Firestore & Auth.
 */
export const isMockModeEnabled = (): boolean => {
  return import.meta.env.VITE_USE_MOCK_DATA === 'true';
};
