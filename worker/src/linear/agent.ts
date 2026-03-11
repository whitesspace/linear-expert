import type { Env } from "../env";
import { withWorkspaceAccessToken } from "./client";

export type AgentActivityKind = "thought" | "action" | "response" | "error" | "elicitation";

export type AgentSessionCreateResult = {
  success: boolean;
  agentSessionId: string | null;
};

export async function createAgentActivity(
  env: Env,
  workspaceId: string,
  input: {
    agentSessionId: string;
    type: AgentActivityKind;
    content: Record<string, unknown>;
    ephemeral?: boolean;
  },
) {
  return withWorkspaceAccessToken<{ success: boolean; activityId: string | null }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);

    const payload: any = await client.createAgentActivity({
      agentSessionId: input.agentSessionId,
      content: { type: input.type, ...input.content },
      ephemeral: input.ephemeral ?? false,
    });

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
