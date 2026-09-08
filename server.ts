import express, { Response } from 'express';
import path from 'path';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { getR2Config } from './server/config';
import {
  createPresignedUploadUrl,
  uploadBufferToR2,
  deleteR2MediaObject,
  MediaUploadType,
} from './server/r2';
import { requireAuth, AuthenticatedRequest } from './server/auth';
import { fetchGA4TopCountries, fetchGA4CombinedBreakdowns } from './server/ga4DataService';
import { verifyAuthToken, getAdminDb } from './server/firebaseAdmin';

// Load environment variables
dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: '5mb' }));

  // ================= API ROUTES FIRST =================

  // 1. Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'KROMA Visual Discovery Platform API',
      timestamp: new Date().toISOString(),
    });
  });

  // 1b. GA4 Combined Analytics Breakdowns Endpoint (Server-Side GA4 Data API Proxy - Single Batched Daily Cache)
  app.get('/api/analytics/breakdowns', async (req, res): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
          configured: false,
          countries: [],
          devices: { desktop: 0, mobile: 0, tablet: 0, total: 0, desktopPct: 0, mobilePct: 0, tabletPct: 0, list: [] },
          sources: [],
          error: 'Unauthorized',
          message: 'Authentication required to access creator analytics.',
        });
        return;
      }

      const decodedToken = await verifyAuthToken(authHeader);
      if (!decodedToken || !decodedToken.uid) {
        res.status(401).json({
          configured: false,
          countries: [],
          devices: { desktop: 0, mobile: 0, tablet: 0, total: 0, desktopPct: 0, mobilePct: 0, tabletPct: 0, list: [] },
          sources: [],
          error: 'Unauthorized',
          message: 'Invalid or expired authentication token.',
        });
        return;
      }

      const requestedCreatorId = req.query.creatorId as string | undefined;
      const postId = req.query.postId as string | undefined;
      const days = req.query.days ? parseInt(req.query.days as string, 10) : 30;

      // Verify creator ownership
      if (requestedCreatorId && requestedCreatorId !== decodedToken.uid) {
        res.status(403).json({
          configured: false,
          countries: [],
          devices: { desktop: 0, mobile: 0, tablet: 0, total: 0, desktopPct: 0, mobilePct: 0, tabletPct: 0, list: [] },
          sources: [],
          error: 'Forbidden',
          message: 'You are not authorized to view analytics for this creator profile.',
        });
        return;
      }

      // If postId provided, verify post ownership if Firestore admin is available
      if (postId) {
        const adminDb = getAdminDb();
        if (adminDb) {
          try {
            const postDoc = await adminDb.collection('posts').doc(postId).get();
            if (postDoc.exists) {
              const postData = postDoc.data();
              if (postData?.creatorId && postData.creatorId !== decodedToken.uid) {
                res.status(403).json({
                  configured: false,
                  countries: [],
                  devices: { desktop: 0, mobile: 0, tablet: 0, total: 0, desktopPct: 0, mobilePct: 0, tabletPct: 0, list: [] },
                  sources: [],
                  error: 'Forbidden',
                  message: 'You are not authorized to view analytics for this post.',
                });
                return;
              }
            }
          } catch (dbErr) {
            console.warn('[GA4 Server Route] Could not verify post ownership via admin DB:', dbErr);
          }
        }
      }

      const effectiveCreatorId = requestedCreatorId || (postId ? undefined : decodedToken.uid);

      const report = await fetchGA4CombinedBreakdowns({
        creatorId: effectiveCreatorId,
        postId: postId || undefined,
        days: isNaN(days) ? 30 : days,
      });

      res.setHeader('Cache-Control', 'private, max-age=1800');
      res.json(report);
    } catch (err: any) {
      console.error('Error in /api/analytics/breakdowns route:', err);
      res.status(500).json({
        configured: false,
        countries: [],
        devices: { desktop: 0, mobile: 0, tablet: 0, total: 0, desktopPct: 0, mobilePct: 0, tabletPct: 0, list: [] },
        sources: [],
        error: 'Failed to retrieve analytics breakdown report',
        message: err?.message,
      });
    }
  });

  // 1c. GA4 Top Countries Analytics Endpoint (Server-Side GA4 Data API Proxy - Protected & Owner-Only)
  app.get('/api/analytics/countries', async (req, res): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
          configured: false,
          data: [],
          total: 0,
          error: 'Unauthorized',
          message: 'Authentication required to access creator analytics.',
        });
        return;
      }

      const decodedToken = await verifyAuthToken(authHeader);
      if (!decodedToken || !decodedToken.uid) {
        res.status(401).json({
          configured: false,
          data: [],
          total: 0,
          error: 'Unauthorized',
          message: 'Invalid or expired authentication token.',
        });
        return;
      }

      const requestedCreatorId = req.query.creatorId as string | undefined;
      const postId = req.query.postId as string | undefined;
      const days = req.query.days ? parseInt(req.query.days as string, 10) : 30;

      // Verify creator ownership
      if (requestedCreatorId && requestedCreatorId !== decodedToken.uid) {
        res.status(403).json({
          configured: false,
          data: [],
          total: 0,
          error: 'Forbidden',
          message: 'You are not authorized to view analytics for this creator profile.',
        });
        return;
      }

      // If postId provided, verify post ownership if Firestore admin is available
      if (postId) {
        const adminDb = getAdminDb();
        if (adminDb) {
          try {
            const postDoc = await adminDb.collection('posts').doc(postId).get();
            if (postDoc.exists) {
              const postData = postDoc.data();
              if (postData?.creatorId && postData.creatorId !== decodedToken.uid) {
                res.status(403).json({
                  configured: false,
                  data: [],
                  total: 0,
                  error: 'Forbidden',
                  message: 'You are not authorized to view analytics for this post.',
                });
                return;
              }
            }
          } catch (dbErr) {
            console.warn('[GA4 Server Route] Could not verify post ownership via admin DB:', dbErr);
          }
        }
      }

      const effectiveCreatorId = requestedCreatorId || (postId ? undefined : decodedToken.uid);

      const report = await fetchGA4TopCountries({
        creatorId: effectiveCreatorId,
        postId: postId || undefined,
        days: isNaN(days) ? 30 : days,
      });

      res.setHeader('Cache-Control', 'private, max-age=1800');
      res.json(report);
    } catch (err: any) {
      console.error('Error in /api/analytics/countries route:', err);
      res.status(500).json({
        configured: false,
        data: [],
        total: 0,
        error: 'Failed to retrieve analytics geo report',
        message: err?.message,
      });
    }
  });

  // 2. Safe Public Media Config (No secrets exposed!)
  app.get('/api/media/config', (_req, res) => {
    const config = getR2Config();
    res.json({
      publicUrl: config.publicUrl,
      bucketName: config.bucketName,
    });
  });

  // 2b. Secure Image Download Stream (Guarantees true file download without CORS or navigation)
  app.get('/api/media/download', async (req, res): Promise<void> => {
    try {
      const { url, filename } = req.query as { url?: string; filename?: string };
      if (!url || typeof url !== 'string') {
        res.status(400).json({ error: 'Missing image URL' });
        return;
      }

      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        res.status(400).json({ error: 'Invalid image URL' });
        return;
      }

      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        res.status(400).json({ error: 'Invalid URL protocol' });
        return;
      }

      const safeFilename =
        filename && typeof filename === 'string'
          ? filename.replace(/[^a-zA-Z0-9._-]/g, '_')
          : 'kroma-visual.jpg';

      const imageResponse = await fetch(url);
      if (!imageResponse.ok) {
        res.status(imageResponse.status).json({ error: 'Failed to fetch upstream image' });
        return;
      }

      const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
      const arrayBuffer = await imageResponse.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
      res.setHeader('Content-Length', buffer.length.toString());
      res.send(buffer);
    } catch (err: any) {
      console.error('Error in media download endpoint:', err);
      res.status(500).json({ error: 'Download error', message: err.message });
    }
  });

  // 3. Direct Server-Side Upload to Cloudflare R2 (Guarantees no CORS or client network issues)
  app.post(
    '/api/media/upload',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      try {
        const uid = req.user?.uid;
        if (!uid) {
          res.status(401).json({ error: 'Unauthorized user UID' });
          return;
        }
        const { type, postId, contentType, base64Data } = req.body as {
          type: MediaUploadType;
          postId?: string;
          contentType?: string;
          base64Data?: string;
        };

        if (!type || !['avatar', 'cover', 'post-main', 'post-thumb'].includes(type)) {
          res.status(400).json({
            error: 'Invalid upload type',
            message: 'Type must be one of: avatar, cover, post-main, post-thumb',
          });
          return;
        }

        if (!base64Data || typeof base64Data !== 'string') {
          res.status(400).json({
            error: 'Missing base64Data',
            message: 'base64Data is required for direct upload',
          });
          return;
        }

        // Clean base64 string
        const cleanBase64 = base64Data.replace(/^data:[a-zA-Z0-9/+-]+;base64,/, '');
        const buffer = Buffer.from(cleanBase64, 'base64');

        const allowedTypes = ['image/webp', 'image/jpeg', 'image/png', 'image/avif'];
        const validatedContentType =
          contentType && allowedTypes.includes(contentType.toLowerCase())
            ? contentType.toLowerCase()
            : 'image/webp';

        const result = await uploadBufferToR2({
          uid,
          type,
          postId,
          buffer,
          contentType: validatedContentType,
        });

        res.json({
          success: true,
          objectKey: result.objectKey,
          publicUrl: result.publicUrl,
        });
      } catch (err: any) {
        console.error('Error in direct R2 upload:', err);
        res.status(500).json({
          error: 'Upload Error',
          message: err.message || 'Failed to upload image directly to storage.',
        });
      }
    }
  );

  // 4. Generate Presigned R2 Upload URL
  app.post(
    '/api/media/presign',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      try {
        const uid = req.user?.uid;
        if (!uid) {
          res.status(401).json({ error: 'Unauthorized user UID' });
          return;
        }

        const { type, postId, contentType } = req.body as {
          type: MediaUploadType;
          postId?: string;
          contentType?: string;
        };

        if (!type || !['avatar', 'cover', 'post-main', 'post-thumb'].includes(type)) {
          res.status(400).json({
            error: 'Invalid upload type',
            message: 'Type must be one of: avatar, cover, post-main, post-thumb',
          });
          return;
        }

        if ((type === 'post-main' || type === 'post-thumb') && !postId) {
          res.status(400).json({
            error: 'Missing postId',
            message: 'postId is required when requesting post media presigned URLs',
          });
          return;
        }

        // Validate content-type
        const allowedTypes = ['image/webp', 'image/jpeg', 'image/png', 'image/avif'];
        const validatedContentType =
          contentType && allowedTypes.includes(contentType.toLowerCase())
            ? contentType.toLowerCase()
            : 'image/webp';

        const result = await createPresignedUploadUrl({
          uid,
          type,
          postId,
          contentType: validatedContentType,
        });

        res.json({
          success: true,
          uploadUrl: result.uploadUrl,
          objectKey: result.objectKey,
          publicUrl: result.publicUrl,
          expiresInSeconds: result.expiresInSeconds,
        });
      } catch (err: any) {
        console.error('Error generating presigned URL:', err);
        res.status(500).json({
          error: 'Presign Error',
          message: err.message || 'Failed to generate secure presigned upload URL.',
        });
      }
    }
  );

  // 4. Secure Media Delete Endpoint
  app.post(
    '/api/media/delete',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      try {
        const uid = req.user?.uid;
        if (!uid) {
          res.status(401).json({ error: 'Unauthorized user UID' });
          return;
        }

        const { objectKey } = req.body as { objectKey: string };
        if (!objectKey || typeof objectKey !== 'string') {
          res.status(400).json({ error: 'Missing objectKey' });
          return;
        }

        await deleteR2MediaObject(uid, objectKey);

        res.json({
          success: true,
          message: 'Media deleted successfully from storage.',
        });
      } catch (err: any) {
        console.error('Error deleting media:', err);
        res.status(500).json({
          error: 'Delete Error',
          message: err.message || 'Failed to delete media asset.',
        });
      }
    }
  );

  // 5. Automatic Scheduled Post Publisher API (for cron invocation or manual worker triggers)
  app.all(['/api/cron/publish-scheduled', '/api/scheduled/publish-due'], async (_req: express.Request, res: Response): Promise<void> => {
    try {
      const { publishDueScheduledPostsAdmin } = await import('./server/scheduledPublisher');
      const result = await publishDueScheduledPostsAdmin(50);
      res.json({
        success: true,
        ...result,
      });
    } catch (err: any) {
      console.error('Error running scheduled post publisher:', err);
      res.status(500).json({
        success: false,
        error: err?.message || String(err),
      });
    }
  });

  // ================= VITE OR STATIC SERVING =================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`KROMA Fullstack Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
