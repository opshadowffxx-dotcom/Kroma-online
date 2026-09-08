import type { Handler, HandlerEvent } from '@netlify/functions';
import { verifyAuthToken } from '../../server/firebaseAdmin';
import { createPresignedUploadUrl, MediaUploadType } from '../../server/r2';

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
    const { type, postId, contentType } = body;

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

    const allowedMimeTypes = ['image/webp', 'image/jpeg', 'image/png', 'image/avif'];
    const validatedContentType =
      contentType && allowedMimeTypes.includes(contentType.toLowerCase())
        ? contentType.toLowerCase()
        : 'image/webp';

    const result = await createPresignedUploadUrl({
      uid: user.uid,
      type,
      postId,
      contentType: validatedContentType,
    });

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        uploadUrl: result.uploadUrl,
        objectKey: result.objectKey,
        publicUrl: result.publicUrl,
        expiresInSeconds: result.expiresInSeconds,
      }),
    };
  } catch (err: any) {
    console.error('[Netlify Media Presign] Error:', err?.message || err);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Presign Error',
        message: err?.message || 'Failed to generate presigned upload URL.',
      }),
    };
  }
};
