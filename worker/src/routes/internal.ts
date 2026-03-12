import { z } from "zod";
import type { Env } from "../env";
import { assertInternalSecret } from "../auth/internal";
import type { AgentRunStatus } from "../domain/agent-run";
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
  createIssueRelation,
  getInstallationIdentity,
  getIssueByIdentifier,
  listIssuesByNumbers,
  listTeamStates,
  postComment,
  transitionIssueState,
  updateIssue,
} from "../linear/client";
import { createAgentActivity } from "../linear/agent";
import { archiveProject, createProject, getProject, listProjects, updateProject } from "../linear/projects";
import { triageList } from "../linear/triage";
import { archiveInitiative, createInitiative, getInitiative, listInitiatives, updateInitiative } from "../linear/initiatives";
import { archiveCycle, createCycle, getCycle, listCycles, updateCycle } from "../linear/cycles";
import { createIssueLabel, getIssueLabel, listIssueLabels, restoreIssueLabel, retireIssueLabel, updateIssueLabel } from "../linear/labels";
import { executeOpenClawIntent } from "../linear/intent-executor";
import type { StorageAdapter } from "../storage/types";
import { OpenClawIntentSchema } from "./invoke-intent";
import { revokeSessionToken, verifySessionToken } from "../linear/session-token";

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

const ResolveRequestSchema = z.object({
  teamKey: z.string().min(1),
  workspaceId: z.string().min(1).optional(),
});

const TriageListRequestSchema = z.object({
  workspaceId: z.string().min(1),
  teamId: z.string().min(1),
  stateName: z.string().min(1).optional(),
  excludeDone: z.boolean().optional(),
  excludeCancelled: z.boolean().optional(),
  limit: z.number().int().positive().max(100).optional(),
});

const InitiativesListRequestSchema = z.object({
  workspaceId: z.string().min(1),
  limit: z.number().int().positive().max(100).optional(),
});

const InitiativesGetRequestSchema = z.object({
  workspaceId: z.string().min(1),
  id: z.string().min(1),
});

const InitiativesCreateRequestSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
});

const InitiativesUpdateRequestSchema = z.object({
  workspaceId: z.string().min(1),
  id: z.string().min(1),
  name: z.string().optional(),
  description: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
});

const InitiativesArchiveRequestSchema = z.object({
  workspaceId: z.string().min(1),
  id: z.string().min(1),
});

const CyclesListRequestSchema = z.object({
  workspaceId: z.string().min(1),
  teamId: z.string().min(1),
  limit: z.number().int().min(1).max(100).optional(),
});

const CyclesGetRequestSchema = z.object({
  workspaceId: z.string().min(1),
  id: z.string().min(1),
});

const CyclesCreateRequestSchema = z.object({
  workspaceId: z.string().min(1),
  teamId: z.string().min(1),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  name: z.string().optional().nullable(),
});

const CyclesUpdateRequestSchema = z.object({
  workspaceId: z.string().min(1),
  id: z.string().min(1),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  name: z.string().optional().nullable(),
});

const CyclesArchiveRequestSchema = z.object({
  workspaceId: z.string().min(1),
  id: z.string().min(1),
});

const LabelsListRequestSchema = z.object({
  workspaceId: z.string().min(1),
  limit: z.number().int().min(1).max(100).optional(),
});

const LabelsGetRequestSchema = z.object({
  workspaceId: z.string().min(1),
  id: z.string().min(1),
});

const LabelsCreateRequestSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1),
  color: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
});

const LabelsUpdateRequestSchema = z.object({
  workspaceId: z.string().min(1),
  id: z.string().min(1),
  name: z.string().optional(),
  color: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
});

const LabelsRetireRequestSchema = z.object({
  workspaceId: z.string().min(1),
  id: z.string().min(1),
});

const LabelsRestoreRequestSchema = z.object({
  workspaceId: z.string().min(1),
  id: z.string().min(1),
});

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

/**
 * 验证会话令牌（Bearer Token）
 * 从 Authorization header 提取并验证
 */
function getSessionTokenFromAuth(request: Request): string | null {
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice("Bearer ".length).trim();
}

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

async function handleResolve(request: Request, env: Env): Promise<Response> {
  try {
    const payload = ResolveRequestSchema.safeParse(await parseJson(request));
    if (!payload.success) {
      return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
    }

    const { getStorage } = await import("../storage");
    const storage = getStorage(env);

    const workspaceId = payload.data.workspaceId;
    if (!workspaceId) {
      return json(
        {
          ok: false,
          error: "invalid_request",
          message: "workspaceId is required (use Linear webhook organizationId).",
        },
        { status: 400 },
      );
    }

    // Use shared token refresh logic.
    const { withWorkspaceAccessToken, getInstallationIdentity } = await import("../linear/client");

    const identity = await withWorkspaceAccessToken(env, workspaceId, async (accessToken) => {
      // identity is useful for debugging; resolves org id.
      return getInstallationIdentity(accessToken);
    });

    // Resolve teamId by teamKey.
    const { createLinearSdkClient, sdkRequest } = await import("../linear/sdk");
    const accessToken = await withWorkspaceAccessToken(env, workspaceId, async (t) => t);
    const client = createLinearSdkClient(accessToken);

    type TeamsByKeyResponse = {
      teams?: {
        nodes?: Array<{ id: string; key: string }>;
      };
    };

    const teamsData = await sdkRequest<TeamsByKeyResponse>(
      client,
      `query($teamKey: String!) { teams(filter: { key: { eq: $teamKey } }) { nodes { id key } } }`,
      { teamKey: payload.data.teamKey },
    );

    const teamId = teamsData?.teams?.nodes?.[0]?.id;
    if (!teamId) {
      return json({ ok: false, error: "team_not_found", teamKey: payload.data.teamKey }, { status: 404 });
    }

    return json({ ok: true, workspaceId, teamId, identity });
  } catch (err) {
    console.error("handleResolve error:", err);
    return json({ ok: false, error: "internal_error", message: String(err) }, { status: 500 });
  }
}

const GetIssueRequestSchema = z.object({
  workspaceId: z.string().min(1),
  identifier: z.string().min(1),
});

const IssueChildrenRequestSchema = z.object({
  workspaceId: z.string().min(1),
  issueId: z.string().min(1),
  first: z.number().int().positive().max(100).optional(),
});

async function handleGetIssue(request: Request, env: Env): Promise<Response> {
  const payload = GetIssueRequestSchema.safeParse(await parseJson(request));
  if (!payload.success) {
    return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
  }
  const result = await getIssueByIdentifier(env, payload.data.workspaceId, payload.data.identifier);
  return json({ ok: true, action: "get_issue", result });
}

async function handleListIssueChildren(request: Request, env: Env): Promise<Response> {
  const payload = IssueChildrenRequestSchema.safeParse(await parseJson(request));
  if (!payload.success) {
    return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
  }
  const { listIssueChildren } = await import("../linear/client");
  const result = await listIssueChildren(env, payload.data.workspaceId, payload.data.issueId, payload.data.first ?? 50);
  return json({ ok: true, action: "issue_children", result });
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

const IssueRelationRequestSchema = z.object({
  workspaceId: z.string().min(1),
  issueId: z.string().min(1),
  relatedIssueId: z.string().min(1),
  relationType: z.enum(["blocks", "duplicates", "relates_to"]),
});

async function handleCreateIssueRelation(request: Request, env: Env): Promise<Response> {
  try {
    const payload = IssueRelationRequestSchema.safeParse(await parseJson(request));
    if (!payload.success) {
      return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
    }
    const result = await createIssueRelation(env, payload.data.workspaceId, payload.data);
    return json({ ok: true, action: "create_relation", result });
  } catch (err) {
    console.error("handleCreateIssueRelation error:", err);
    return json({ ok: false, error: "internal_error", message: String(err) }, { status: 500 });
  }
}

const ListIssuesByNumbersRequestSchema = z.object({
  workspaceId: z.string().min(1),
  teamId: z.string().min(1),
  numbers: z.array(z.number().int().positive()).min(1),
});

async function handleListIssuesByNumbers(request: Request, env: Env): Promise<Response> {
  const payload = ListIssuesByNumbersRequestSchema.safeParse(await parseJson(request));
  if (!payload.success) {
    return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
  }
  const result = await listIssuesByNumbers(env, payload.data.workspaceId, payload.data.teamId, payload.data.numbers);
  return json({ ok: true, action: "list_issues_by_numbers", result });
}

const ListTeamStatesRequestSchema = z.object({
  workspaceId: z.string().min(1),
  teamId: z.string().min(1),
});

async function handleListTeamStates(request: Request, env: Env): Promise<Response> {
  const payload = ListTeamStatesRequestSchema.safeParse(await parseJson(request));
  if (!payload.success) {
    return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
  }
  const result = await listTeamStates(env, payload.data.workspaceId, payload.data.teamId);
  return json({ ok: true, action: "list_team_states", result });
}

const ProjectsListRequestSchema = z.object({
  workspaceId: z.string().min(1),
  teamId: z.string().min(1),
});
const ProjectsGetRequestSchema = z.object({
  workspaceId: z.string().min(1),
  projectId: z.string().min(1),
});
const ProjectsCreateRequestSchema = z.object({
  workspaceId: z.string().min(1),
  teamId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
});
const ProjectsUpdateRequestSchema = z.object({
  workspaceId: z.string().min(1),
  projectId: z.string().min(1),
  name: z.string().optional(),
  description: z.string().optional(),
});
const ProjectsDeleteRequestSchema = z.object({
  workspaceId: z.string().min(1),
  projectId: z.string().min(1),
});

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

  // 首先验证 internal secret
  const authError = assertInternalSecret(request, env);
  if (authError) {
    // Internal secret 验证失败，尝试验证会话令牌
    const sessionToken = getSessionTokenFromAuth(request);
    if (!sessionToken) {
      return authError;
    }

    const context = verifySessionToken(sessionToken);
    if (!context) {
      return json({ error: "invalid_or_expired_session_token" }, { status: 401 });
    }

    // 将上下文附加到请求（通过 env 或其他机制）
    (request as any).sessionContext = context;
  }

  if (url.pathname === "/internal/tasks" && request.method === "GET") {
    return handleListTasks(url, storage);
  }

  if (url.pathname === "/internal/agent-runs" && request.method === "GET") {
    return handleListAgentRuns(url, storage);
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

  if (url.pathname === "/internal/linear/issues/children" && request.method === "POST") {
    return handleListIssueChildren(request, env);
  }

  if (url.pathname === "/internal/linear/resolve" && request.method === "POST") {
    return handleResolve(request, env);
  }

  if (url.pathname === "/internal/linear/issues/attachment" && request.method === "POST") {
    return handleAddAttachment(request, env);
  }

  if (url.pathname === "/internal/linear/issues/relation" && request.method === "POST") {
    return handleCreateIssueRelation(request, env);
  }

  if (url.pathname === "/internal/linear/issues/list" && request.method === "POST") {
    return handleListIssuesByNumbers(request, env);
  }

  if (url.pathname === "/internal/linear/team/states" && request.method === "POST") {
    return handleListTeamStates(request, env);
  }

  if (url.pathname === "/internal/linear/team/projects" && request.method === "POST") {
    const payload = z.object({ workspaceId: z.string().min(1), teamId: z.string().min(1) }).safeParse(await parseJson(request));
    if (!payload.success) {
      return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
    }
    const result = await listProjects(env, payload.data.workspaceId, payload.data.teamId);
    return json({ ok: true, projects: result.projects.map((p) => ({ id: p.id, name: p.name })) });
  }

  if (url.pathname === "/internal/linear/projects/list" && request.method === "POST") {
    const payload = ProjectsListRequestSchema.safeParse(await parseJson(request));
    if (!payload.success) {
      return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
    }
    const result = await listProjects(env, payload.data.workspaceId, payload.data.teamId);
    return json({ ok: true, action: "projects_list", result });
  }

  if (url.pathname === "/internal/linear/projects/get" && request.method === "POST") {
    const payload = ProjectsGetRequestSchema.safeParse(await parseJson(request));
    if (!payload.success) {
      return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
    }
    const result = await getProject(env, payload.data.workspaceId, payload.data.projectId);
    return json({ ok: true, action: "projects_get", result });
  }

  if (url.pathname === "/internal/linear/projects/create" && request.method === "POST") {
    const payload = ProjectsCreateRequestSchema.safeParse(await parseJson(request));
    if (!payload.success) {
      return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
    }
    const result = await createProject(env, payload.data.workspaceId, {
      name: payload.data.name,
      description: payload.data.description,
      teamId: payload.data.teamId,
    });
    return json({ ok: true, action: "projects_create", result });
  }

  if (url.pathname === "/internal/linear/projects/update" && request.method === "POST") {
    const payload = ProjectsUpdateRequestSchema.safeParse(await parseJson(request));
    if (!payload.success) {
      return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
    }
    const result = await updateProject(env, payload.data.workspaceId, {
      projectId: payload.data.projectId,
      name: payload.data.name,
      description: payload.data.description,
    });
    return json({ ok: true, action: "projects_update", result });
  }

  if (url.pathname === "/internal/linear/projects/delete" && request.method === "POST") {
    const payload = ProjectsDeleteRequestSchema.safeParse(await parseJson(request));
    if (!payload.success) {
      return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
    }
    const result = await archiveProject(env, payload.data.workspaceId, payload.data.projectId);
    return json({ ok: true, action: "projects_delete", result });
  }

  if (url.pathname === "/internal/linear/triage/list" && request.method === "POST") {
    const payload = TriageListRequestSchema.safeParse(await parseJson(request));
    if (!payload.success) {
      return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
    }
    const result = await triageList(env, payload.data.workspaceId, payload.data.teamId, {
      stateName: payload.data.stateName,
      excludeDone: payload.data.excludeDone ?? true,
      excludeCancelled: payload.data.excludeCancelled ?? true,
      limit: payload.data.limit,
    });
    return json({ ok: true, action: "triage_list", result });
  }

  if (url.pathname === "/internal/linear/initiatives/list" && request.method === "POST") {
    try {
      const payload = InitiativesListRequestSchema.safeParse(await parseJson(request));
      if (!payload.success) {
        return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
      }
      const result = await listInitiatives(env, payload.data.workspaceId, payload.data.limit ?? 25);
      return json({ ok: true, action: "initiatives_list", result });
    } catch (err) {
      console.error("initiatives_list error:", err);
      return json({ ok: false, error: "internal_error", message: String(err) }, { status: 500 });
    }
  }

  if (url.pathname === "/internal/linear/initiatives/get" && request.method === "POST") {
    try {
      const payload = InitiativesGetRequestSchema.safeParse(await parseJson(request));
      if (!payload.success) {
        return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
      }
      const result = await getInitiative(env, payload.data.workspaceId, payload.data.id);
      return json({ ok: true, action: "initiatives_get", result });
    } catch (err) {
      console.error("initiatives_get error:", err);
      return json({ ok: false, error: "internal_error", message: String(err) }, { status: 500 });
    }
  }

  if (url.pathname === "/internal/linear/initiatives/create" && request.method === "POST") {
    try {
      const payload = InitiativesCreateRequestSchema.safeParse(await parseJson(request));
      if (!payload.success) {
        return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
      }
      const result = await createInitiative(env, payload.data.workspaceId, {
        name: payload.data.name,
        description: payload.data.description ?? null,
        status: payload.data.status ?? null,
      });
      return json({ ok: true, action: "initiatives_create", result });
    } catch (err) {
      console.error("initiatives_create error:", err);
      return json({ ok: false, error: "internal_error", message: String(err) }, { status: 500 });
    }
  }

  if (url.pathname === "/internal/linear/initiatives/update" && request.method === "POST") {
    try {
      const payload = InitiativesUpdateRequestSchema.safeParse(await parseJson(request));
      if (!payload.success) {
        return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
      }
      const result = await updateInitiative(env, payload.data.workspaceId, {
        id: payload.data.id,
        name: payload.data.name,
        description: payload.data.description,
        status: payload.data.status ?? null,
      });
      return json({ ok: true, action: "initiatives_update", result });
    } catch (err) {
      console.error("initiatives_update error:", err);
      return json({ ok: false, error: "internal_error", message: String(err) }, { status: 500 });
    }
  }

  if (url.pathname === "/internal/linear/initiatives/archive" && request.method === "POST") {
    try {
      const payload = InitiativesArchiveRequestSchema.safeParse(await parseJson(request));
      if (!payload.success) {
        return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
      }
      const result = await archiveInitiative(env, payload.data.workspaceId, payload.data.id);
      return json({ ok: true, action: "initiatives_archive", result });
    } catch (err) {
      console.error("initiatives_archive error:", err);
      return json({ ok: false, error: "internal_error", message: String(err) }, { status: 500 });
    }
  }

  if (url.pathname === "/internal/linear/cycles/list" && request.method === "POST") {
    try {
      const payload = CyclesListRequestSchema.safeParse(await parseJson(request));
      if (!payload.success) {
        return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
      }
      const result = await listCycles(env, payload.data.workspaceId, payload.data.teamId, payload.data.limit ?? 25);
      return json({ ok: true, action: "cycles_list", result });
    } catch (err) {
      console.error("cycles_list error:", err);
      return json({ ok: false, error: "internal_error", message: String(err) }, { status: 500 });
    }
  }

  if (url.pathname === "/internal/linear/cycles/get" && request.method === "POST") {
    try {
      const payload = CyclesGetRequestSchema.safeParse(await parseJson(request));
      if (!payload.success) {
        return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
      }
      const result = await getCycle(env, payload.data.workspaceId, payload.data.id);
      return json({ ok: true, action: "cycles_get", result });
    } catch (err) {
      console.error("cycles_get error:", err);
      return json({ ok: false, error: "internal_error", message: String(err) }, { status: 500 });
    }
  }

  if (url.pathname === "/internal/linear/cycles/create" && request.method === "POST") {
    try {
      const payload = CyclesCreateRequestSchema.safeParse(await parseJson(request));
      if (!payload.success) {
        return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
      }
      const result = await createCycle(env, payload.data.workspaceId, {
        teamId: payload.data.teamId,
        startsAt: payload.data.startsAt,
        endsAt: payload.data.endsAt,
        name: payload.data.name ?? null,
      });
      return json({ ok: true, action: "cycles_create", result });
    } catch (err) {
      console.error("cycles_create error:", err);
      return json({ ok: false, error: "internal_error", message: String(err) }, { status: 500 });
    }
  }

  if (url.pathname === "/internal/linear/cycles/update" && request.method === "POST") {
    try {
      const payload = CyclesUpdateRequestSchema.safeParse(await parseJson(request));
      if (!payload.success) {
        return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
      }
      const result = await updateCycle(env, payload.data.workspaceId, payload.data.id, {
        startsAt: payload.data.startsAt,
        endsAt: payload.data.endsAt,
        name: payload.data.name,
      });
      return json({ ok: true, action: "cycles_update", result });
    } catch (err) {
      console.error("cycles_update error:", err);
      return json({ ok: false, error: "internal_error", message: String(err) }, { status: 500 });
    }
  }

  if (url.pathname === "/internal/linear/cycles/archive" && request.method === "POST") {
    try {
      const payload = CyclesArchiveRequestSchema.safeParse(await parseJson(request));
      if (!payload.success) {
        return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
      }
      const result = await archiveCycle(env, payload.data.workspaceId, payload.data.id);
      return json({ ok: true, action: "cycles_archive", result });
    } catch (err) {
      console.error("cycles_archive error:", err);
      return json({ ok: false, error: "internal_error", message: String(err) }, { status: 500 });
    }
  }

  if (url.pathname === "/internal/linear/labels/list" && request.method === "POST") {
    try {
      const payload = LabelsListRequestSchema.safeParse(await parseJson(request));
      if (!payload.success) {
        return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
      }
      const result = await listIssueLabels(env, payload.data.workspaceId, payload.data.limit ?? 25);
      return json({ ok: true, action: "labels_list", result });
    } catch (err) {
      console.error("labels_list error:", err);
      return json({ ok: false, error: "internal_error", message: String(err) }, { status: 500 });
    }
  }

  if (url.pathname === "/internal/linear/labels/get" && request.method === "POST") {
    try {
      const payload = LabelsGetRequestSchema.safeParse(await parseJson(request));
      if (!payload.success) {
        return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
      }
      const result = await getIssueLabel(env, payload.data.workspaceId, payload.data.id);
      return json({ ok: true, action: "labels_get", result });
    } catch (err) {
      console.error("labels_get error:", err);
      return json({ ok: false, error: "internal_error", message: String(err) }, { status: 500 });
    }
  }

  if (url.pathname === "/internal/linear/labels/create" && request.method === "POST") {
    try {
      const payload = LabelsCreateRequestSchema.safeParse(await parseJson(request));
      if (!payload.success) {
        return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
      }
      const result = await createIssueLabel(env, payload.data.workspaceId, {
        name: payload.data.name,
        color: payload.data.color ?? null,
        description: payload.data.description ?? null,
      });
      return json({ ok: true, action: "labels_create", result });
    } catch (err) {
      console.error("labels_create error:", err);
      return json({ ok: false, error: "internal_error", message: String(err) }, { status: 500 });
    }
  }

  if (url.pathname === "/internal/linear/labels/update" && request.method === "POST") {
    try {
      const payload = LabelsUpdateRequestSchema.safeParse(await parseJson(request));
      if (!payload.success) {
        return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
      }
      const result = await updateIssueLabel(env, payload.data.workspaceId, payload.data.id, {
        name: payload.data.name,
        color: payload.data.color ?? null,
        description: payload.data.description,
      });
      return json({ ok: true, action: "labels_update", result });
    } catch (err) {
      console.error("labels_update error:", err);
      return json({ ok: false, error: "internal_error", message: String(err) }, { status: 500 });
    }
  }

  if (url.pathname === "/internal/linear/labels/retire" && request.method === "POST") {
    try {
      const payload = LabelsRetireRequestSchema.safeParse(await parseJson(request));
      if (!payload.success) {
        return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
      }
      const result = await retireIssueLabel(env, payload.data.workspaceId, payload.data.id);
      return json({ ok: true, action: "labels_retire", result });
    } catch (err) {
      console.error("labels_retire error:", err);
      return json({ ok: false, error: "internal_error", message: String(err) }, { status: 500 });
    }
  }

  if (url.pathname === "/internal/linear/labels/restore" && request.method === "POST") {
    try {
      const payload = LabelsRestoreRequestSchema.safeParse(await parseJson(request));
      if (!payload.success) {
        return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
      }
      const result = await restoreIssueLabel(env, payload.data.workspaceId, payload.data.id);
      return json({ ok: true, action: "labels_restore", result });
    } catch (err) {
      console.error("labels_restore error:", err);
      return json({ ok: false, error: "internal_error", message: String(err) }, { status: 500 });
    }
  }

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

  if (!parsed.data.ok) {
    await createAgentActivity(env, run.workspaceId, {
      agentSessionId: run.agentSessionId,
      type: "error",
      content: {
        body: `OpenClaw 运行失败：${parsed.data.error ?? "unknown_error"}`,
      },
    });
    const updated = await storage.agentRuns.applyResult(runId, { status: "failed" });
    return json({ run: updated });
  }

  const intentParsed = OpenClawIntentSchema.safeParse(parsed.data.intent);
  if (!intentParsed.success) {
    const detail = JSON.stringify(intentParsed.error.flatten());
    const raw = JSON.stringify(parsed.data.intent ?? null).slice(0, 800);
    await createAgentActivity(env, run.workspaceId, {
      agentSessionId: run.agentSessionId,
      type: "error",
      content: {
        body: `OpenClaw intent schema 无法解析。details=${detail} raw=${raw}`,
      },
    });
    const updated = await storage.agentRuns.applyResult(runId, { status: "failed" });
    return json({ run: updated });
  }

  const origin = new URL(request.url).origin;
  const execResult = await executeOpenClawIntent({
    env,
    origin,
    workspaceId: run.workspaceId,
    agentSessionId: run.agentSessionId,
    traceId: run.traceId,
    intent: intentParsed.data,
  });
  const updated = await storage.agentRuns.applyResult(runId, { status: execResult.ok ? "completed" : "failed" });

  // 撤销会话令牌
  if (run.sessionToken) {
    revokeSessionToken(run.sessionToken);
  }

  return json({ run: updated });
}
