import type { Env } from "../env";
import { withWorkspaceAccessToken } from "./client";
import { sdkRequest } from "./sdk";

type ListCyclesResponse = {
  team?: {
    cycles?: {
      nodes?: Array<{
        id: string;
        number?: number | null;
        name?: string | null;
        startsAt?: string | null;
        endsAt?: string | null;
      }>;
    };
  };
};

type GetCycleResponse = {
  cycle?: {
    id: string;
    number?: number | null;
    name?: string | null;
    startsAt?: string | null;
    endsAt?: string | null;
  } | null;
};

type CreateCycleResponse = {
  cycleCreate?: {
    success?: boolean | null;
    cycle?: { id: string } | null;
  } | null;
};

type UpdateCycleResponse = {
  cycleUpdate?: { success?: boolean | null } | null;
};

type ArchiveCycleResponse = {
  cycleArchive?: { success?: boolean | null } | null;
};

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

    const data = await sdkRequest<ListCyclesResponse>(
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

    const nodes = data?.team?.cycles?.nodes ?? [];
    return {
      success: true,
      cycles: nodes.map((c) => ({
        id: c.id,
        number: c.number ?? null,
        name: c.name ?? null,
        startsAt: c.startsAt ?? null,
        endsAt: c.endsAt ?? null,
      })),
    };
  });
}

export async function getCycle(env: Env, workspaceId: string, id: string) {
  return withWorkspaceAccessToken<{ success: boolean; cycle: CycleSummary | null }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);

    const data = await sdkRequest<GetCycleResponse>(
      client,
      `query($id: String!) {
        cycle(id: $id) {
          id
          number
          name
          startsAt
          endsAt
        }
      }`,
      { id },
    );

    const c = data?.cycle;
    return {
      success: true,
      cycle: c
        ? {
            id: c.id,
            number: c.number ?? null,
            name: c.name ?? null,
            startsAt: c.startsAt ?? null,
            endsAt: c.endsAt ?? null,
          }
        : null,
    };
  });
}

export async function createCycle(env: Env, workspaceId: string, input: { teamId: string; startsAt: string; endsAt: string; name?: string | null }) {
  return withWorkspaceAccessToken<{ success: boolean; cycleId: string | null }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);

    const data = await sdkRequest<CreateCycleResponse>(
      client,
      `mutation($input: CycleCreateInput!) {
        cycleCreate(input: $input) {
          success
          cycle { id }
        }
      }`,
      {
        input: {
          teamId: input.teamId,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          name: input.name ?? undefined,
        },
      },
    );

    const payload = data?.cycleCreate;
    return { success: !!payload?.success, cycleId: payload?.cycle?.id ?? null };
  });
}

export async function updateCycle(env: Env, workspaceId: string, id: string, input: { startsAt?: string; endsAt?: string; name?: string | null }) {
  return withWorkspaceAccessToken<{ success: boolean }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);

    const data = await sdkRequest<UpdateCycleResponse>(
      client,
      `mutation($id: String!, $input: CycleUpdateInput!) {
        cycleUpdate(id: $id, input: $input) {
          success
        }
      }`,
      {
        id,
        input: {
          startsAt: input.startsAt ?? undefined,
          endsAt: input.endsAt ?? undefined,
          name: input.name === undefined ? undefined : input.name,
        },
      },
    );

    return { success: !!data?.cycleUpdate?.success };
  });
}

export async function archiveCycle(env: Env, workspaceId: string, id: string) {
  return withWorkspaceAccessToken<{ success: boolean }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);

    const data = await sdkRequest<ArchiveCycleResponse>(
      client,
      `mutation($id: String!) {
        cycleArchive(id: $id) {
          success
        }
      }`,
      { id },
    );

    return { success: !!data?.cycleArchive?.success };
  });
}
