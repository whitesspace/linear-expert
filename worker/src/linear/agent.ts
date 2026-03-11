import type { Env } from "../env";
import { withWorkspaceAccessToken } from "./client";

export type AgentActivityKind = "thought" | "action" | "response" | "error" | "elicitation";

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
