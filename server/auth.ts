import { Request, Response, NextFunction } from 'express';
import { verifyAuthToken } from './firebaseAdmin';

export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email?: string;
    name?: string;
  };
}

export { verifyAuthToken };

/**
 * Decodes and verifies a Firebase ID token.
 */
export async function verifyFirebaseIdToken(token: string): Promise<{ uid: string; email?: string } | null> {
  return verifyAuthToken(`Bearer ${token}`);
}

/**
 * Express middleware to ensure user is authenticated with Firebase before accessing sensitive endpoints.
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing or malformed Authorization header. Bearer <Firebase_ID_Token> is required.',
      });
      return;
    }

    const verified = await verifyAuthToken(authHeader);

    if (!verified || !verified.uid) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired Firebase ID token.',
      });
      return;
    }

    req.user = verified;
    next();
  } catch (err: any) {
    res.status(500).json({
      error: 'Authentication Error',
      message: err.message || 'Failed to authenticate request.',
    });
  }
}
