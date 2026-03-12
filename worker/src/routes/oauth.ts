import { buildAuthorizeUrl, exchangeCodeForToken } from '../auth/oauth';
import type { Env } from '../types';
import { getStorage } from '../storage';
import { getInstallationIdentity } from '../linear/client';

function normalizeScopes(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') return raw.split(/[\s,]+/).filter(Boolean);
  return [];
}

export async function startOauth(_request: Request, env: Env): Promise<Response> {
  const state = crypto.randomUUID();
  const url = buildAuthorizeUrl(env, state);
  return Response.redirect(url, 302);
}

export async function oauthCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    return Response.json({ ok: false, error }, { status: 400 });
  }

  if (!code) {
    return Response.json({ ok: false, error: 'Missing code' }, { status: 400 });
  }

  const tokenResponse = await exchangeCodeForToken(code, env);
  const storage = getStorage(env);
  const accessToken = tokenResponse.access_token as string;
  const identity = await getInstallationIdentity(accessToken);

  const workspaceId = identity.organization?.id;
  if (!workspaceId) {
    // In app-install OAuth, organization.id should always exist.
    return Response.json({ ok: false, error: "Missing organization id in installation identity" }, { status: 500 });
  }

  await storage.oauth.upsert({
    workspaceId,
    accessToken,
    refreshToken: tokenResponse.refresh_token ?? '',
    expiresAt: tokenResponse.expires_in
      ? new Date(Date.now() + Number(tokenResponse.expires_in) * 1000).toISOString()
      : new Date(Date.now() + 3600 * 1000).toISOString(),
    scopes: normalizeScopes(tokenResponse.scope),
    actorMode: 'app'
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
  });
}
