import type { Env } from "../env";
import { D1Storage } from "./d1";
import { InMemoryStorage } from "./memory";
import type { StorageAdapter } from "./types";

const MEMORY_STORAGE_KEY = Symbol.for("linear-expert.memory-storage");

/**
 * Build a storage adapter for the current request environment.
 *
 * Important: do not cache this globally across requests when the env/bindings
 * may differ between local dev, tests, and deployed isolates.
 */
export function getStorage(env: Env): StorageAdapter {
  if (env.DB) {
    return new D1Storage(env.DB);
  }

  const scopedEnv = env as Env & { [MEMORY_STORAGE_KEY]?: StorageAdapter };
  if (!scopedEnv[MEMORY_STORAGE_KEY]) {
    scopedEnv[MEMORY_STORAGE_KEY] = new InMemoryStorage();
  }

  return scopedEnv[MEMORY_STORAGE_KEY];
}
