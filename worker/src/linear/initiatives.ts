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

export async function getInitiative(env: Env, workspaceId: string, id: string) {
  return withWorkspaceAccessToken<{ success: boolean; initiative: InitiativeSummary | null }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);
    const data: any = await sdkRequest<any>(
      client,
      `query($id: String!) {
        initiative(id: $id) {
          id
          name
          description
          url
          status
        }
      }`,
      { id },
    );
    const i = data?.initiative;
    return {
      success: true,
      initiative: i
        ? {
            id: i.id,
            name: i.name,
            description: i.description ?? null,
            url: i.url ?? null,
            status: i.status ?? null,
          }
        : null,
    };
  });
}

export async function createInitiative(env: Env, workspaceId: string, input: { name: string; description?: string | null; status?: string | null }) {
  return withWorkspaceAccessToken<{ success: boolean; initiativeId: string | null }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);

    const data: any = await sdkRequest<any>(
      client,
      `mutation($input: InitiativeCreateInput!) {
        initiativeCreate(input: $input) {
          success
          initiative {
            id
          }
        }
      }`,
      {
        input: {
          name: input.name,
          description: input.description ?? undefined,
          status: input.status ?? undefined,
        },
      },
    );

    const payload = data?.initiativeCreate;
    return { success: !!payload?.success, initiativeId: payload?.initiative?.id ?? null };
  });
}

export async function updateInitiative(env: Env, workspaceId: string, input: { id: string; name?: string; description?: string | null; status?: string | null }) {
  return withWorkspaceAccessToken<{ success: boolean }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);

    const data: any = await sdkRequest<any>(
      client,
      `mutation($input: InitiativeUpdateInput!) {
        initiativeUpdate(input: $input) {
          success
        }
      }`,
      {
        input: {
          id: input.id,
          name: input.name ?? undefined,
          description: input.description === undefined ? undefined : input.description,
          status: input.status ?? undefined,
        },
      },
    );

    return { success: !!data?.initiativeUpdate?.success };
  });
}

export async function archiveInitiative(env: Env, workspaceId: string, id: string) {
  return withWorkspaceAccessToken<{ success: boolean }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);

    const data: any = await sdkRequest<any>(
      client,
      `mutation($id: String!) {
        initiativeArchive(id: $id) {
          success
        }
      }`,
      { id },
    );

    return { success: !!data?.initiativeArchive?.success };
  });
}
