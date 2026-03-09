import type { Env } from '../types';

const LINEAR_AUTH_BASE = 'https://linear.app/oauth/authorize';
const LINEAR_TOKEN_URL = 'https://api.linear.app/oauth/token';

export function buildAuthorizeUrl(env: Env, state: string, scopes: string[] = ['read', 'write']): string {
  if (!env.LINEAR_CLIENT_ID || !env.LINEAR_REDIRECT_URI) {
    throw new Error('Missing LINEAR_CLIENT_ID or LINEAR_REDIRECT_URI');
  }

  const url = new URL(LINEAR_AUTH_BASE);
  url.searchParams.set('client_id', env.LINEAR_CLIENT_ID);
  url.searchParams.set('redirect_uri', env.LINEAR_REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scopes.join(' '));
  url.searchParams.set('state', state);
  url.searchParams.set('actor', 'app');
  return url.toString();
}

function buildTokenBody(params: Record<string, string>): string {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    body.set(key, value);
  }
  return body.toString();
}

export async function exchangeCodeForToken(code: string, env: Env) {
  if (!env.LINEAR_CLIENT_ID || !env.LINEAR_CLIENT_SECRET || !env.LINEAR_REDIRECT_URI) {
    throw new Error('Missing OAuth configuration');
  }

  const res = await fetch(LINEAR_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: buildTokenBody({
      grant_type: 'authorization_code',
      code,
      client_id: env.LINEAR_CLIENT_ID,
      client_secret: env.LINEAR_CLIENT_SECRET,
      redirect_uri: env.LINEAR_REDIRECT_URI
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OAuth token exchange failed: ${res.status} ${text}`);
  }

  return res.json();
}

export async function refreshAccessToken(refreshToken: string, env: Env) {
  if (!env.LINEAR_CLIENT_ID || !env.LINEAR_CLIENT_SECRET) {
    throw new Error('Missing OAuth configuration');
  }

  const res = await fetch(LINEAR_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: buildTokenBody({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: env.LINEAR_CLIENT_ID,
      client_secret: env.LINEAR_CLIENT_SECRET
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OAuth token refresh failed: ${res.status} ${text}`);
  }

  return res.json();
}
