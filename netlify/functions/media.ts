import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { handler as presignHandler } from './media-presign';
import { handler as uploadHandler } from './media-upload';
import { handler as deleteHandler } from './media-delete';
import { handler as downloadHandler } from './media-download';
import { handler as configHandler } from './media-config';

export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  const path = event.path.toLowerCase();
  let result;

  if (path.endsWith('/presign') || path.includes('/presign/')) {
    result = await presignHandler(event, context);
  } else if (path.endsWith('/upload') || path.includes('/upload/')) {
    result = await uploadHandler(event, context);
  } else if (path.endsWith('/delete') || path.includes('/delete/')) {
    result = await deleteHandler(event, context);
  } else if (path.endsWith('/download') || path.includes('/download/')) {
    result = await downloadHandler(event, context);
  } else if (path.endsWith('/config') || path.includes('/config/')) {
    result = await configHandler(event, context);
  } else {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Not Found',
        message: `Unknown media API route: ${event.path}`,
      }),
    };
  }

  return result || { statusCode: 200, body: '' };
};
