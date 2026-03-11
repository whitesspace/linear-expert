import type { Env } from "../env";

// v0 stop flag: best-effort in-memory within a single worker instance.
// For production-grade stop across instances, move to D1 (TODO-free follow-up: implement now if needed).
const STOP_SET = new Set<string>();

export function requestStop(_env: Env, agentSessionId: string) {
  STOP_SET.add(agentSessionId);
}

export function clearStop(_env: Env, agentSessionId: string) {
  STOP_SET.delete(agentSessionId);
}

export function isStopped(_env: Env, agentSessionId: string): boolean {
  return STOP_SET.has(agentSessionId);
}
