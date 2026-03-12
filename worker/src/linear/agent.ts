import type { Env } from "../env";
import { withWorkspaceAccessToken } from "./client";

export type AgentActivityKind =
  | "thought"
  | "action"
  | "response"
  | "error"
  | "elicitation"
  | "plan"
  | "progress";

export interface PlanStep {
  content: string;
  status: "pending" | "inProgress" | "completed" | "canceled";
}

export type AgentActivityContentWithSession = {
  agentSessionId?: string;
  type: Exclude<AgentActivityKind, "plan" | "progress">;
  content: any;
  ephemeral?: boolean;
};

export type AgentActivityContent =
  | { type: "thought"; body: string; ephemeral?: boolean; agentSessionId?: string }
  | {
      type: "action";
      agentSessionId?: string;
      activityAction: string;
      parameter?: string;
      result?: string;
    }
  | { type: "response"; agentSessionId?: string; body: string }
  | { type: "error"; agentSessionId?: string; body: string }
  | {
      type: "elicitation";
      agentSessionId?: string;
      body: string;
      signal?: string;
      signalMeta?: Record<string, unknown>;
    };

export type AgentSessionCreateResult = {
  success: boolean;
  agentSessionId: string | null;
};

export interface AgentSessionExternalUrl {
  label: string;
  url: string;
}

export function buildAgentSessionStatusUrl(origin: string, agentSessionId: string): string {
  return `${origin}/agent-sessions/${encodeURIComponent(agentSessionId)}`;
}

export function buildAgentSessionExternalUrls(origin: string, agentSessionId: string): AgentSessionExternalUrl[] {
  return [
    {
      label: "查看处理状态",
      url: buildAgentSessionStatusUrl(origin, agentSessionId),
    },
  ];
}

export async function createAgentActivity(
  env: Env,
  workspaceId: string,
  input: AgentActivityContentWithSession,
) {
  return withWorkspaceAccessToken<{ success: boolean; activityId: string | null }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);

    // 使用断言确保类型正确（Linear SDK 可能期望 string）
    const agentSessionId = input.agentSessionId ? String(input.agentSessionId) : undefined;

    // 使用 any 绕过类型检查
    const payload: any = await client.createAgentActivity({
      agentSessionId: agentSessionId as any,
      content: { type: input.type, ...input.content },
      ephemeral: input.ephemeral ?? false,
    } as any);

    // payload is an AgentActivityPayload model; keep it lax.
    const success = typeof payload?.success === "boolean" ? payload.success : true;
    const activityId = payload?.agentActivity?.id ?? null;
    return { success, activityId };
  });
}

export async function createAgentSessionOnComment(
  env: Env,
  workspaceId: string,
  commentId: string,
  externalUrls?: AgentSessionExternalUrl[],
): Promise<AgentSessionCreateResult> {
  return withWorkspaceAccessToken<AgentSessionCreateResult>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient, sdkRequest } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);
    const data = await sdkRequest<any>(
      client,
      `mutation($commentId: String!, $externalUrls: [AgentSessionExternalUrlInput!]) {
        agentSessionCreateOnComment(input: { commentId: $commentId, externalUrls: $externalUrls }) {
          success
          agentSession { id }
        }
      }`,
      { commentId, externalUrls },
    );

    const result = data?.agentSessionCreateOnComment ?? {};
    return {
      success: Boolean(result.success),
      agentSessionId: result?.agentSession?.id ?? null,
    };
  });
}

export async function createAgentSessionOnIssue(
  env: Env,
  workspaceId: string,
  issueId: string,
  externalUrls?: AgentSessionExternalUrl[],
): Promise<AgentSessionCreateResult> {
  return withWorkspaceAccessToken<AgentSessionCreateResult>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient, sdkRequest } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);
    const data = await sdkRequest<any>(
      client,
      `mutation($issueId: String!, $externalUrls: [AgentSessionExternalUrlInput!]) {
        agentSessionCreateOnIssue(input: { issueId: $issueId, externalUrls: $externalUrls }) {
          success
          agentSession { id }
        }
      }`,
      { issueId, externalUrls },
    );

    const result = data?.agentSessionCreateOnIssue ?? {};
    return {
      success: Boolean(result.success),
      agentSessionId: result?.agentSession?.id ?? null,
    };
  });
}

export async function updateAgentSessionExternalUrls(
  env: Env,
  workspaceId: string,
  agentSessionId: string,
  externalUrls: AgentSessionExternalUrl[],
): Promise<{ success: boolean }> {
  return withWorkspaceAccessToken<{ success: boolean }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient, sdkRequest } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);
    const data = await sdkRequest<any>(
      client,
      `mutation($id: String!, $input: AgentSessionUpdateExternalUrlInput!) {
        agentSessionUpdateExternalUrl(id: $id, input: $input) {
          success
          agentSession { id }
        }
      }`,
      {
        id: agentSessionId,
        input: { externalUrls },
      },
    );

    return {
      success: Boolean(data?.agentSessionUpdateExternalUrl?.success),
    };
  });
}
