import type { Env } from "../env";
import { withWorkspaceAccessToken } from "./client";
import { sdkRequest } from "./sdk";

export type LabelSummary = {
  id: string;
  name: string;
  color?: string | null;
  description?: string | null;
  isGroup?: boolean | null;
};

export async function listIssueLabels(env: Env, workspaceId: string, first: number = 25) {
  const limit = Math.min(Math.max(first, 1), 100);
  return withWorkspaceAccessToken<{ success: boolean; labels: LabelSummary[] }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);

    const data: any = await sdkRequest<any>(
      client,
      `query($first: Int!) {
        issueLabels(first: $first) {
          nodes {
            id
            name
            color
            description
            isGroup
          }
        }
      }`,
      { first: limit },
    );

    const nodes: any[] = data?.issueLabels?.nodes ?? [];
    return {
      success: true,
      labels: nodes.map((l: any) => ({
        id: l.id,
        name: l.name,
        color: l.color ?? null,
        description: l.description ?? null,
        isGroup: l.isGroup ?? null,
      })),
    };
  });
}
