import type { Env } from "../env";
import { withWorkspaceAccessToken } from "./client";
import { sdkRequest } from "./sdk";

export type InitiativeSummary = {
  id: string;
  name: string;
  description?: string | null;
  url?: string | null;
  status?: string | null;
};

export async function listInitiatives(env: Env, workspaceId: string, first: number = 25) {
  const limit = Math.min(Math.max(first, 1), 100);
  return withWorkspaceAccessToken<{ success: boolean; initiatives: InitiativeSummary[] }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);

    const data: any = await sdkRequest<any>(
      client,
      `query($first: Int!) {
        initiatives(first: $first) {
          nodes {
            id
            name
            description
            url
            status
          }
        }
      }`,
      { first: limit },
    );

    const nodes: any[] = data?.initiatives?.nodes ?? [];
    return {
      success: true,
      initiatives: nodes.map((i: any) => ({
        id: i.id,
        name: i.name,
        description: i.description ?? null,
        url: i.url ?? null,
        status: i.status ?? null,
      })),
    };
  });
}
