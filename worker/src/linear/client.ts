import type { Env } from '../types';
import { getStorage } from '../storage';
import { refreshAccessToken } from '../auth/oauth';
import type {
  AssignIssueInput,
  CreateIssueInput,
  TransitionIssueInput,
  UpdateIssueInput,
} from './contracts';

const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql';

export interface CommentResult {
  success: boolean;
  comment: { id: string; body: string };
}

export interface IssueResult {
  success: boolean;
  issue: { id: string; identifier: string; title: string; url?: string | null };
}

export interface IssueByIdentifierResult {
  success: boolean;
  issue: { id: string; identifier: string; title: string; state: { name: string }; project: { id: string; name: string } | null } | null;
}

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

async function withWorkspaceAccessToken<T>(env: Env, workspaceId: string, fn: (accessToken: string) => Promise<T>): Promise<T> {
  const accessToken = await getValidAccessToken(env, workspaceId);
  return fn(accessToken);
}

export async function postComment(env: Env, workspaceId: string, issueId: string, body: string) {
  return withWorkspaceAccessToken<CommentResult>(env, workspaceId, async (accessToken) => {
    const data = await linearGraphql<{ commentCreate: CommentResult }>(
      'mutation($issueId:String!,$body:String!){ commentCreate(input:{issueId:$issueId, body:$body}){ success comment{ id body } } }',
      { issueId, body },
      accessToken
    );
    return data.commentCreate;
  });
}

export async function createIssue(env: Env, workspaceId: string, input: CreateIssueInput) {
  return withWorkspaceAccessToken<IssueResult>(env, workspaceId, async (accessToken) => {
    const data = await linearGraphql<{ issueCreate: IssueResult }>(
      'mutation($input:IssueCreateInput!){ issueCreate(input:$input){ success issue{ id identifier title url } } }',
      { input },
      accessToken
    );
    return data.issueCreate;
  });
}

export async function updateIssue(env: Env, workspaceId: string, input: UpdateIssueInput) {
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.projectId !== undefined) patch.projectId = input.projectId;

  return withWorkspaceAccessToken<IssueResult>(env, workspaceId, async (accessToken) => {
    const data = await linearGraphql<{ issueUpdate: IssueResult }>(
      'mutation($id:String!,$input:IssueUpdateInput!){ issueUpdate(id:$id,input:$input){ success issue{ id identifier title url } } }',
      { id: input.issueId, input: patch },
      accessToken
    );
    return data.issueUpdate;
  });
}

export async function assignIssue(env: Env, workspaceId: string, input: AssignIssueInput) {
  return withWorkspaceAccessToken<IssueResult>(env, workspaceId, async (accessToken) => {
    const data = await linearGraphql<{ issueUpdate: IssueResult }>(
      'mutation($id:String!,$input:IssueUpdateInput!){ issueUpdate(id:$id,input:$input){ success issue{ id identifier title url } } }',
      { id: input.issueId, input: { assigneeId: input.assigneeId } },
      accessToken
    );
    return data.issueUpdate;
  });
}

export async function transitionIssueState(env: Env, workspaceId: string, input: TransitionIssueInput) {
  return withWorkspaceAccessToken<IssueResult>(env, workspaceId, async (accessToken) => {
    const data = await linearGraphql<{ issueUpdate: IssueResult }>(
      'mutation($id:String!,$input:IssueUpdateInput!){ issueUpdate(id:$id,input:$input){ success issue{ id identifier title url } } }',
      { id: input.issueId, input: { stateId: input.stateId } },
      accessToken
    );
    return data.issueUpdate;
  });
}

export interface AddToProjectInput {
  issueId: string;
  projectId: string;
}

export async function addIssueToProject(env: Env, workspaceId: string, input: AddToProjectInput) {
  return withWorkspaceAccessToken<IssueResult>(env, workspaceId, async (accessToken) => {
    const data = await linearGraphql<{ issueUpdate: IssueResult }>(
      'mutation($id:String!,$input:IssueUpdateInput!){ issueUpdate(id:$id,input:$input){ success issue{ id identifier title url } } }',
      { id: input.issueId, input: { projectId: input.projectId } },
      accessToken
    );
    return data.issueUpdate;
  });
}

export async function getIssueByIdentifier(env: Env, workspaceId: string, identifier: string) {
  return withWorkspaceAccessToken<IssueByIdentifierResult>(env, workspaceId, async (accessToken) => {
    const data = await linearGraphql<{ issue: IssueByIdentifierResult['issue'] }>(
      `query($identifier: String!) {
        issue(identifier: $identifier) {
          id
          identifier
          title
          state { name }
          project { id name }
        }
      }`,
      { identifier },
      accessToken
    );
    return { success: true, issue: data.issue };
  });
}

export interface AddAttachmentInput {
  issueId: string;
  title: string;
  url: string;
}

export interface AttachmentResult {
  success: boolean;
  attachment: { id: string; title: string; url: string };
}

export async function addAttachment(env: Env, workspaceId: string, input: AddAttachmentInput) {
  return withWorkspaceAccessToken<AttachmentResult>(env, workspaceId, async (accessToken) => {
    const data = await linearGraphql<{ attachmentCreate: AttachmentResult }>(
      `mutation($issueId: String!, $input: AttachmentCreateInput!) {
        attachmentCreate(issueId: $issueId, input: $input) {
          success
          attachment { id title url }
        }
      }`,
      { issueId: input.issueId, input: { title: input.title, url: input.url } },
      accessToken
    );
    return data.attachmentCreate;
  });
}

export interface IssueRelationInput {
  issueId: string;
  relatedIssueId: string;
}

export interface IssueRelationResult {
  success: boolean;
  relation: { id: string; type: string };
}

export async function createIssueRelation(env: Env, workspaceId: string, input: IssueRelationInput & { relationType: "blocks" | "duplicates" | "relates_to" }) {
  return withWorkspaceAccessToken<IssueRelationResult>(env, workspaceId, async (accessToken) => {
    const data = await linearGraphql<{ issueRelationCreate: IssueRelationResult }>(
      `mutation($issueId: String!, $relatedIssueId: String!, $type: IssueRelationType!) {
        issueRelationCreate(issueId: $issueId, relatedIssueId: $relatedIssueId, type: $type) {
          success
          relation { id type }
        }
      }`,
      { issueId: input.issueId, relatedIssueId: input.relatedIssueId, type: input.relationType },
      accessToken
    );
    return data.issueRelationCreate;
  });
}
