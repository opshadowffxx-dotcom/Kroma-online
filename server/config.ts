/**
 * Central Server Configuration for Cloudflare R2 & Media Storage
 * 
 * ALL R2 credentials and bucket configurations are centralized here.
 * To switch from testing credentials to production credentials,
 * update the environment variables or configuration values in this file only.
 */

export interface R2ServerConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  bucketName: string;
  publicUrl: string;
  region: string;
}

function isValidUrl(val?: string): boolean {
  if (!val) return false;
  try {
    const parsed = new URL(val);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export const getR2Config = (): R2ServerConfig => {
  const accountId = process.env.R2_ACCOUNT_ID?.trim() || '';
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim() || '';
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim() || '';

  const envEndpoint = process.env.R2_ENDPOINT?.trim();
  let endpoint = '';
  if (isValidUrl(envEndpoint)) {
    endpoint = envEndpoint!;
  } else if (accountId) {
    endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  }

  const bucketName = process.env.R2_BUCKET_NAME?.trim() || '';

  const envPublicUrl = process.env.R2_PUBLIC_URL?.trim();
  let publicUrl = '';
  if (isValidUrl(envPublicUrl)) {
    publicUrl = envPublicUrl!.replace(/\/$/, '');
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    endpoint,
    bucketName,
    publicUrl,
    region: 'auto',
  };
};

/**
 * Validates whether all required R2 storage credentials are provided.
 * Returns only missing variable names, never sensitive values.
 */
export function validateR2Config(config: R2ServerConfig = getR2Config()): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!config.accessKeyId) missing.push('R2_ACCESS_KEY_ID');
  if (!config.secretAccessKey) missing.push('R2_SECRET_ACCESS_KEY');
  if (!config.endpoint) missing.push('R2_ENDPOINT (or R2_ACCOUNT_ID)');
  if (!config.bucketName) missing.push('R2_BUCKET_NAME');
  return { valid: missing.length === 0, missing };
}

export const getFirebaseProjectId = (): string => {
  return process.env.FIREBASE_PROJECT_ID || '';
};
