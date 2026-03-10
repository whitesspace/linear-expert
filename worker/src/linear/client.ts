import type { LinearClient as LinearClientType } from '@linear/sdk';
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

/**
 * Legacy: direct fetch to Linear GraphQL.
 *
 * Phase 3 policy (WS-52): we no longer allow calling Linear via manual fetch.
 * All Linear calls must go through @linear/sdk client.rawRequest (sdkRequest).
 */
export async function linearGraphql<T>(_query: string, _variables: Record<string, unknown>, _accessToken: string): Promise<T> {
  throw new Error('linearGraphql(fetch) is disabled. Use sdkRequest(rawRequest) via @linear/sdk.');
}

export async function getInstallationIdentity(accessToken: string) {
  const query = `query InstallationIdentity {
    viewer { id name }
    organization { id name urlKey }
  }`;

  return withSdkClient(accessToken, async (client) => {
    const { sdkRequest } = await import('./sdk');
    return sdkRequest<{
      viewer?: { id: string; name: string };
      organization?: { id: string; name: string; urlKey?: string };
    }>(client, query, {});
  });
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

  const refreshed = await refreshAccessToken(token.refreshToken, env);
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

export async function withWorkspaceAccessToken<T>(env: Env, workspaceId: string, fn: (accessToken: string) => Promise<T>): Promise<T> {
  const accessToken = await getValidAccessToken(env, workspaceId);
  return fn(accessToken);
}

async function withSdkClient<T>(accessToken: string, fn: (client: any) => Promise<T>): Promise<T> {
  const mod = await import("@linear/sdk");
  const Client = mod.LinearClient as any;
  const client = new Client({ accessToken });
  return fn(client);
}

export async function postComment(env: Env, workspaceId: string, issueId: string, body: string) {
  return withWorkspaceAccessToken<CommentResult>(env, workspaceId, async (accessToken) => {
    return withSdkClient(accessToken, async (client) => {
      const { sdkRequest } = await import("./sdk");
      const data = await sdkRequest<any>(
        client,
        `mutation($issueId: String!, $body: String!) {
          commentCreate(input: { issueId: $issueId, body: $body }) {
            success
            comment { id body }
          }
        }`,
        { issueId, body },
      );
      return {
        success: Boolean(data.commentCreate?.success),
        comment: {
          id: data.commentCreate?.comment?.id ?? "",
          body: data.commentCreate?.comment?.body ?? body,
        },
      };
    });
  });
}

export async function createIssue(env: Env, workspaceId: string, input: CreateIssueInput) {
  return withWorkspaceAccessToken<IssueResult>(env, workspaceId, async (accessToken) => {
    return withSdkClient(accessToken, async (client) => {
      const { sdkRequest } = await import("./sdk");
      const data = await sdkRequest<any>(
        client,
        `mutation($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue { id identifier title url }
          }
        }`,
        { input },
      );

      return data.issueCreate as IssueResult;
    });
  });
}

export async function updateIssue(env: Env, workspaceId: string, input: UpdateIssueInput) {
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.projectId !== undefined) patch.projectId = input.projectId;

  return withWorkspaceAccessToken<IssueResult>(env, workspaceId, async (accessToken) => {
    return withSdkClient(accessToken, async (client) => {
      const { sdkRequest } = await import("./sdk");
      const data = await sdkRequest<any>(
        client,
        `mutation($id: String!, $input: IssueUpdateInput!) {
          issueUpdate(id: $id, input: $input) {
            success
            issue { id identifier title url }
          }
        }`,
        { id: input.issueId, input: patch },
      );

      return data.issueUpdate as IssueResult;
    });
  });
}

export async function assignIssue(env: Env, workspaceId: string, input: AssignIssueInput) {
  return withWorkspaceAccessToken<IssueResult>(env, workspaceId, async (accessToken) => {
    return withSdkClient(accessToken, async (client) => {
      const { sdkRequest } = await import("./sdk");
      const data = await sdkRequest<any>(
        client,
        `mutation($id: String!, $input: IssueUpdateInput!) {
          issueUpdate(id: $id, input: $input) {
            success
            issue { id identifier title url }
          }
        }`,
        { id: input.issueId, input: { assigneeId: input.assigneeId } },
      );

      return data.issueUpdate as IssueResult;
    });
  });
}

export async function transitionIssueState(env: Env, workspaceId: string, input: TransitionIssueInput) {
  return withWorkspaceAccessToken<IssueResult>(env, workspaceId, async (accessToken) => {
    return withSdkClient(accessToken, async (client) => {
      const { sdkRequest } = await import("./sdk");
      const data = await sdkRequest<any>(
        client,
        `mutation($id: String!, $input: IssueUpdateInput!) {
          issueUpdate(id: $id, input: $input) {
            success
            issue { id identifier title url }
          }
        }`,
        { id: input.issueId, input: { stateId: input.stateId } },
      );

      return data.issueUpdate as IssueResult;
    });
  });
}

export interface AddToProjectInput {
  issueId: string;
  projectId: string;
}

export async function addIssueToProject(env: Env, workspaceId: string, input: AddToProjectInput) {
  return withWorkspaceAccessToken<IssueResult>(env, workspaceId, async (accessToken) => {
    return withSdkClient(accessToken, async (client) => {
      const { sdkRequest } = await import("./sdk");
      const data = await sdkRequest<any>(
        client,
        `mutation($id: String!, $input: IssueUpdateInput!) {
          issueUpdate(id: $id, input: $input) {
            success
            issue { id identifier title url }
          }
        }`,
        { id: input.issueId, input: { projectId: input.projectId } },
      );

      return data.issueUpdate as IssueResult;
    });
  });
}

function parseIssueIdentifier(identifier: string): { teamKey: string; number: number } {
  const [teamKey, rawNumber] = identifier.split("-");
  const number = Number(rawNumber);
  if (!teamKey || !Number.isFinite(number)) {
    throw new Error(`Invalid issue identifier: ${identifier}`);
  }
  return { teamKey, number };
}

export async function getIssueByIdentifier(env: Env, workspaceId: string, identifier: string) {
  return withWorkspaceAccessToken<IssueByIdentifierResult>(env, workspaceId, async (accessToken) => {
    return withSdkClient(accessToken, async (client) => {
      const { teamKey, number } = parseIssueIdentifier(identifier);
      const { sdkRequest } = await import("./sdk");

      const teamsData = await sdkRequest<any>(
        client,
        `query($teamKey: String!) {
          teams(filter: { key: { eq: $teamKey } }) { nodes { id key } }
        }`,
        { teamKey },
      );

      const teamId = teamsData.teams?.nodes?.[0]?.id;
      if (!teamId) {
        return { success: true, issue: null };
      }

      const issuesData = await sdkRequest<any>(
        client,
        `query($teamId: ID!, $numbers: [Float!]!) {
          issues(filter: { team: { id: { eq: $teamId } }, number: { in: $numbers } }) {
            nodes { id identifier title state { id name } project { id name } }
          }
        }`,
        { teamId, numbers: [number] },
      );

      return { success: true, issue: issuesData.issues?.nodes?.[0] ?? null };
    });
  });
}

export interface IssueStateResult {
  id: string;
  name: string;
  type?: string | null;
}

export interface TeamStatesResult {
  success: boolean;
  states: IssueStateResult[];
}

export async function listTeamStates(env: Env, workspaceId: string, teamId: string) {
  return withWorkspaceAccessToken<TeamStatesResult>(env, workspaceId, async (accessToken) => {
    return withSdkClient(accessToken, async (client) => {
      const { sdkRequest } = await import("./sdk");
      const data = await sdkRequest<any>(
        client,
        `query($teamId: String!) {
          team(id: $teamId) {
            states { nodes { id name type } }
          }
        }`,
        { teamId },
      );

      return { success: true, states: data.team?.states?.nodes ?? [] };
    });
  });
}

export interface IssueListItem {
  id: string;
  identifier: string;
  title: string;
  url?: string | null;
  state: { id: string; name: string };
}

export interface IssueChildrenResult {
  success: boolean;
  issues: IssueListItem[];
}

export interface IssuesByNumberResult {
  success: boolean;
  issues: IssueListItem[];
}

export async function listIssuesByNumbers(env: Env, workspaceId: string, teamId: string, numbers: number[]) {
  return withWorkspaceAccessToken<IssuesByNumberResult>(env, workspaceId, async (accessToken) => {
    return withSdkClient(accessToken, async (client) => {
      const { sdkRequest } = await import("./sdk");
      const data = await sdkRequest<any>(
        client,
        `query($teamId: ID!, $numbers: [Float!]!) {
          issues(filter: { team: { id: { eq: $teamId } }, number: { in: $numbers } }) {
            nodes {
              id
              identifier
              title
              url
              state { id name }
            }
          }
        }`,
        { teamId, numbers },
      );

      return { success: true, issues: data.issues?.nodes ?? [] };
    });
  });
}

export async function listIssueChildren(env: Env, workspaceId: string, issueId: string, first = 50) {
  return withWorkspaceAccessToken<IssueChildrenResult>(env, workspaceId, async (accessToken) => {
    return withSdkClient(accessToken, async (client) => {
      const { sdkRequest } = await import("./sdk");
      const data = await sdkRequest<any>(
        client,
        `query($id: String!, $first: Int!) {
          issue(id: $id) {
            id
            children(first: $first) {
              nodes { id identifier title url state { id name } }
            }
          }
        }`,
        { id: issueId, first },
      );

      return { success: true, issues: data.issue?.children?.nodes ?? [] };
    });
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
    type SdkCreateAttachmentPayload = {
      success: boolean;
      attachment?: { id: string; title: string; url: string } | null;
    };

    const payload = (await withSdkClient(accessToken, (client) => (client as any).createAttachment({
      issueId: input.issueId,
      title: input.title,
      url: input.url,
    }))) as SdkCreateAttachmentPayload;

    return {
      success: Boolean(payload?.success),
      attachment: {
        id: payload?.attachment?.id ?? "",
        title: payload?.attachment?.title ?? input.title,
        url: payload?.attachment?.url ?? input.url,
      },
    };
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
    type SdkCreateIssueRelationPayload = {
      success: boolean;
      relation?: { id: string; type: string } | null;
    };

    const { sdkRequest } = await import("./sdk");
    const payload = await withSdkClient(accessToken, async (client) => {
      // Avoid relying on SDK method presence; call GraphQL directly.
      const data = await sdkRequest<any>(
        client,
        `mutation($input: IssueRelationCreateInput!) {
          issueRelationCreate(input: $input) {
            success
            issueRelation { id type }
          }
        }`,
        {
          input: {
            issueId: input.issueId,
            relatedIssueId: input.relatedIssueId,
            type:
              input.relationType === "relates_to"
                ? "related"
                : input.relationType === "duplicates"
                  ? "duplicate"
                  : input.relationType,
          },
        },
      );
      return data.issueRelationCreate;
    }) as any;

    return {
      success: Boolean(payload?.success),
      relation: {
        id: payload?.issueRelation?.id ?? payload?.relation?.id ?? "",
        type: payload?.issueRelation?.type ?? payload?.relation?.type ?? input.relationType,
      },
    };
  });
}
