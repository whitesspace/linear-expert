import { z } from "zod";
import type { Env } from "../env";
import { assertInternalSecret } from "../auth/internal";
import type { TaskResultAction, TaskStatus } from "../domain/task";
import { json } from "../lib/http";
import {
  AssignIssueInputSchema,
  IssueCreateInputSchema,
  IssueUpdateFieldsSchema,
  IssueUpdateInputSchema,
  TransitionIssueInputSchema,
  WorkspaceScopedSchema,
} from "../linear/contracts";
import {
  addAttachment,
  addIssueToProject,
  assignIssue,
  createIssue,
  getIssueByIdentifier,
  postComment,
  transitionIssueState,
  updateIssue,
} from "../linear/client";
import type { StorageAdapter } from "../storage/types";

const CommentRequestSchema = z.object({
  workspaceId: z.string().min(1),
  issueId: z.string().min(1),
  body: z.string().min(1),
});

const CreateIssueRequestSchema = WorkspaceScopedSchema.merge(IssueCreateInputSchema);
const UpdateIssueRequestSchema = WorkspaceScopedSchema.extend(IssueUpdateFieldsSchema.shape).refine(
  (value) => value.title !== undefined || value.description !== undefined || value.projectId !== undefined,
  {
    message: "update_issue requires at least one field to update",
  },
);
const AssignIssueRequestSchema = WorkspaceScopedSchema.merge(AssignIssueInputSchema);
const TransitionIssueRequestSchema = WorkspaceScopedSchema.merge(TransitionIssueInputSchema);

const AddToProjectInputSchema = z.object({
  issueId: z.string().min(1),
  projectId: z.string().min(1),
});
const AddToProjectRequestSchema = WorkspaceScopedSchema.merge(AddToProjectInputSchema);

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

async function parseJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch (error) {
    console.warn("invalid JSON body", error);
    throw new Error("invalid JSON");
  }
}

async function handleComment(request: Request, env: Env): Promise<Response> {
  const payload = CommentRequestSchema.safeParse(await parseJson(request));
  if (!payload.success) {
    return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
  }
  const result = await postComment(env, payload.data.workspaceId, payload.data.issueId, payload.data.body);
  return json({ ok: true, action: "comment", result });
}

async function handleCreateIssue(request: Request, env: Env): Promise<Response> {
  const payload = CreateIssueRequestSchema.safeParse(await parseJson(request));
  if (!payload.success) {
    return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
  }
  const { workspaceId, ...issueInput } = payload.data;
  const result = await createIssue(env, workspaceId, issueInput);
  return json({ ok: true, action: "create_issue", result });
}

async function handleUpdateIssue(request: Request, env: Env): Promise<Response> {
  const payload = UpdateIssueRequestSchema.safeParse(await parseJson(request));
  if (!payload.success) {
    return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
  }
  const result = await updateIssue(env, payload.data.workspaceId, payload.data);
  return json({ ok: true, action: "update_issue", result });
}

async function handleAssignIssue(request: Request, env: Env): Promise<Response> {
  const payload = AssignIssueRequestSchema.safeParse(await parseJson(request));
  if (!payload.success) {
    return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
  }
  const result = await assignIssue(env, payload.data.workspaceId, payload.data);
  return json({ ok: true, action: "assign_issue", result });
}

async function handleTransitionIssue(request: Request, env: Env): Promise<Response> {
  const payload = TransitionIssueRequestSchema.safeParse(await parseJson(request));
  if (!payload.success) {
    return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
  }
  const result = await transitionIssueState(env, payload.data.workspaceId, payload.data);
  return json({ ok: true, action: "transition_issue", result });
}

async function handleAddToProject(request: Request, env: Env): Promise<Response> {
  const payload = AddToProjectRequestSchema.safeParse(await parseJson(request));
  if (!payload.success) {
    return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
  }
  const result = await addIssueToProject(env, payload.data.workspaceId, payload.data);
  return json({ ok: true, action: "add_to_project", result });
}

const GetIssueRequestSchema = z.object({
  workspaceId: z.string().min(1),
  identifier: z.string().min(1),
});

async function handleGetIssue(request: Request, env: Env): Promise<Response> {
  const payload = GetIssueRequestSchema.safeParse(await parseJson(request));
  if (!payload.success) {
    return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
  }
  const result = await getIssueByIdentifier(env, payload.data.workspaceId, payload.data.identifier);
  return json({ ok: true, action: "get_issue", result });
}

const AddAttachmentRequestSchema = z.object({
  workspaceId: z.string().min(1),
  issueId: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url(),
});

async function handleAddAttachment(request: Request, env: Env): Promise<Response> {
  const payload = AddAttachmentRequestSchema.safeParse(await parseJson(request));
  if (!payload.success) {
    return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
  }
  const result = await addAttachment(env, payload.data.workspaceId, payload.data);
  return json({ ok: true, action: "add_attachment", result });
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

  if (url.pathname === "/internal/linear/comment" && request.method === "POST") {
    return handleComment(request, env);
  }

  if (url.pathname === "/internal/linear/issues/create" && request.method === "POST") {
    return handleCreateIssue(request, env);
  }

  if (url.pathname === "/internal/linear/issues/update" && request.method === "POST") {
    return handleUpdateIssue(request, env);
  }

  if (url.pathname === "/internal/linear/issues/assign" && request.method === "POST") {
    return handleAssignIssue(request, env);
  }

  if (url.pathname === "/internal/linear/issues/state" && request.method === "POST") {
    return handleTransitionIssue(request, env);
  }

  if (url.pathname === "/internal/linear/issues/project" && request.method === "POST") {
    return handleAddToProject(request, env);
  }

  if (url.pathname === "/internal/linear/issues/get" && request.method === "POST") {
    return handleGetIssue(request, env);
  }

  if (url.pathname === "/internal/linear/issues/attachment" && request.method === "POST") {
    return handleAddAttachment(request, env);
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

  const existing = await storage.tasks.listByStatus({ status: "processing", limit: 1000 });
  const task = existing.find((t) => t.id === taskId) || null;
  if (!task) {
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
