import { z } from "zod";

export const LinearWebhookEnvelopeSchema = z.object({
  id: z.string(),
  action: z.string(),
  type: z.string(),
  data: z.record(z.any()),
  createdAt: z.string().optional(),
  organizationId: z.string().nullable().optional(),
  teamId: z.string().nullable().optional(),
  userId: z.string().nullable().optional(),
});

export type LinearWebhookEnvelope = z.infer<typeof LinearWebhookEnvelopeSchema>;

export type LinearEventKind =
  | "issue.created"
  | "comment.created"
  | "issue.assigned"
  | "issue.statusChanged";

export interface LinearParsedEvent {
  eventType: LinearEventKind;
  webhookId: string;
  workspaceId: string;
  organizationId: string | null;
  issueId: string;
  issueIdentifier: string | null;
  commentId: string | null;
  actorId: string | null;
  actorName: string | null;
}
