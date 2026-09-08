import type { Handler, HandlerEvent } from '@netlify/functions';
import { verifyAuthToken } from '../../server/firebaseAdmin';
import { uploadBufferToR2, MediaUploadType } from '../../server/r2';

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
    const { type, postId, contentType, base64Data } = body;

    const validTypes: MediaUploadType[] = ['avatar', 'cover', 'post-main', 'post-thumb'];
    if (!type || !validTypes.includes(type)) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Bad Request',
          message: `Invalid upload type. Must be one of: ${validTypes.join(', ')}`,
        }),
      };
    }

    if ((type === 'post-main' || type === 'post-thumb') && !postId) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Bad Request',
          message: 'postId is required for post media uploads.',
        }),
      };
    }

    if (!base64Data || typeof base64Data !== 'string') {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Bad Request',
          message: 'base64Data is required for direct upload.',
        }),
      };
    }

    const cleanBase64 = base64Data.replace(/^data:[a-zA-Z0-9/+-]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    const allowedMimeTypes = ['image/webp', 'image/jpeg', 'image/png', 'image/avif'];
    const validatedContentType =
      contentType && allowedMimeTypes.includes(contentType.toLowerCase())
        ? contentType.toLowerCase()
        : 'image/webp';

    const result = await uploadBufferToR2({
      uid: user.uid,
      type,
      postId,
      buffer,
      contentType: validatedContentType,
    });

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        objectKey: result.objectKey,
        publicUrl: result.publicUrl,
      }),
    };
  } catch (err: any) {
    console.error('[Netlify Media Upload] Error:', err?.message || err);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Upload Error',
        message: err?.message || 'Failed to upload media to storage.',
      }),
    };
  }
};
