import type { Env } from "../env";
import { withWorkspaceAccessToken } from "./client";
import { sdkRequest } from "./sdk";

export type CycleSummary = {
  id: string;
  number?: number | null;
  name?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
};

export async function listCycles(env: Env, workspaceId: string, teamId: string, first: number = 25) {
  const limit = Math.min(Math.max(first, 1), 100);
  return withWorkspaceAccessToken<{ success: boolean; cycles: CycleSummary[] }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);

    const data: any = await sdkRequest<any>(
      client,
      `query($teamId: String!, $first: Int!) {
        team(id: $teamId) {
          cycles(first: $first) {
            nodes {
              id
              number
              name
              startsAt
              endsAt
            }
          }
        }
      }`,
      { teamId, first: limit },
    );

    const nodes: any[] = data?.team?.cycles?.nodes ?? [];
    return {
      success: true,
      cycles: nodes.map((c: any) => ({
        id: c.id,
        number: c.number ?? null,
        name: c.name ?? null,
        startsAt: c.startsAt ?? null,
        endsAt: c.endsAt ?? null,
      })),
    };
  });
}
