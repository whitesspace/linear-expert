export type TaskStatus =
  | "pending"
  | "processing"
  | "completed"
  | "ignored"
  | "failed";

export type TaskResultAction = "reply" | "noop" | "error";

export interface NewTaskRecord {
  source: "linear";
  eventType: string;
  webhookId: string;
  workspaceId: string;
  organizationId: string | null;
  issueId: string;
  issueIdentifier: string | null;
  commentId: string | null;
  actorId: string | null;
  actorName: string | null;
  payloadJson: string;
}

export interface TaskRecord extends NewTaskRecord {
  id: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  lockExpiresAt: string | null;
  resultAction?: TaskResultAction;
  resultReason?: string | null;
  replyBody?: string | null;
}

export interface TaskResultPatch {
  status: Exclude<TaskStatus, "pending">;
  resultAction: TaskResultAction;
  resultReason?: string | null;
  replyBody?: string | null;
}

export interface TaskFilter {
  status: TaskStatus;
  limit?: number;
}

export interface ReplyRecord {
  id: string;
  taskId: string;
  issueId: string;
  commentId: string | null;
  body: string;
  status: "sent" | "failed";
  sentAt: string | null;
  error: string | null;
}

export interface ReplyDraft {
  taskId: string;
  issueId: string;
  body: string;
}

export interface OAuthTokenRecord {
  workspaceId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scopes: string[];
  actorMode: "app";
}
