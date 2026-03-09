import type { Env } from './types';

export type { Env } from './types';

export const REQUIRED_SECRETS = [
  'LINEAR_CLIENT_ID',
  'LINEAR_CLIENT_SECRET',
  'LINEAR_WEBHOOK_SECRET',
  'LINEAR_REDIRECT_URI',
  'OPENCLAW_INTERNAL_SECRET'
] as const;

export function missingSecrets(env: Record<string, unknown>) {
  return REQUIRED_SECRETS.filter((key) => !env[key]);
}

export const APP_CONFIG = {
  workerUrl: 'https://linear-expert.placeapp.workers.dev',
  webhookPath: '/webhooks/linear',
  oauthCallbackPath: '/oauth/callback',
  d1DatabaseName: 'linear-expert',
  d1DatabaseId: '86c77b94-afbb-4e1c-8b7d-df8961be5bee'
} as const;

export function hasDatabase(env: Env): boolean {
  return Boolean(env.DB);
}
