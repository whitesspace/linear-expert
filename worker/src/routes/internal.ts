import { z } from "zod";
import type { Env } from "../env";
import { assertInternalSecret } from "../auth/internal";
import type { TaskStatus } from "../domain/task";
import { json } from "../lib/http";
import { postComment } from "../linear/client";
import type { StorageAdapter } from "../storage/types";

const TaskResultSchema = z.object({
  action: z.enum(["reply", "noop", "error"]),
  replyBody: z.string().min(1).optional(),
  reason: z.string().optional(),
});

function parseStatus(value: string | null): TaskStatus {
  const fallback: TaskStatus = "pending";
  if (!value) return fallback;
  const allowed: TaskStatus[] = ["pending", "processing", "completed", "ignored", "failed"];
  return (allowed.find((status) => status === value) ?? fallback) as TaskStatus;
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

  const claimMatch = url.pathname.match(/^\/internal\/tasks\/(.+)\/claim$/);
  if (claimMatch && request.method === "POST") {
    return handleClaimTask(request, storage, claimMatch[1]);
  }

  const resultMatch = url.pathname.match(/^\/internal\/tasks\/(.+)\/result$/);
  if (resultMatch && request.method === "POST") {
    return handleSubmitResult(request, env, storage, resultMatch[1]);
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

  const { action, replyBody, reason } = parsed.data;
  const existing = await storage.tasks.listByStatus({ status: 'processing', limit: 1000 });
  const task = existing.find((t) => t.id === taskId) || null;
  if (!task) {
    return json({ error: 'task not found or not processing' }, { status: 404 });
  }

  const statusMap: Record<'reply' | 'noop' | 'error', Exclude<TaskStatus, 'pending'>> = {
    reply: 'completed',
    noop: 'ignored',
    error: 'failed'
  };

  let linearComment: unknown = null;
  if (action === 'reply' && replyBody) {
    linearComment = await postComment(env, task.workspaceId, task.issueId, replyBody);
    await storage.replies.create({
      taskId: task.id,
      issueId: task.issueId,
      body: replyBody
    }, 'sent');
  }

  const updated = await storage.tasks.applyResult(taskId, {
    status: statusMap[action],
    resultAction: action,
    resultReason: reason ?? null,
    replyBody: replyBody ?? null,
  });
  if (!updated) return json({ error: 'task not found' }, { status: 404 });
  return json({ task: updated, linearComment });
}
