import { schedule } from '@netlify/functions';
import { publishDueScheduledPostsAdmin } from '../../server/scheduledPublisher';

/**
 * Netlify Scheduled Function: Executes every 2 minutes.
 * Automatically queries and publishes due scheduled posts with idempotent transactions using the Firebase Admin SDK.
 */
const scheduledHandler = async () => {
  console.log('[Netlify Cron] Starting scheduled post publishing job with Firebase Admin SDK...');
  try {
    const result = await publishDueScheduledPostsAdmin(50);
    console.log('[Netlify Cron] Completed publish run:', result);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: result.success,
        mode: 'admin_sdk',
        ...result,
      }),
    };
  } catch (error: any) {
    console.error('[Netlify Cron] Job error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: error?.message || String(error),
      }),
    };
  }
};

// Netlify Scheduled Function export with cron schedule: every 2 minutes
export default schedule('*/2 * * * *', scheduledHandler);
export const handler = schedule('*/2 * * * *', scheduledHandler);

