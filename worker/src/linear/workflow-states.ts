import type { Env } from "../env";
import { withWorkspaceAccessToken } from "./client";
import { sdkRequest } from "./sdk";

export type WorkflowStateSummary = {
  id: string;
  name: string;
  type?: string | null;
  position?: number | null;
};

type WorkflowStateNode = {
  id: string;
  name: string;
  type?: string | null;
  position?: number | null;
};

function mapWorkflowState(state: WorkflowStateNode): WorkflowStateSummary {
  return {
    id: state.id,
    name: state.name,
    type: state.type ?? null,
    position: state.position ?? null,
  };
}

export async function listWorkflowStates(env: Env, workspaceId: string, teamId: string, limit: number = 25) {
  const first = Math.min(Math.max(limit, 1), 100);
  return withWorkspaceAccessToken<{ success: boolean; workflowStates: WorkflowStateSummary[] }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);
    const data = await sdkRequest<{ workflowStates?: { nodes?: WorkflowStateNode[] } }>(
      client,
      `query($first: Int!, $teamId: String!) {
        workflowStates(first: $first, filter: { team: { id: { eq: $teamId } } }) {
          nodes { id name type position }
        }
      }`,
      { first, teamId },
    );

    return {
      success: true,
      workflowStates: (data.workflowStates?.nodes ?? []).map(mapWorkflowState),
    };
  });
}

export async function getWorkflowState(env: Env, workspaceId: string, id: string) {
  return withWorkspaceAccessToken<{ success: boolean; workflowState: WorkflowStateSummary | null }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);
    const data = await sdkRequest<{ workflowState?: WorkflowStateNode | null }>(
      client,
      `query($id: String!) {
        workflowState(id: $id) { id name type position }
      }`,
      { id },
    );

    return {
      success: true,
      workflowState: data.workflowState ? mapWorkflowState(data.workflowState) : null,
    };
  });
}

export async function createWorkflowState(
  env: Env,
  workspaceId: string,
  input: { teamId: string; name: string; type: string; position?: number | null },
) {
  return withWorkspaceAccessToken<{ success: boolean; workflowStateId: string | null; workflowState: WorkflowStateSummary | null }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);
    const data = await sdkRequest<{ workflowStateCreate?: { success?: boolean | null; workflowState?: WorkflowStateNode | null } | null }>(
      client,
      `mutation($input: WorkflowStateCreateInput!) {
        workflowStateCreate(input: $input) {
          success
          workflowState { id name type position }
        }
      }`,
      {
        input: {
          teamId: input.teamId,
          name: input.name,
          type: input.type,
          position: input.position ?? undefined,
        },
      },
    );

    const payload = data.workflowStateCreate;
    return {
      success: !!payload?.success,
      workflowStateId: payload?.workflowState?.id ?? null,
      workflowState: payload?.workflowState ? mapWorkflowState(payload.workflowState) : null,
    };
  });
}

export async function updateWorkflowState(
  env: Env,
  workspaceId: string,
  id: string,
  input: { name?: string; type?: string | null; position?: number | null },
) {
  return withWorkspaceAccessToken<{ success: boolean; workflowState: WorkflowStateSummary | null }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);
    const data = await sdkRequest<{ workflowStateUpdate?: { success?: boolean | null; workflowState?: WorkflowStateNode | null } | null }>(
      client,
      `mutation($id: String!, $input: WorkflowStateUpdateInput!) {
        workflowStateUpdate(id: $id, input: $input) {
          success
          workflowState { id name type position }
        }
      }`,
      {
        id,
        input: {
          name: input.name ?? undefined,
          type: input.type === undefined ? undefined : input.type,
          position: input.position === undefined ? undefined : input.position,
        },
      },
    );

    const payload = data.workflowStateUpdate;
    return {
      success: !!payload?.success,
      workflowState: payload?.workflowState ? mapWorkflowState(payload.workflowState) : null,
    };
  });
}

export async function archiveWorkflowState(env: Env, workspaceId: string, id: string) {
  return withWorkspaceAccessToken<{ success: boolean }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);
    const data = await sdkRequest<{ workflowStateArchive?: { success?: boolean | null } | null }>(
      client,
      `mutation($id: String!) {
        workflowStateArchive(id: $id) { success }
      }`,
      { id },
    );

    return { success: !!data.workflowStateArchive?.success };
  });
}
