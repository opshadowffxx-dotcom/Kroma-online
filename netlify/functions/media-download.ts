import type { Handler, HandlerEvent } from '@netlify/functions';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
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
    const rawUrl = event.queryStringParameters?.url;
    const filename = event.queryStringParameters?.filename;

    if (!rawUrl || typeof rawUrl !== 'string') {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Bad Request', message: 'url query parameter is required.' }),
      };
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Bad Request', message: 'Invalid URL format.' }),
      };
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Bad Request', message: 'Only HTTP and HTTPS protocols are allowed.' }),
      };
    }

    const imageResponse = await fetch(parsedUrl.toString());
    if (!imageResponse.ok) {
      return {
        statusCode: imageResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Upstream Error', message: 'Failed to retrieve media from storage.' }),
      };
    }

    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await imageResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const safeFilename = filename && typeof filename === 'string'
      ? filename.replace(/[^a-zA-Z0-9._-]/g, '_')
      : 'kroma-artwork.jpg';

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${safeFilename}"`,
        'Content-Length': buffer.length.toString(),
      },
      body: buffer.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err: any) {
    console.error('[Netlify Media Download] Error:', err?.message || err);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Download Error', message: err?.message || 'Failed to download media.' }),
    };
  }
};
