import { z } from "zod";

export const WorkspaceScopedSchema = z.object({
  workspaceId: z.string().min(1),
});

export const IssueCreateInputSchema = z.object({
  teamId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  projectId: z.string().optional(),
  parentId: z.string().min(1).optional(),
});

export type CreateIssueInput = z.infer<typeof IssueCreateInputSchema>;

export const IssueUpdateFieldsSchema = z.object({
  issueId: z.string().min(1),
  title: z.string().optional(),
  description: z.string().optional(),
  projectId: z.string().optional(),
});

export const IssueUpdateInputSchema = IssueUpdateFieldsSchema.refine((value) => value.title !== undefined || value.description !== undefined || value.projectId !== undefined, {
  message: "update_issue requires at least one field to update",
});

export type UpdateIssueInput = z.infer<typeof IssueUpdateInputSchema>;

export const AssignIssueInputSchema = z.object({
  issueId: z.string().min(1),
  assigneeId: z.string().min(1),
});

export type AssignIssueInput = z.infer<typeof AssignIssueInputSchema>;

export const TransitionIssueInputSchema = z.object({
  issueId: z.string().min(1),
  stateId: z.string().min(1),
});

export type TransitionIssueInput = z.infer<typeof TransitionIssueInputSchema>;
