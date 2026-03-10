import type { Env } from "../env";
import { withWorkspaceAccessToken } from "./client";
import { sdkRequest } from "./sdk";

export type TriageListFilters = {
  stateName?: string; // e.g. "Triage"
  excludeDone?: boolean;
  excludeCancelled?: boolean;
  limit?: number;
};

export type TriageIssueSummary = {
  id: string;
  identifier: string;
  title: string;
  url?: string | null;
  state: { id: string; name: string };
  assignee: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  createdAt?: string;
};

export async function triageList(env: Env, workspaceId: string, teamId: string, filters: TriageListFilters) {
  const limit = Math.min(Math.max(filters.limit ?? 25, 1), 100);
  const stateName = filters.stateName ?? "Triage";

  return withWorkspaceAccessToken<{ success: boolean; issues: TriageIssueSummary[] }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);

    const data: any = await sdkRequest<any>(
      client,
      `query($teamId: ID!, $first: Int!, $stateName: String!) {
        issues(
          first: $first,
          filter: {
            team: { id: { eq: $teamId } }
            state: { name: { eq: $stateName } }
          }
          orderBy: updatedAt
        ) {
          nodes {
            id
            identifier
            title
            url
            createdAt
            state { id name }
            assignee { id name }
            project { id name }
          }
        }
      }`,
      { teamId, first: limit, stateName },
    );

    let nodes: any[] = data?.issues?.nodes ?? [];

    // Optional exclusions by state name (best-effort; Linear setups vary)
    if (filters.excludeDone) nodes = nodes.filter((i) => i?.state?.name !== "Done");
    if (filters.excludeCancelled) nodes = nodes.filter((i) => i?.state?.name !== "Canceled" && i?.state?.name !== "Cancelled");

    const issues: TriageIssueSummary[] = nodes.map((i: any) => ({
      id: i.id,
      identifier: i.identifier,
      title: i.title,
      url: i.url ?? null,
      createdAt: i.createdAt,
      state: { id: i.state.id, name: i.state.name },
      assignee: i.assignee ? { id: i.assignee.id, name: i.assignee.name } : null,
      project: i.project ? { id: i.project.id, name: i.project.name } : null,
    }));

    return { success: true, issues };
  });
}
