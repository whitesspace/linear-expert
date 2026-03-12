import { z } from "zod";
import type { Env } from "../env";
import { assertInternalSecret } from "../auth/internal";
import type { AgentRunStatus } from "../domain/agent-run";
import type { TaskResultAction, TaskStatus } from "../domain/task";
import { json } from "../lib/http";
import {
  AssignIssueInputSchema,
  IssueCreateInputSchema,
  IssueUpdateInputSchema,
  TransitionIssueInputSchema,
} from "../linear/contracts";
import {
  assignIssue,
  createIssue,
  postComment,
  transitionIssueState,
  updateIssue,
} from "../linear/client";
import { createAgentActivity } from "../linear/agent";
import { clearInflightSession } from "../linear/dedup";
import { executeOpenClawIntent } from "../linear/intent-executor";
import { completeSession, failSession, updateSessionActivity } from "../linear/session-lifecycle";
import type { StorageAdapter } from "../storage/types";
import { OpenClawIntentSchema } from "./invoke-intent";
import { handleInternalLinearRequest } from "./internal-linear";

export const TaskResultSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("reply"),
    replyBody: z.string().min(1),
    reason: z.string().optional(),
  }),
  z.object({
    action: z.literal("create_issue"),
    issue: IssueCreateInputSchema,
    reason: z.string().optional(),
  }),
  z.object({
    action: z.literal("update_issue"),
    issue: IssueUpdateInputSchema,
    reason: z.string().optional(),
  }),
  z.object({
    action: z.literal("assign_issue"),
    issue: AssignIssueInputSchema,
    reason: z.string().optional(),
  }),
  z.object({
    action: z.literal("transition_issue"),
    issue: TransitionIssueInputSchema,
    reason: z.string().optional(),
  }),
  z.object({
    action: z.literal("noop"),
    reason: z.string().optional(),
  }),
  z.object({
    action: z.literal("error"),
    reason: z.string().optional(),
  }),
]);

const AgentRunResultSchema = z.object({
  ok: z.boolean(),
  intent: z.unknown().optional(),
  error: z.string().optional(),
  raw: z.string().optional(),
}).refine((value) => (value.ok ? value.intent !== undefined : true), {
  message: "agent_run_result requires intent when ok=true",
});

const AgentRunHeartbeatSchema = z.object({
  phase: z.string().min(1).optional(),
  message: z.string().min(1).optional(),
  percent: z.number().min(0).max(100).optional(),
  gatewayRunId: z.string().min(1).optional(),
}).refine(
  (value) => value.phase !== undefined || value.message !== undefined || value.percent !== undefined || value.gatewayRunId !== undefined,
  { message: "heartbeat payload requires at least one field" },
);

type LinearMutationResult =
  | Awaited<ReturnType<typeof postComment>>
  | Awaited<ReturnType<typeof createIssue>>
  | Awaited<ReturnType<typeof updateIssue>>
  | Awaited<ReturnType<typeof assignIssue>>
  | Awaited<ReturnType<typeof transitionIssueState>>;

function parseStatus(value: string | null): TaskStatus {
  const fallback: TaskStatus = "pending";
  if (!value) return fallback;
  const allowed: TaskStatus[] = ["pending", "processing", "completed", "ignored", "failed"];
  return (allowed.find((status) => status === value) ?? fallback) as TaskStatus;
}

function parseAgentRunStatus(value: string | null): AgentRunStatus {
  const fallback: AgentRunStatus = "pending";
  if (!value) return fallback;
  const allowed: AgentRunStatus[] = ["pending", "processing", "completed", "failed"];
  return (allowed.find((status) => status === value) ?? fallback) as AgentRunStatus;
}

async function executeTaskAction(
  env: Env,
  workspaceId: string,
  targetIssueId: string,
  parsed: z.infer<typeof TaskResultSchema>,
) {
  let replyBody: string | null = null;
  let linearResult: LinearMutationResult | null = null;

  switch (parsed.action) {
    case "reply":
      replyBody = parsed.replyBody;
      linearResult = await postComment(env, workspaceId, targetIssueId, parsed.replyBody);
      break;
    case "create_issue":
      linearResult = await createIssue(env, workspaceId, parsed.issue);
      break;
    case "update_issue":
      linearResult = await updateIssue(env, workspaceId, parsed.issue);
      break;
    case "assign_issue":
      linearResult = await assignIssue(env, workspaceId, parsed.issue);
      break;
    case "transition_issue":
      linearResult = await transitionIssueState(env, workspaceId, parsed.issue);
      break;
    case "noop":
    case "error":
      linearResult = null;
      break;
  }

  return { linearResult, replyBody };
}

export async function handleInternalRequest(
  request: Request,
  env: Env,
  storage: StorageAdapter,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/internal")) return null;

  const authError = assertInternalSecret(request, env);
  if (authError) return authError;

  if (url.pathname === "/internal/tasks" && request.method === "GET") {
    return handleListTasks(url, storage);
  }

  if (url.pathname === "/internal/agent-runs" && request.method === "GET") {
    return handleListAgentRuns(url, storage);
  }

  const linearResponse = await handleInternalLinearRequest(request, env);
  if (linearResponse) return linearResponse;

  const claimMatch = url.pathname.match(/^\/internal\/tasks\/(.+)\/claim$/);
  if (claimMatch && request.method === "POST") {
    return handleClaimTask(request, storage, claimMatch[1]);
  }

  const resultMatch = url.pathname.match(/^\/internal\/tasks\/(.+)\/result$/);
  if (resultMatch && request.method === "POST") {
    return handleSubmitResult(request, env, storage, resultMatch[1]);
  }

  const runClaimMatch = url.pathname.match(/^\/internal\/agent-runs\/(.+)\/claim$/);
  if (runClaimMatch && request.method === "POST") {
    return handleClaimAgentRun(request, storage, runClaimMatch[1]);
  }

  const runResultMatch = url.pathname.match(/^\/internal\/agent-runs\/(.+)\/result$/);
  if (runResultMatch && request.method === "POST") {
    return handleSubmitAgentRunResult(request, env, storage, runResultMatch[1]);
  }

  const runHeartbeatMatch = url.pathname.match(/^\/internal\/agent-runs\/(.+)\/heartbeat$/);
  if (runHeartbeatMatch && request.method === "POST") {
    return handleHeartbeatAgentRun(request, storage, runHeartbeatMatch[1]);
  }

  return json({ error: "not found" }, { status: 404 });
}

async function handleListTasks(url: URL, storage: StorageAdapter): Promise<Response> {
  const status = parseStatus(url.searchParams.get("status"));
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 25;
  const tasks = await storage.tasks.listByStatus({ status, limit });
  return json({ tasks });
}

async function handleListAgentRuns(url: URL, storage: StorageAdapter): Promise<Response> {
  const status = parseAgentRunStatus(url.searchParams.get("status"));
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 25;
  const runs = await storage.agentRuns.listByStatus({ status, limit });
  return json({ runs });
}

async function handleClaimTask(request: Request, storage: StorageAdapter, taskId: string): Promise<Response> {
  const bodyText = await request.text();
  let lockSeconds = 300;
  if (bodyText) {
    try {
      const parsed = JSON.parse(bodyText);
      if (typeof parsed.lockDurationSeconds === "number") {
        lockSeconds = Math.max(60, Math.min(3600, parsed.lockDurationSeconds));
      }
    } catch (error) {
      console.warn("invalid claim body", error);
      return json({ error: "invalid JSON" }, { status: 400 });
    }
  }

  const claimed = await storage.tasks.claim(taskId, lockSeconds);
  if (!claimed) return json({ error: "task unavailable" }, { status: 409 });
  return json({ task: claimed });
}

async function handleSubmitResult(request: Request, env: Env, storage: StorageAdapter, taskId: string): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch (error) {
    console.warn("invalid result body", error);
    return json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = TaskResultSchema.safeParse(payload);
  if (!parsed.success) {
    return json({ error: "invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const task = await storage.tasks.findById(taskId);
  if (!task || task.status !== "processing") {
    return json({ error: "task not found or not processing" }, { status: 404 });
  }

  const statusMap: Record<TaskResultAction, Exclude<TaskStatus, "pending">> = {
    reply: "completed",
    create_issue: "completed",
    update_issue: "completed",
    assign_issue: "completed",
    transition_issue: "completed",
    noop: "ignored",
    error: "failed",
  };

  const { linearResult, replyBody } = await executeTaskAction(env, task.workspaceId, task.issueId, parsed.data);

  if (parsed.data.action === "reply" && replyBody) {
    await storage.replies.create({
      taskId: task.id,
      issueId: task.issueId,
      body: replyBody,
    }, "sent");
  }

  const updated = await storage.tasks.applyResult(taskId, {
    status: statusMap[parsed.data.action],
    resultAction: parsed.data.action,
    resultReason: parsed.data.reason ?? null,
    replyBody,
  });
  if (!updated) return json({ error: "task not found" }, { status: 404 });
  return json({ task: updated, linearResult });
}

async function handleClaimAgentRun(request: Request, storage: StorageAdapter, runId: string): Promise<Response> {
  const bodyText = await request.text();
  let lockSeconds = 300;
  if (bodyText) {
    try {
      const parsed = JSON.parse(bodyText);
      if (typeof parsed.lockDurationSeconds === "number") {
        lockSeconds = Math.max(60, Math.min(3600, parsed.lockDurationSeconds));
      }
    } catch (error) {
      console.warn("invalid claim body", error);
      return json({ error: "invalid JSON" }, { status: 400 });
    }
  }

  const claimed = await storage.agentRuns.claim(runId, lockSeconds);
  if (!claimed) return json({ error: "run unavailable" }, { status: 409 });
  return json({ run: claimed });
}

async function handleSubmitAgentRunResult(
  request: Request,
  env: Env,
  storage: StorageAdapter,
  runId: string,
): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch (error) {
    console.warn("invalid run result body", error);
    return json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = AgentRunResultSchema.safeParse(payload);
  if (!parsed.success) {
    return json({ error: "invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const run = await storage.agentRuns.findById(runId);
  if (!run) {
    return json({ error: "run not found" }, { status: 404 });
  }
  if (run.status !== "processing") {
    return json({ error: "run not processing" }, { status: 409 });
  }
  const processingRun = run;

  async function finalizeRun(status: "completed" | "failed") {
    await updateSessionActivity(storage, processingRun.agentSessionId);
    clearInflightSession(processingRun.agentSessionId);
    if (status === "completed") await completeSession(storage, processingRun.agentSessionId);
    else await failSession(storage, processingRun.agentSessionId);
    return storage.agentRuns.applyResult(runId, { status });
  }

  if (!parsed.data.ok) {
    await createAgentActivity(env, processingRun.workspaceId, {
      agentSessionId: processingRun.agentSessionId,
      type: "error",
      content: {
        body: `OpenClaw 运行失败：${parsed.data.error ?? "unknown_error"}`,
      },
    });
    const updated = await finalizeRun("failed");
    return json({ run: updated });
  }

  const intentParsed = OpenClawIntentSchema.safeParse(parsed.data.intent);
  if (!intentParsed.success) {
    const detail = JSON.stringify(intentParsed.error.flatten());
    const raw = JSON.stringify(parsed.data.intent ?? null).slice(0, 800);
    await createAgentActivity(env, processingRun.workspaceId, {
      agentSessionId: processingRun.agentSessionId,
      type: "error",
      content: {
        body: `OpenClaw intent schema 无法解析。details=${detail} raw=${raw}`,
      },
    });
    const updated = await finalizeRun("failed");
    return json({ run: updated });
  }

  const origin = new URL(request.url).origin;
  const execResult = await executeOpenClawIntent({
    env,
    origin,
    workspaceId: processingRun.workspaceId,
    agentSessionId: processingRun.agentSessionId,
    traceId: processingRun.traceId,
    intent: intentParsed.data,
  });

  const updated = await finalizeRun(execResult.ok ? "completed" : "failed");
  return json({ run: updated });
}

async function handleHeartbeatAgentRun(
  request: Request,
  storage: StorageAdapter,
  runId: string,
): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch (error) {
    console.warn("invalid heartbeat body", error);
    return json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = AgentRunHeartbeatSchema.safeParse(payload);
  if (!parsed.success) {
    return json({ error: "invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const run = await storage.agentRuns.findById(runId);
  if (!run) {
    return json({ error: "run not found" }, { status: 404 });
  }
  if (run.status !== "processing") {
    return json({ error: "run not processing" }, { status: 409 });
  }

  const updated = await storage.agentRuns.updateHeartbeat(runId, parsed.data);
  if (!updated) {
    return json({ error: "run unavailable" }, { status: 409 });
  }
  return json({ run: updated });
}
