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
): Promise<AgentSessionCreateResult> {
  return withWorkspaceAccessToken<AgentSessionCreateResult>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient, sdkRequest } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);
    const data = await sdkRequest<any>(
      client,
      `mutation($commentId: String!) {
        agentSessionCreateOnComment(input: { commentId: $commentId }) {
          success
          agentSession { id }
        }
      }`,
      { commentId },
    );

    const result = data?.agentSessionCreateOnComment ?? {};
    return {
      success: Boolean(result.success),
      agentSessionId: result?.agentSession?.id ?? null,
    };
  });
}
