const { env, exit, stdout, stderr } = process;

export function outJson(obj) {
  stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
}

export function outPlain(lines) {
  stdout.write(`${lines.join("\n")}\n`);
}

export function fail(msg, code = 1) {
  stderr.write(`${msg}\n`);
  exit(code);
}

export function getBaseUrl() {
  return env.LEC_BASE_URL || "https://linear-expert.placeapp.workers.dev";
}

export function getSecret() {
  const secret = env.OPENCLAW_INTERNAL_SECRET;
  if (!secret) fail("OPENCLAW_INTERNAL_SECRET missing", 3);
  return secret;
}

export async function httpJson({ path, method = "POST", body, verbose }) {
  const url = new URL(path, getBaseUrl()).toString();
  if (verbose) stderr.write(`[lec] ${method} ${url}\n`);
  const res = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${getSecret()}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const error = new Error(`HTTP ${res.status} ${res.statusText}`);
    error.status = res.status;
    error.body = json;
    throw error;
  }
  return json;
}

export async function resolveTeam(teamKey, workspaceOverride, verbose) {
  const workspaceIds = workspaceOverride
    ? [workspaceOverride]
    : ["43f90090-729f-4d7f-98d9-6693104cb211", "default-workspace"];
  let lastErr = null;
  for (const workspaceId of workspaceIds) {
    try {
      const res = await httpJson({
        path: "/internal/linear/resolve",
        body: { teamKey, workspaceId },
        verbose,
      });
      if (res?.ok) return { workspaceId: res.workspaceId, teamId: res.teamId };
    } catch (error) {
      lastErr = error;
    }
  }
  throw lastErr || new Error(`Failed to resolve team ${teamKey}`);
}

export async function resolveIssueId({ issue, workspaceId, verbose }) {
  if (issue && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(issue)) return issue;
  if (issue && /^[A-Z]+-\d+$/i.test(issue)) {
    const result = await httpJson({
      path: "/internal/linear/issues/get",
      body: { workspaceId, identifier: issue },
      verbose,
    });
    const id = result?.result?.issue?.id;
    if (!id) throw new Error(`Issue not found for identifier ${issue}`);
    return id;
  }
  return issue;
}

export async function requireWorkspace(flags) {
  const teamKey = flags.team || "PCF";
  return resolveTeam(teamKey, flags.workspace, flags.verbose);
}

export function printResult(flags, result, plainLines) {
  if (flags.json) outJson(result);
  else outPlain(plainLines ?? [JSON.stringify(result)]);
}
