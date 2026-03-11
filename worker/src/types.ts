export type TaskStatus = 'pending' | 'processing' | 'completed' | 'ignored' | 'failed';

export interface LinearTask {
  id: string;
  source: 'linear';
  eventType: string;
  workspaceId?: string;
  organizationId?: string;
  issueId?: string;
  issueIdentifier?: string;
  commentId?: string;
  actorId?: string;
  actorName?: string;
  payload: unknown;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  lockExpiresAt?: string;
}

export interface TaskResultPayload {
  action: 'reply' | 'create_issue' | 'update_issue' | 'assign_issue' | 'transition_issue' | 'noop' | 'error';
  replyBody?: string;
  reason?: string;
}

export interface Env {
  DB?: D1Database;
  LINEAR_WEBHOOK_SECRET?: string;
  LINEAR_CLIENT_ID?: string;
  LINEAR_CLIENT_SECRET?: string;
  LINEAR_REDIRECT_URI?: string;
  OPENCLAW_INTERNAL_SECRET?: string;
  /** Dev-only secret for /internal/invoke replay endpoints. Prefer setting this explicitly in local/dev. */
  DEV_REPLAY_SECRET?: string;
  LINEAR_APP_ACTOR_MODE?: string;
}
