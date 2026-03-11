import type { Env } from "../env";
import { createAgentActivity } from "./agent";
import type { OpenClawIntent } from "../routes/invoke-intent";
import { isStopped } from "../storage/stop";

type ExecuteIntentInput = {
  env: Env;
  origin: string;
  workspaceId: string;
  agentSessionId: string;
  traceId: string;
  intent: OpenClawIntent;
};

export async function executeOpenClawIntent(input: ExecuteIntentInput): Promise<{ ok: boolean }> {
  const { env, origin, workspaceId, agentSessionId, traceId, intent } = input;
  let failed = false;

  for (const action of intent.actions) {
    if (action.kind === "noop") continue;
    if (isStopped(env, agentSessionId)) {
      await createAgentActivity(env, workspaceId, {
        agentSessionId,
        type: "response",
        content: {
          body: "已收到 stop signal，已停止继续执行后续动作。",
        },
      });
      failed = true;
      break;
    }

    const actionParameter = JSON.stringify({
      issueId: action.issueId,
      issueIdentifier: action.issueIdentifier,
      stateId: action.stateId,
      assigneeId: action.assigneeId,
      body: action.body,
      reason: action.reason,
    });

    await createAgentActivity(env, workspaceId, {
      agentSessionId,
      type: "action",
      content: {
        action: action.kind,
        parameter: actionParameter,
      },
    });

    let path = "";
    let body: Record<string, unknown> = { workspaceId };

    if (action.kind === "comment") {
      path = "/internal/linear/comment";
      body = { ...body, issueId: action.issueId, issueIdentifier: action.issueIdentifier, body: action.body || "" };
    } else if (action.kind === "assign") {
      path = "/internal/linear/issues/assign";
      body = { ...body, issueId: action.issueId, assigneeId: action.assigneeId };
    } else if (action.kind === "transition") {
      path = "/internal/linear/issues/state";
      body = { ...body, issueId: action.issueId, stateId: action.stateId };
    }

    const res = await fetch(`${origin}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.OPENCLAW_INTERNAL_SECRET}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      await createAgentActivity(env, workspaceId, {
        agentSessionId,
        type: "error",
        content: {
          body: `${action.kind} 执行失败: ${res.status} ${text.slice(0, 800)}`,
        },
      });
      failed = true;
      break;
    }
  }

  if (!failed) {
    await createAgentActivity(env, workspaceId, {
      agentSessionId,
      type: "response",
      content: {
        body: "已执行 OpenClaw intent 并完成回写（v0）。",
      },
    });
  }

  return { ok: !failed };
}
