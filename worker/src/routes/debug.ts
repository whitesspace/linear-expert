import { z } from 'zod';
import { assertInternalSecret } from '../auth/internal';
import { json } from '../lib/http';
import { postComment } from '../linear/client';
import type { Env } from '../types';

const DebugCommentSchema = z.object({
  workspaceId: z.string().min(1),
  issueId: z.string().min(1),
  body: z.string().min(1)
});

export async function handleDebugComment(request: Request, env: Env): Promise<Response> {
  const authError = assertInternalSecret(request, env);
  if (authError) return authError;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'invalid JSON' }, { status: 400 });
  }

  const parsed = DebugCommentSchema.safeParse(payload);
  if (!parsed.success) {
    return json({ error: 'invalid payload', details: parsed.error.flatten() }, { status: 400 });
  }

  const { workspaceId, issueId, body } = parsed.data;
  const result = await postComment(env, workspaceId, issueId, body);
  return json({ ok: true, result });
}
