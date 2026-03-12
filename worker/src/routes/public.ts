import type { Env } from "../env";
import type { StorageAdapter } from "../storage/types";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildStatusCopy(status: string): string {
  if (status === "active") return "处理中";
  if (status === "completed") return "已完成";
  if (status === "failed") return "处理失败";
  if (status === "cancelled") return "已取消";
  return "处理中";
}

export async function handlePublicRequest(
  request: Request,
  _env: Env,
  storage: StorageAdapter,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (request.method !== "GET") return null;
  if (!url.pathname.startsWith("/agent-sessions/")) return null;

  const agentSessionId = decodeURIComponent(url.pathname.slice("/agent-sessions/".length)).trim();
  if (!agentSessionId) {
    return new Response("Not found", { status: 404 });
  }

  const session = await storage.sessions.findByAgentSessionId(agentSessionId);
  if (!session) {
    return new Response("Not found", { status: 404 });
  }

  const issueLabel = [session.issueIdentifier, session.issueTitle].filter(Boolean).join(" · ") || "未关联 issue";
  const statusCopy = buildStatusCopy(session.status);
  const refreshMeta = session.status === "active" ? '<meta http-equiv="refresh" content="10">' : "";

  const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    ${refreshMeta}
    <title>Agent Session Status</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 24px; color: #111827; background: #f3f4f6; }
      main { max-width: 680px; margin: 0 auto; background: white; border-radius: 16px; padding: 24px; box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08); }
      .badge { display: inline-block; padding: 6px 10px; border-radius: 999px; background: #dbeafe; color: #1d4ed8; font-size: 14px; }
      dl { display: grid; grid-template-columns: 120px 1fr; gap: 12px 16px; margin-top: 24px; }
      dt { color: #6b7280; }
      dd { margin: 0; }
      a { color: #2563eb; text-decoration: none; }
    </style>
  </head>
  <body>
    <main>
      <div class="badge">${escapeHtml(statusCopy)}</div>
      <h1>${escapeHtml(issueLabel)}</h1>
      <p>Session ID: ${escapeHtml(session.id)}</p>
      <dl>
        <dt>状态</dt><dd>${escapeHtml(session.status)}</dd>
        <dt>活动数</dt><dd>${String(session.activityCount)}</dd>
        <dt>最后活动</dt><dd>${escapeHtml(session.lastActivityAt)}</dd>
        <dt>摘要</dt><dd>${escapeHtml(session.contextSummary ?? "OpenClaw 正在拉取上下文并分析下一步。")}</dd>
      </dl>
      ${session.issueUrl ? `<p><a href="${escapeHtml(session.issueUrl)}" target="_blank" rel="noreferrer">打开 Linear Issue</a></p>` : ""}
    </main>
  </body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
