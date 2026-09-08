import { initializeApp, cert, getApps, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';

let adminApp: App | null = null;
let adminDb: Firestore | null = null;
let adminAuth: Auth | null = null;

/**
 * Initializes and caches the singleton Firebase Admin SDK application.
 * Securely reads service account credentials from server environment variables.
 * Never leaks secret values to logs or client bundles.
 */
export function getAdminApp(): App | null {
  if (adminApp) return adminApp;

  const existingApps = getApps();
  if (existingApps.length > 0) {
    adminApp = existingApps[0];
    return adminApp;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    console.warn(
      '[Firebase Admin] Configuration incomplete. Missing server environment variable(s): FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY.'
    );
    return null;
  }

  try {
    adminApp = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
    });
    return adminApp;
  } catch (err: any) {
    console.error('[Firebase Admin] Initialization failed:', err?.message || 'Unknown error');
    return null;
  }
}

/**
 * Retrieves the Firebase Admin Firestore instance.
 */
export function getAdminDb(): Firestore | null {
  if (adminDb) return adminDb;
  const app = getAdminApp();
  if (!app) return null;
  adminDb = getFirestore(app);
  return adminDb;
}

/**
 * Retrieves the Firebase Admin Auth instance.
 */
export function getAdminAuth(): Auth | null {
  if (adminAuth) return adminAuth;
  const app = getAdminApp();
  if (!app) return null;
  adminAuth = getAuth(app);
  return adminAuth;
}

/**
 * Verifies a Firebase Auth ID token from an Authorization header.
 *
 * PRODUCTION:
 * - Strictly cryptographically verified via Firebase Admin SDK (auth.verifyIdToken).
 * - Never decodes unverified JWT payloads.
 * - Never accepts arbitrary token strings or generates fallback UIDs.
 * - If verification fails, expired, or unconfigured, returns null (yielding 401 in callers).
 *
 * LOCAL DEVELOPMENT ONLY:
 * - Gated strictly by NODE_ENV !== 'production' and absence of NETLIFY runtime.
 * - Allows explicit 'mock_' or 'demo_' prefixes for isolated local testing.
 */
export async function verifyAuthToken(
  authHeader?: string
): Promise<{ uid: string; email?: string } | null> {
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.split('Bearer ')[1]?.trim();
  if (!token) return null;

  const isProduction =
    process.env.NODE_ENV === 'production' ||
    process.env.NETLIFY === 'true' ||
    Boolean(process.env.CONTEXT && process.env.CONTEXT !== 'dev');

  // LOCAL DEVELOPMENT ONLY: Explicit mock or demo tokens for local test suites
  if (!isProduction) {
    if (token.startsWith('mock_') || token.startsWith('demo_')) {
      return { uid: token, email: `${token}@kroma.art` };
    }
  }

  // PRODUCTION & STANDARD AUTH: Strictly cryptographically verify via Firebase Admin SDK
  const auth = getAdminAuth();
  if (!auth) {
    console.error(
      '[Auth] Firebase Admin Auth is not configured. Server credentials (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) are required to verify ID tokens.'
    );
    return null;
  }

  try {
    const decoded = await auth.verifyIdToken(token);
    if (decoded && decoded.uid) {
      return {
        uid: decoded.uid,
        email: decoded.email,
      };
    }
    return null;
  } catch (adminErr: any) {
    console.warn('[Auth] Token verification rejected:', adminErr?.message || 'Invalid or expired token');
    return null;
  }
}
