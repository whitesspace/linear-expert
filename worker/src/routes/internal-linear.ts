import { z } from "zod";
import type { Env } from "../env";
import { json } from "../lib/http";
import {
  AssignIssueInputSchema,
  IssueCreateInputSchema,
  IssueUpdateFieldsSchema,
  TransitionIssueInputSchema,
  WorkspaceScopedSchema,
} from "../linear/contracts";
import {
  addAttachment,
  addIssueToProject,
  archiveIssue,
  assignIssue,
  createIssue,
  createIssueRelation,
  deleteAttachment,
  deleteComment,
  deleteIssue,
  getInstallationIdentity,
  getIssueByIdentifier,
  listIssueChildren,
  listIssuesByNumbers,
  listTeamStates,
  postComment,
  resolveComment,
  transitionIssueState,
  triageMoveIssue,
  unresolveComment,
  updateComment,
  updateIssue,
  withWorkspaceAccessToken,
} from "../linear/client";
import { deleteCustomer, deleteCustomerNeed, getCustomer, getCustomerNeed, listCustomerNeeds, listCustomers, createCustomer, createCustomerNeed, unarchiveCustomerNeed, updateCustomer, updateCustomerNeed } from "../linear/customers";
import { createDocument, deleteDocument, getDocument, listDocuments, unarchiveDocument, updateDocument } from "../linear/documents";
import { archiveInitiative, createInitiative, getInitiative, listInitiatives, updateInitiative } from "../linear/initiatives";
import { createIssueLabel, getIssueLabel, listIssueLabels, restoreIssueLabel, retireIssueLabel, updateIssueLabel } from "../linear/labels";
import { createProjectUpdate, deleteProjectUpdate, getProjectUpdate, listProjectUpdates, unarchiveProjectUpdate, updateProjectUpdate } from "../linear/project-updates";
import { archiveProject, createProject, getProject, listProjects, updateProject } from "../linear/projects";
import { triageList } from "../linear/triage";
import { archiveCycle, createCycle, getCycle, listCycles, updateCycle } from "../linear/cycles";
import { archiveWorkflowState, createWorkflowState, getWorkflowState, listWorkflowStates, updateWorkflowState } from "../linear/workflow-states";

const CommentCreateRequestSchema = z.object({
  workspaceId: z.string().min(1),
  issueId: z.string().min(1),
  body: z.string().min(1),
});

const CommentUpdateRequestSchema = z.object({
  workspaceId: z.string().min(1),
  id: z.string().min(1),
  body: z.string().min(1),
});

const CommentIdRequestSchema = z.object({
  workspaceId: z.string().min(1),
  id: z.string().min(1),
});

const CreateIssueRequestSchema = WorkspaceScopedSchema.merge(IssueCreateInputSchema);
const UpdateIssueRequestSchema = WorkspaceScopedSchema.extend(IssueUpdateFieldsSchema.shape).refine(
  (value) => value.title !== undefined || value.description !== undefined || value.projectId !== undefined,
  { message: "update_issue requires at least one field to update" },
);
const AssignIssueRequestSchema = WorkspaceScopedSchema.merge(AssignIssueInputSchema);
const TransitionIssueRequestSchema = WorkspaceScopedSchema.merge(TransitionIssueInputSchema);
const IssueIdRequestSchema = z.object({
  workspaceId: z.string().min(1),
  id: z.string().min(1),
});
const TriageMoveRequestSchema = z.object({
  workspaceId: z.string().min(1),
  issueId: z.string().min(1),
  assigneeId: z.string().optional(),
  stateId: z.string().optional(),
  projectId: z.string().optional(),
}).refine((value) => value.assigneeId !== undefined || value.stateId !== undefined || value.projectId !== undefined, {
  message: "triage_move requires at least one field",
});

const AddToProjectRequestSchema = WorkspaceScopedSchema.extend({
  issueId: z.string().min(1),
  projectId: z.string().min(1),
});

const ResolveRequestSchema = z.object({
  teamKey: z.string().min(1),
  workspaceId: z.string().min(1).optional(),
});

const GetIssueRequestSchema = z.object({
  workspaceId: z.string().min(1),
  identifier: z.string().min(1),
});

const IssueChildrenRequestSchema = z.object({
  workspaceId: z.string().min(1),
  issueId: z.string().min(1),
  first: z.number().int().positive().max(100).optional(),
});

const AddAttachmentRequestSchema = z.object({
  workspaceId: z.string().min(1),
  issueId: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url(),
});

const AttachmentDeleteRequestSchema = z.object({
  workspaceId: z.string().min(1),
  id: z.string().min(1),
});

const IssueRelationRequestSchema = z.object({
  workspaceId: z.string().min(1),
  issueId: z.string().min(1),
  relatedIssueId: z.string().min(1),
  relationType: z.enum(["blocks", "duplicates", "relates_to"]),
});

const ListIssuesByNumbersRequestSchema = z.object({
  workspaceId: z.string().min(1),
  teamId: z.string().min(1),
  numbers: z.array(z.number().int().positive()).min(1),
});

const TeamIdRequestSchema = z.object({
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

const TriageListRequestSchema = z.object({
  workspaceId: z.string().min(1),
  teamId: z.string().min(1),
  stateName: z.string().min(1).optional(),
  excludeDone: z.boolean().optional(),
  excludeCancelled: z.boolean().optional(),
  limit: z.number().int().positive().max(100).optional(),
});

const ListLimitRequestSchema = z.object({
  workspaceId: z.string().min(1),
  limit: z.number().int().positive().max(100).optional(),
});

const IdRequestSchema = z.object({
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

const CyclesListRequestSchema = z.object({
  workspaceId: z.string().min(1),
  teamId: z.string().min(1),
  limit: z.number().int().min(1).max(100).optional(),
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

const DocumentsListRequestSchema = z.object({
  workspaceId: z.string().min(1),
  limit: z.number().int().positive().max(100).optional(),
  issueId: z.string().optional(),
  projectId: z.string().optional(),
  initiativeId: z.string().optional(),
});

const DocumentsCreateRequestSchema = z.object({
  workspaceId: z.string().min(1),
  title: z.string().min(1),
  content: z.string().optional().nullable(),
  issueId: z.string().optional(),
  projectId: z.string().optional(),
  initiativeId: z.string().optional(),
  icon: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
});

const DocumentsUpdateRequestSchema = z.object({
  workspaceId: z.string().min(1),
  id: z.string().min(1),
  title: z.string().optional(),
  content: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
}).refine((value) => value.title !== undefined || value.content !== undefined || value.icon !== undefined || value.color !== undefined, {
  message: "documents_update requires at least one field",
});

const CustomersCreateRequestSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1),
  domains: z.array(z.string().min(1)).optional().nullable(),
  revenue: z.number().optional().nullable(),
  size: z.number().optional().nullable(),
});

const CustomersUpdateRequestSchema = z.object({
  workspaceId: z.string().min(1),
  id: z.string().min(1),
  name: z.string().optional(),
  domains: z.array(z.string().min(1)).optional().nullable(),
  revenue: z.number().optional().nullable(),
  size: z.number().optional().nullable(),
}).refine((value) => value.name !== undefined || value.domains !== undefined || value.revenue !== undefined || value.size !== undefined, {
  message: "customers_update requires at least one field",
});

const CustomerNeedsCreateRequestSchema = z.object({
  workspaceId: z.string().min(1),
  body: z.string().min(1),
  customerId: z.string().optional(),
  issueId: z.string().optional(),
  projectId: z.string().optional(),
  priority: z.number().int().optional().nullable(),
});

const CustomerNeedsUpdateRequestSchema = z.object({
  workspaceId: z.string().min(1),
  id: z.string().min(1),
  body: z.string().optional(),
  customerId: z.string().optional().nullable(),
  issueId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  priority: z.number().int().optional().nullable(),
}).refine((value) => value.body !== undefined || value.customerId !== undefined || value.issueId !== undefined || value.projectId !== undefined || value.priority !== undefined, {
  message: "customer_needs_update requires at least one field",
});

const ProjectUpdatesCreateRequestSchema = z.object({
  workspaceId: z.string().min(1),
  projectId: z.string().min(1),
  body: z.string().min(1),
  health: z.string().optional().nullable(),
});

const ProjectUpdatesUpdateRequestSchema = z.object({
  workspaceId: z.string().min(1),
  id: z.string().min(1),
  body: z.string().optional(),
  health: z.string().optional().nullable(),
}).refine((value) => value.body !== undefined || value.health !== undefined, {
  message: "project_updates_update requires at least one field",
});

const WorkflowStatesListRequestSchema = z.object({
  workspaceId: z.string().min(1),
  teamId: z.string().min(1),
  limit: z.number().int().positive().max(100).optional(),
});

const WorkflowStatesCreateRequestSchema = z.object({
  workspaceId: z.string().min(1),
  teamId: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  position: z.number().int().optional().nullable(),
});

const WorkflowStatesUpdateRequestSchema = z.object({
  workspaceId: z.string().min(1),
  id: z.string().min(1),
  name: z.string().optional(),
  type: z.string().optional().nullable(),
  position: z.number().int().optional().nullable(),
}).refine((value) => value.name !== undefined || value.type !== undefined || value.position !== undefined, {
  message: "workflow_states_update requires at least one field",
});

type RouteHandler = (request: Request, env: Env) => Promise<Response>;

async function parseJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch (error) {
    console.warn("invalid JSON body", error);
    throw new Error("invalid JSON");
  }
}

function invalidPayload(error: z.ZodError) {
  return json({ error: "invalid payload", details: error.flatten() }, { status: 400 });
}

function withSchema<T>(
  schema: z.ZodType<T>,
  action: string,
  run: (env: Env, payload: T) => Promise<unknown>,
): RouteHandler {
  return async (request: Request, env: Env) => {
    try {
      const payload = schema.safeParse(await parseJson(request));
      if (!payload.success) return invalidPayload(payload.error);
      const result = await run(env, payload.data);
      return json({ ok: true, action, result });
    } catch (error) {
      console.error(`${action} error:`, error);
      return json({ ok: false, error: "internal_error", message: String(error) }, { status: 500 });
    }
  };
}

const ROUTES: Record<string, RouteHandler> = {
  "POST /internal/linear/comment": withSchema(CommentCreateRequestSchema, "comment_create", (env, payload) =>
    postComment(env, payload.workspaceId, payload.issueId, payload.body)),
  "POST /internal/linear/comments/update": withSchema(CommentUpdateRequestSchema, "comments_update", (env, payload) =>
    updateComment(env, payload.workspaceId, payload.id, payload.body)),
  "POST /internal/linear/comments/delete": withSchema(CommentIdRequestSchema, "comments_delete", (env, payload) =>
    deleteComment(env, payload.workspaceId, payload.id)),
  "POST /internal/linear/comments/resolve": withSchema(CommentIdRequestSchema, "comments_resolve", (env, payload) =>
    resolveComment(env, payload.workspaceId, payload.id)),
  "POST /internal/linear/comments/unresolve": withSchema(CommentIdRequestSchema, "comments_unresolve", (env, payload) =>
    unresolveComment(env, payload.workspaceId, payload.id)),
  "POST /internal/linear/issues/create": withSchema(CreateIssueRequestSchema, "create_issue", async (env, payload) => {
    const { workspaceId, ...issueInput } = payload;
    return createIssue(env, workspaceId, issueInput);
  }),
  "POST /internal/linear/issues/update": withSchema(UpdateIssueRequestSchema, "update_issue", (env, payload) =>
    updateIssue(env, payload.workspaceId, payload)),
  "POST /internal/linear/issues/assign": withSchema(AssignIssueRequestSchema, "assign_issue", (env, payload) =>
    assignIssue(env, payload.workspaceId, payload)),
  "POST /internal/linear/issues/state": withSchema(TransitionIssueRequestSchema, "transition_issue", (env, payload) =>
    transitionIssueState(env, payload.workspaceId, payload)),
  "POST /internal/linear/issues/project": withSchema(AddToProjectRequestSchema, "add_to_project", (env, payload) =>
    addIssueToProject(env, payload.workspaceId, payload)),
  "POST /internal/linear/issues/archive": withSchema(IssueIdRequestSchema, "issues_archive", (env, payload) =>
    archiveIssue(env, payload.workspaceId, payload.id)),
  "POST /internal/linear/issues/delete": withSchema(IssueIdRequestSchema, "issues_delete", (env, payload) =>
    deleteIssue(env, payload.workspaceId, payload.id)),
  "POST /internal/linear/issues/get": withSchema(GetIssueRequestSchema, "get_issue", (env, payload) =>
    getIssueByIdentifier(env, payload.workspaceId, payload.identifier)),
  "POST /internal/linear/issues/children": withSchema(IssueChildrenRequestSchema, "issue_children", (env, payload) =>
    listIssueChildren(env, payload.workspaceId, payload.issueId, payload.first ?? 50)),
  "POST /internal/linear/issues/attachment": withSchema(AddAttachmentRequestSchema, "add_attachment", (env, payload) =>
    addAttachment(env, payload.workspaceId, payload)),
  "POST /internal/linear/attachments/delete": withSchema(AttachmentDeleteRequestSchema, "attachments_delete", (env, payload) =>
    deleteAttachment(env, payload.workspaceId, payload.id)),
  "POST /internal/linear/issues/relation": withSchema(IssueRelationRequestSchema, "create_relation", (env, payload) =>
    createIssueRelation(env, payload.workspaceId, payload)),
  "POST /internal/linear/issues/list": withSchema(ListIssuesByNumbersRequestSchema, "list_issues_by_numbers", (env, payload) =>
    listIssuesByNumbers(env, payload.workspaceId, payload.teamId, payload.numbers)),
  "POST /internal/linear/team/states": withSchema(TeamIdRequestSchema, "list_team_states", (env, payload) =>
    listTeamStates(env, payload.workspaceId, payload.teamId)),
  "POST /internal/linear/projects/list": withSchema(TeamIdRequestSchema, "projects_list", (env, payload) =>
    listProjects(env, payload.workspaceId, payload.teamId)),
  "POST /internal/linear/team/projects": async (request: Request, env: Env) => {
    const payload = TeamIdRequestSchema.safeParse(await parseJson(request));
    if (!payload.success) return invalidPayload(payload.error);
    const result = await listProjects(env, payload.data.workspaceId, payload.data.teamId);
    return json({ ok: true, projects: result.projects.map((project) => ({ id: project.id, name: project.name })) });
  },
  "POST /internal/linear/projects/get": withSchema(ProjectsGetRequestSchema, "projects_get", (env, payload) =>
    getProject(env, payload.workspaceId, payload.projectId)),
  "POST /internal/linear/projects/create": withSchema(ProjectsCreateRequestSchema, "projects_create", (env, payload) =>
    createProject(env, payload.workspaceId, payload)),
  "POST /internal/linear/projects/update": withSchema(ProjectsUpdateRequestSchema, "projects_update", (env, payload) =>
    updateProject(env, payload.workspaceId, payload)),
  "POST /internal/linear/projects/delete": withSchema(ProjectsGetRequestSchema, "projects_delete", (env, payload) =>
    archiveProject(env, payload.workspaceId, payload.projectId)),
  "POST /internal/linear/triage/list": withSchema(TriageListRequestSchema, "triage_list", (env, payload) =>
    triageList(env, payload.workspaceId, payload.teamId, {
      stateName: payload.stateName,
      excludeDone: payload.excludeDone ?? true,
      excludeCancelled: payload.excludeCancelled ?? true,
      limit: payload.limit,
    })),
  "POST /internal/linear/triage/move": withSchema(TriageMoveRequestSchema, "triage_move", (env, payload) =>
    triageMoveIssue(env, payload.workspaceId, payload)),
  "POST /internal/linear/initiatives/list": withSchema(ListLimitRequestSchema, "initiatives_list", (env, payload) =>
    listInitiatives(env, payload.workspaceId, payload.limit ?? 25)),
  "POST /internal/linear/initiatives/get": withSchema(IdRequestSchema, "initiatives_get", (env, payload) =>
    getInitiative(env, payload.workspaceId, payload.id)),
  "POST /internal/linear/initiatives/create": withSchema(InitiativesCreateRequestSchema, "initiatives_create", (env, payload) =>
    createInitiative(env, payload.workspaceId, payload)),
  "POST /internal/linear/initiatives/update": withSchema(InitiativesUpdateRequestSchema, "initiatives_update", (env, payload) =>
    updateInitiative(env, payload.workspaceId, payload)),
  "POST /internal/linear/initiatives/archive": withSchema(IdRequestSchema, "initiatives_archive", (env, payload) =>
    archiveInitiative(env, payload.workspaceId, payload.id)),
  "POST /internal/linear/cycles/list": withSchema(CyclesListRequestSchema, "cycles_list", (env, payload) =>
    listCycles(env, payload.workspaceId, payload.teamId, payload.limit ?? 25)),
  "POST /internal/linear/cycles/get": withSchema(IdRequestSchema, "cycles_get", (env, payload) =>
    getCycle(env, payload.workspaceId, payload.id)),
  "POST /internal/linear/cycles/create": withSchema(CyclesCreateRequestSchema, "cycles_create", (env, payload) =>
    createCycle(env, payload.workspaceId, payload)),
  "POST /internal/linear/cycles/update": withSchema(CyclesUpdateRequestSchema, "cycles_update", (env, payload) =>
    updateCycle(env, payload.workspaceId, payload.id, payload)),
  "POST /internal/linear/cycles/archive": withSchema(IdRequestSchema, "cycles_archive", (env, payload) =>
    archiveCycle(env, payload.workspaceId, payload.id)),
  "POST /internal/linear/labels/list": withSchema(ListLimitRequestSchema, "labels_list", (env, payload) =>
    listIssueLabels(env, payload.workspaceId, payload.limit ?? 25)),
  "POST /internal/linear/labels/get": withSchema(IdRequestSchema, "labels_get", (env, payload) =>
    getIssueLabel(env, payload.workspaceId, payload.id)),
  "POST /internal/linear/labels/create": withSchema(LabelsCreateRequestSchema, "labels_create", (env, payload) =>
    createIssueLabel(env, payload.workspaceId, payload)),
  "POST /internal/linear/labels/update": withSchema(LabelsUpdateRequestSchema, "labels_update", (env, payload) =>
    updateIssueLabel(env, payload.workspaceId, payload.id, payload)),
  "POST /internal/linear/labels/retire": withSchema(IdRequestSchema, "labels_retire", (env, payload) =>
    retireIssueLabel(env, payload.workspaceId, payload.id)),
  "POST /internal/linear/labels/restore": withSchema(IdRequestSchema, "labels_restore", (env, payload) =>
    restoreIssueLabel(env, payload.workspaceId, payload.id)),
  "POST /internal/linear/documents/list": withSchema(DocumentsListRequestSchema, "documents_list", (env, payload) =>
    listDocuments(env, payload.workspaceId, payload)),
  "POST /internal/linear/documents/get": withSchema(IdRequestSchema, "documents_get", (env, payload) =>
    getDocument(env, payload.workspaceId, payload.id)),
  "POST /internal/linear/documents/create": withSchema(DocumentsCreateRequestSchema, "documents_create", (env, payload) =>
    createDocument(env, payload.workspaceId, payload)),
  "POST /internal/linear/documents/update": withSchema(DocumentsUpdateRequestSchema, "documents_update", (env, payload) =>
    updateDocument(env, payload.workspaceId, payload.id, payload)),
  "POST /internal/linear/documents/delete": withSchema(IdRequestSchema, "documents_delete", (env, payload) =>
    deleteDocument(env, payload.workspaceId, payload.id)),
  "POST /internal/linear/documents/unarchive": withSchema(IdRequestSchema, "documents_unarchive", (env, payload) =>
    unarchiveDocument(env, payload.workspaceId, payload.id)),
  "POST /internal/linear/customers/list": withSchema(ListLimitRequestSchema, "customers_list", (env, payload) =>
    listCustomers(env, payload.workspaceId, payload.limit ?? 25)),
  "POST /internal/linear/customers/get": withSchema(IdRequestSchema, "customers_get", (env, payload) =>
    getCustomer(env, payload.workspaceId, payload.id)),
  "POST /internal/linear/customers/create": withSchema(CustomersCreateRequestSchema, "customers_create", (env, payload) =>
    createCustomer(env, payload.workspaceId, payload)),
  "POST /internal/linear/customers/update": withSchema(CustomersUpdateRequestSchema, "customers_update", (env, payload) =>
    updateCustomer(env, payload.workspaceId, payload.id, payload)),
  "POST /internal/linear/customers/delete": withSchema(IdRequestSchema, "customers_delete", (env, payload) =>
    deleteCustomer(env, payload.workspaceId, payload.id)),
  "POST /internal/linear/customer-needs/list": withSchema(ListLimitRequestSchema, "customer_needs_list", (env, payload) =>
    listCustomerNeeds(env, payload.workspaceId, payload.limit ?? 25)),
  "POST /internal/linear/customer-needs/get": withSchema(IdRequestSchema, "customer_needs_get", (env, payload) =>
    getCustomerNeed(env, payload.workspaceId, payload.id)),
  "POST /internal/linear/customer-needs/create": withSchema(CustomerNeedsCreateRequestSchema, "customer_needs_create", (env, payload) =>
    createCustomerNeed(env, payload.workspaceId, payload)),
  "POST /internal/linear/customer-needs/update": withSchema(CustomerNeedsUpdateRequestSchema, "customer_needs_update", (env, payload) =>
    updateCustomerNeed(env, payload.workspaceId, payload.id, payload)),
  "POST /internal/linear/customer-needs/delete": withSchema(IdRequestSchema, "customer_needs_delete", (env, payload) =>
    deleteCustomerNeed(env, payload.workspaceId, payload.id)),
  "POST /internal/linear/customer-needs/unarchive": withSchema(IdRequestSchema, "customer_needs_unarchive", (env, payload) =>
    unarchiveCustomerNeed(env, payload.workspaceId, payload.id)),
  "POST /internal/linear/project-updates/list": withSchema(ListLimitRequestSchema, "project_updates_list", (env, payload) =>
    listProjectUpdates(env, payload.workspaceId, payload.limit ?? 25)),
  "POST /internal/linear/project-updates/get": withSchema(IdRequestSchema, "project_updates_get", (env, payload) =>
    getProjectUpdate(env, payload.workspaceId, payload.id)),
  "POST /internal/linear/project-updates/create": withSchema(ProjectUpdatesCreateRequestSchema, "project_updates_create", (env, payload) =>
    createProjectUpdate(env, payload.workspaceId, payload)),
  "POST /internal/linear/project-updates/update": withSchema(ProjectUpdatesUpdateRequestSchema, "project_updates_update", (env, payload) =>
    updateProjectUpdate(env, payload.workspaceId, payload.id, payload)),
  "POST /internal/linear/project-updates/delete": withSchema(IdRequestSchema, "project_updates_delete", (env, payload) =>
    deleteProjectUpdate(env, payload.workspaceId, payload.id)),
  "POST /internal/linear/project-updates/unarchive": withSchema(IdRequestSchema, "project_updates_unarchive", (env, payload) =>
    unarchiveProjectUpdate(env, payload.workspaceId, payload.id)),
  "POST /internal/linear/workflow-states/list": withSchema(WorkflowStatesListRequestSchema, "workflow_states_list", (env, payload) =>
    listWorkflowStates(env, payload.workspaceId, payload.teamId, payload.limit ?? 25)),
  "POST /internal/linear/workflow-states/get": withSchema(IdRequestSchema, "workflow_states_get", (env, payload) =>
    getWorkflowState(env, payload.workspaceId, payload.id)),
  "POST /internal/linear/workflow-states/create": withSchema(WorkflowStatesCreateRequestSchema, "workflow_states_create", (env, payload) =>
    createWorkflowState(env, payload.workspaceId, payload)),
  "POST /internal/linear/workflow-states/update": withSchema(WorkflowStatesUpdateRequestSchema, "workflow_states_update", (env, payload) =>
    updateWorkflowState(env, payload.workspaceId, payload.id, payload)),
  "POST /internal/linear/workflow-states/archive": withSchema(IdRequestSchema, "workflow_states_archive", (env, payload) =>
    archiveWorkflowState(env, payload.workspaceId, payload.id)),
};

async function handleResolve(request: Request, env: Env): Promise<Response> {
  try {
    const payload = ResolveRequestSchema.safeParse(await parseJson(request));
    if (!payload.success) return invalidPayload(payload.error);

    const workspaceId = payload.data.workspaceId;
    if (!workspaceId) {
      return json({
        ok: false,
        error: "invalid_request",
        message: "workspaceId is required (use Linear webhook organizationId).",
      }, { status: 400 });
    }

    const identity = await withWorkspaceAccessToken(env, workspaceId, async (accessToken) => {
      return getInstallationIdentity(accessToken);
    });

    const { createLinearSdkClient, sdkRequest } = await import("../linear/sdk");
    const accessToken = await withWorkspaceAccessToken(env, workspaceId, async (token) => token);
    const client = createLinearSdkClient(accessToken);
    const teamsData = await sdkRequest<{ teams?: { nodes?: Array<{ id: string; key: string }> } }>(
      client,
      `query($teamKey: String!) {
        teams(filter: { key: { eq: $teamKey } }) { nodes { id key } }
      }`,
      { teamKey: payload.data.teamKey },
    );

    const teamId = teamsData?.teams?.nodes?.[0]?.id;
    if (!teamId) {
      return json({ ok: false, error: "team_not_found", teamKey: payload.data.teamKey }, { status: 404 });
    }

    return json({ ok: true, workspaceId, teamId, identity });
  } catch (error) {
    console.error("handleResolve error:", error);
    return json({ ok: false, error: "internal_error", message: String(error) }, { status: 500 });
  }
}

ROUTES["POST /internal/linear/resolve"] = handleResolve;

export async function handleInternalLinearRequest(request: Request, env: Env): Promise<Response | null> {
  const key = `${request.method} ${new URL(request.url).pathname}`;
  return ROUTES[key] ? ROUTES[key](request, env) : null;
}
