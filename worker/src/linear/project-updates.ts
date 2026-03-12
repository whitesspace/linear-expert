import type { Env } from "../env";
import { withWorkspaceAccessToken } from "./client";
import { sdkRequest } from "./sdk";

export type ProjectUpdateSummary = {
  id: string;
  body: string;
  health?: string | null;
  project?: { id: string; name: string } | null;
};

type ProjectUpdateNode = {
  id: string;
  body: string;
  health?: string | null;
  project?: { id: string; name: string } | null;
};

function mapProjectUpdate(projectUpdate: ProjectUpdateNode): ProjectUpdateSummary {
  return {
    id: projectUpdate.id,
    body: projectUpdate.body,
    health: projectUpdate.health ?? null,
    project: projectUpdate.project ? { id: projectUpdate.project.id, name: projectUpdate.project.name } : null,
  };
}

export async function listProjectUpdates(env: Env, workspaceId: string, limit: number = 25) {
  const first = Math.min(Math.max(limit, 1), 100);
  return withWorkspaceAccessToken<{ success: boolean; projectUpdates: ProjectUpdateSummary[] }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);
    const data = await sdkRequest<{ projectUpdates?: { nodes?: ProjectUpdateNode[] } }>(
      client,
      `query($first: Int!) {
        projectUpdates(first: $first) {
          nodes { id body health project { id name } }
        }
      }`,
      { first },
    );

    return {
      success: true,
      projectUpdates: (data.projectUpdates?.nodes ?? []).map(mapProjectUpdate),
    };
  });
}

export async function getProjectUpdate(env: Env, workspaceId: string, id: string) {
  return withWorkspaceAccessToken<{ success: boolean; projectUpdate: ProjectUpdateSummary | null }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);
    const data = await sdkRequest<{ projectUpdate?: ProjectUpdateNode | null }>(
      client,
      `query($id: String!) {
        projectUpdate(id: $id) { id body health project { id name } }
      }`,
      { id },
    );

    return {
      success: true,
      projectUpdate: data.projectUpdate ? mapProjectUpdate(data.projectUpdate) : null,
    };
  });
}

export async function createProjectUpdate(
  env: Env,
  workspaceId: string,
  input: { projectId: string; body: string; health?: string | null },
) {
  return withWorkspaceAccessToken<{ success: boolean; projectUpdateId: string | null; projectUpdate: ProjectUpdateSummary | null }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);
    const data = await sdkRequest<{ projectUpdateCreate?: { success?: boolean | null; projectUpdate?: ProjectUpdateNode | null } | null }>(
      client,
      `mutation($input: ProjectUpdateCreateInput!) {
        projectUpdateCreate(input: $input) {
          success
          projectUpdate { id body health project { id name } }
        }
      }`,
      {
        input: {
          projectId: input.projectId,
          body: input.body,
          health: input.health ?? undefined,
        },
      },
    );

    const payload = data.projectUpdateCreate;
    return {
      success: !!payload?.success,
      projectUpdateId: payload?.projectUpdate?.id ?? null,
      projectUpdate: payload?.projectUpdate ? mapProjectUpdate(payload.projectUpdate) : null,
    };
  });
}

export async function updateProjectUpdate(
  env: Env,
  workspaceId: string,
  id: string,
  input: { body?: string; health?: string | null },
) {
  return withWorkspaceAccessToken<{ success: boolean; projectUpdate: ProjectUpdateSummary | null }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);
    const data = await sdkRequest<{ projectUpdateUpdate?: { success?: boolean | null; projectUpdate?: ProjectUpdateNode | null } | null }>(
      client,
      `mutation($id: String!, $input: ProjectUpdateUpdateInput!) {
        projectUpdateUpdate(id: $id, input: $input) {
          success
          projectUpdate { id body health project { id name } }
        }
      }`,
      {
        id,
        input: {
          body: input.body ?? undefined,
          health: input.health === undefined ? undefined : input.health,
        },
      },
    );

    const payload = data.projectUpdateUpdate;
    return {
      success: !!payload?.success,
      projectUpdate: payload?.projectUpdate ? mapProjectUpdate(payload.projectUpdate) : null,
    };
  });
}

export async function deleteProjectUpdate(env: Env, workspaceId: string, id: string) {
  return withWorkspaceAccessToken<{ success: boolean }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);
    const data = await sdkRequest<{ projectUpdateArchive?: { success?: boolean | null } | null }>(
      client,
      `mutation($id: String!) {
        projectUpdateArchive(id: $id) { success }
      }`,
      { id },
    );

    return { success: !!data.projectUpdateArchive?.success };
  });
}

export async function unarchiveProjectUpdate(env: Env, workspaceId: string, id: string) {
  return withWorkspaceAccessToken<{ success: boolean; projectUpdateId: string | null }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);
    const data = await sdkRequest<{ projectUpdateUnarchive?: { success?: boolean | null; entity?: { id: string } | null } | null }>(
      client,
      `mutation($id: String!) {
        projectUpdateUnarchive(id: $id) {
          success
          entity { id }
        }
      }`,
      { id },
    );

    return {
      success: !!data.projectUpdateUnarchive?.success,
      projectUpdateId: data.projectUpdateUnarchive?.entity?.id ?? null,
    };
  });
}
