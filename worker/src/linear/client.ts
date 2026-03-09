import type { Env } from '../types';
import { getStorage } from '../storage';
import { refreshAccessToken } from '../auth/oauth';

const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql';

export async function linearGraphql<T>(query: string, variables: Record<string, unknown>, accessToken: string): Promise<T> {
  const res = await fetch(LINEAR_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': accessToken
    },
    body: JSON.stringify({ query, variables })
  });

  const json = await res.json<any>();
  if (!res.ok || json.errors) {
    throw new Error(`Linear GraphQL failed: ${JSON.stringify(json.errors ?? json)}`);
  }
  return json.data as T;
}

export async function getInstallationIdentity(accessToken: string) {
  const query = `query InstallationIdentity {
    viewer {
      id
      name
    }
    organization {
      id
      name
      urlKey
    }
  }`;

  return linearGraphql<{
    viewer?: { id: string; name: string };
    organization?: { id: string; name: string; urlKey?: string };
  }>(query, {}, accessToken);
}

async function getValidAccessToken(env: Env, workspaceId: string): Promise<string> {
  const storage = getStorage(env);
  const token = await storage.oauth.get(workspaceId);
  if (!token) {
    throw new Error(`No OAuth token stored for workspace ${workspaceId}`);
  }

  const expiresAt = new Date(token.expiresAt).getTime();
  const willExpireSoon = expiresAt - Date.now() < 60_000;
  if (!willExpireSoon) {
    return token.accessToken;
  }

  if (!token.refreshToken) {
    throw new Error(`OAuth token for workspace ${workspaceId} cannot be refreshed`);
  }

  const refreshed = await refreshAccessToken(token.refreshToken, env) as any;
  const next = {
    workspaceId,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? token.refreshToken,
    expiresAt: refreshed.expires_in
      ? new Date(Date.now() + Number(refreshed.expires_in) * 1000).toISOString()
      : new Date(Date.now() + 3600 * 1000).toISOString(),
    scopes: typeof refreshed.scope === 'string' ? refreshed.scope.split(/[\s,]+/).filter(Boolean) : token.scopes,
    actorMode: 'app' as const
  };
  await storage.oauth.upsert(next);
  return next.accessToken;
}

export async function postComment(env: Env, workspaceId: string, issueId: string, body: string) {
  const accessToken = await getValidAccessToken(env, workspaceId);
  const data = await linearGraphql<{ commentCreate: { success: boolean; comment: { id: string; body: string } } }>(
    'mutation($issueId:String!,$body:String!){ commentCreate(input:{issueId:$issueId, body:$body}){ success comment{ id body } } }',
    { issueId, body },
    accessToken
  );
  return data.commentCreate;
}
