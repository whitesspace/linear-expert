import { buildAuthorizeUrl, exchangeCodeForToken } from '../auth/oauth';
import type { Env } from '../types';
import { getStorage } from '../storage';
import { getInstallationIdentity } from '../linear/client';

const OAUTH_STATE_COOKIE_NAME = 'linear_oauth_state';

function normalizeScopes(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') return raw.split(/[\s,]+/).filter(Boolean);
  return [];
}

function buildOauthStateCookie(state: string, maxAgeSeconds = 600): string {
  return `${OAUTH_STATE_COOKIE_NAME}=${encodeURIComponent(state)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function clearOauthStateCookie(): string {
  return `${OAUTH_STATE_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function readOauthStateCookie(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const [rawName, ...rest] = cookie.trim().split('=');
    if (rawName !== OAUTH_STATE_COOKIE_NAME) {
      continue;
    }
    const value = rest.join('=').trim();
    return value ? decodeURIComponent(value) : null;
  }
  return null;
}

export async function startOauth(_request: Request, env: Env): Promise<Response> {
  const state = crypto.randomUUID();
  const url = buildAuthorizeUrl(env, state);
  return new Response(null, {
    status: 302,
    headers: {
      location: url,
      'set-cookie': buildOauthStateCookie(state),
    },
  });
}

export async function oauthCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const returnedState = url.searchParams.get('state');
  const cookieState = readOauthStateCookie(request);

  if (error) {
    return Response.json({ ok: false, error }, {
      status: 400,
      headers: { 'set-cookie': clearOauthStateCookie() },
    });
  }

  if (!returnedState || !cookieState || returnedState !== cookieState) {
    return Response.json({ ok: false, error: 'Invalid state' }, {
      status: 400,
      headers: { 'set-cookie': clearOauthStateCookie() },
    });
  }

  if (!code) {
    return Response.json({ ok: false, error: 'Missing code' }, {
      status: 400,
      headers: { 'set-cookie': clearOauthStateCookie() },
    });
  }

  const tokenResponse = await exchangeCodeForToken(code, env);
  const storage = getStorage(env);
  const accessToken = tokenResponse.access_token as string;
  const identity = await getInstallationIdentity(accessToken);

  const workspaceId = identity.organization?.id;
  if (!workspaceId) {
    // In app-install OAuth, organization.id should always exist.
    return Response.json({ ok: false, error: "Missing organization id in installation identity" }, {
      status: 500,
      headers: { 'set-cookie': clearOauthStateCookie() },
    });
  }

  await storage.oauth.upsert({
    workspaceId,
    accessToken,
    refreshToken: tokenResponse.refresh_token ?? '',
    expiresAt: tokenResponse.expires_in
      ? new Date(Date.now() + Number(tokenResponse.expires_in) * 1000).toISOString()
      : new Date(Date.now() + 3600 * 1000).toISOString(),
    scopes: normalizeScopes(tokenResponse.scope),
    actorMode: 'app',
    installationIdentity: {
      viewerId: identity.viewer?.id ?? "",
      viewerName: identity.viewer?.name ?? null,
      organizationId: identity.organization?.id ?? null,
      organizationName: identity.organization?.name ?? null,
      organizationUrlKey: identity.organization?.urlKey ?? null,
    },
  });

  return Response.json({
    ok: true,
    message: 'OAuth callback received and token persisted',
    workspaceId,
    actorMode: 'app',
    identity: {
      viewer: identity.viewer ?? null,
      organization: identity.organization ?? null
    }
  }, {
    headers: { 'set-cookie': clearOauthStateCookie() },
  });
}
