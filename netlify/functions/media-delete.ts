import type { Handler, HandlerEvent } from '@netlify/functions';
import { verifyAuthToken } from '../../server/firebaseAdmin';
import { deleteR2MediaObject } from '../../server/r2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed', message: 'Only POST requests are supported.' }),
    };
  }

  try {
    const authHeader = event.headers.authorization || event.headers.Authorization;
    const user = await verifyAuthToken(authHeader);

    if (!user || !user.uid) {
      return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Unauthorized', message: 'Valid Firebase ID token required.' }),
      };
    }

    const body = JSON.parse(event.body || '{}');
    const { objectKey } = body;

    if (!objectKey || typeof objectKey !== 'string') {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Bad Request',
          message: 'objectKey is required.',
        }),
      };
    }

    await deleteR2MediaObject(user.uid, objectKey);

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        message: 'Media deleted successfully from storage.',
      }),
    };
  } catch (err: any) {
    console.error('[Netlify Media Delete] Error:', err?.message || err);
    const isAuthErr = err?.message?.includes('Unauthorized');
    return {
      statusCode: isAuthErr ? 403 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: isAuthErr ? 'Forbidden' : 'Delete Error',
        message: err?.message || 'Failed to delete media asset.',
      }),
    };
  }
};
