import type { Handler, HandlerEvent } from '@netlify/functions';
import { fetchGA4CombinedBreakdowns } from '../../server/ga4DataService';
import { verifyAuthToken, getAdminDb } from '../../server/firebaseAdmin';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed', message: 'Only GET requests are supported.' }),
    };
  }

  try {
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configured: false,
          countries: [],
          devices: { desktop: 0, mobile: 0, tablet: 0, total: 0, desktopPct: 0, mobilePct: 0, tabletPct: 0, list: [] },
          sources: [],
          surfaces: [],
          error: 'Unauthorized',
          message: 'Authentication required to access creator analytics.',
        }),
      };
    }

    const decodedToken = await verifyAuthToken(authHeader);
    if (!decodedToken || !decodedToken.uid) {
      return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configured: false,
          countries: [],
          devices: { desktop: 0, mobile: 0, tablet: 0, total: 0, desktopPct: 0, mobilePct: 0, tabletPct: 0, list: [] },
          sources: [],
          surfaces: [],
          error: 'Unauthorized',
          message: 'Invalid or expired authentication token.',
        }),
      };
    }

    const params = event.queryStringParameters || {};
    const requestedCreatorId = params.creatorId || undefined;
    const postId = params.postId || undefined;
    const days = params.days ? parseInt(params.days, 10) : 30;

    // Verify creator ownership
    if (requestedCreatorId && requestedCreatorId !== decodedToken.uid) {
      return {
        statusCode: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configured: false,
          countries: [],
          devices: { desktop: 0, mobile: 0, tablet: 0, total: 0, desktopPct: 0, mobilePct: 0, tabletPct: 0, list: [] },
          sources: [],
          surfaces: [],
          error: 'Forbidden',
          message: 'You are not authorized to view analytics for this creator profile.',
        }),
      };
    }

    // Verify post ownership if postId provided
    if (postId) {
      const adminDb = getAdminDb();
      if (adminDb) {
        try {
          const postDoc = await adminDb.collection('posts').doc(postId).get();
          if (postDoc.exists) {
            const postData = postDoc.data();
            if (postData?.creatorId && postData.creatorId !== decodedToken.uid) {
              return {
                statusCode: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  configured: false,
                  countries: [],
                  devices: { desktop: 0, mobile: 0, tablet: 0, total: 0, desktopPct: 0, mobilePct: 0, tabletPct: 0, list: [] },
                  sources: [],
                  surfaces: [],
                  error: 'Forbidden',
                  message: 'You are not authorized to view analytics for this post.',
                }),
              };
            }
          }
        } catch (dbErr) {
          console.warn('[Netlify GA4 Analytics] Could not verify post ownership via admin DB:', dbErr);
        }
      }
    }

    const effectiveCreatorId = requestedCreatorId || (postId ? undefined : decodedToken.uid);

    const result = await fetchGA4CombinedBreakdowns({
      creatorId: effectiveCreatorId,
      postId: postId || undefined,
      days: isNaN(days) ? 30 : days,
    });

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=1800',
      },
      body: JSON.stringify(result),
    };
  } catch (err: any) {
    console.error('[Netlify GA4 Analytics Breakdowns] Error:', err?.message || err);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        configured: false,
        countries: [],
        devices: { desktop: 0, mobile: 0, tablet: 0, total: 0, desktopPct: 0, mobilePct: 0, tabletPct: 0, list: [] },
        sources: [],
        surfaces: [],
        error: 'Internal Server Error',
        message: err?.message || 'Failed to process GA4 breakdowns request.',
      }),
    };
  }
};
