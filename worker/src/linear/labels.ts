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

    type ListIssueLabelsResponse = {
      issueLabels?: {
        nodes?: Array<{
          id: string;
          name: string;
          color?: string | null;
          description?: string | null;
          isGroup?: boolean | null;
        }>;
      };
    };

    const data = await sdkRequest<ListIssueLabelsResponse>(
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

    const nodes = data?.issueLabels?.nodes ?? [];
    return {
      success: true,
      labels: nodes.map((l) => ({
        id: l.id,
        name: l.name,
        color: l.color ?? null,
        description: l.description ?? null,
        isGroup: l.isGroup ?? null,
      })),
    };
  });
}

export async function getIssueLabel(env: Env, workspaceId: string, id: string) {
  return withWorkspaceAccessToken<{ success: boolean; label: LabelSummary | null }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);

    type GetIssueLabelResponse = {
      issueLabel?: {
        id: string;
        name: string;
        color?: string | null;
        description?: string | null;
        isGroup?: boolean | null;
      } | null;
    };

    const data = await sdkRequest<GetIssueLabelResponse>(
      client,
      `query($id: String!) {
        issueLabel(id: $id) {
          id
          name
          color
          description
          isGroup
        }
      }`,
      { id },
    );

    const l = data?.issueLabel;
    return {
      success: true,
      label: l
        ? {
            id: l.id,
            name: l.name,
            color: l.color ?? null,
            description: l.description ?? null,
            isGroup: l.isGroup ?? null,
          }
        : null,
    };
  });
}

export async function createIssueLabel(env: Env, workspaceId: string, input: { name: string; color?: string | null; description?: string | null }) {
  return withWorkspaceAccessToken<{ success: boolean; labelId: string | null }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);

    type CreateIssueLabelResponse = {
      issueLabelCreate?: {
        success?: boolean | null;
        issueLabel?: { id: string } | null;
      };
    };

    const data = await sdkRequest<CreateIssueLabelResponse>(
      client,
      `mutation($input: IssueLabelCreateInput!) {
        issueLabelCreate(input: $input) {
          success
          issueLabel { id }
        }
      }`,
      {
        input: {
          name: input.name,
          color: input.color ?? undefined,
          description: input.description ?? undefined,
        },
      },
    );

    const payload = data?.issueLabelCreate;
    return { success: !!payload?.success, labelId: payload?.issueLabel?.id ?? null };
  });
}

export async function updateIssueLabel(env: Env, workspaceId: string, id: string, input: { name?: string; color?: string | null; description?: string | null }) {
  return withWorkspaceAccessToken<{ success: boolean }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);

    type UpdateIssueLabelResponse = {
      issueLabelUpdate?: {
        success?: boolean | null;
      };
    };

    const data = await sdkRequest<UpdateIssueLabelResponse>(
      client,
      `mutation($id: String!, $input: IssueLabelUpdateInput!) {
        issueLabelUpdate(id: $id, input: $input) {
          success
        }
      }`,
      {
        id,
        input: {
          name: input.name ?? undefined,
          color: input.color ?? undefined,
          description: input.description === undefined ? undefined : input.description,
        },
      },
    );

    return { success: !!data?.issueLabelUpdate?.success };
  });
}

export async function retireIssueLabel(env: Env, workspaceId: string, id: string) {
  return withWorkspaceAccessToken<{ success: boolean }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);

    type RetireIssueLabelResponse = {
      issueLabelRetire?: {
        success?: boolean | null;
      };
    };

    const data = await sdkRequest<RetireIssueLabelResponse>(
      client,
      `mutation($id: String!) {
        issueLabelRetire(id: $id) {
          success
        }
      }`,
      { id },
    );

    return { success: !!data?.issueLabelRetire?.success };
  });
}

export async function restoreIssueLabel(env: Env, workspaceId: string, id: string) {
  return withWorkspaceAccessToken<{ success: boolean }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);

    type RestoreIssueLabelResponse = {
      issueLabelRestore?: {
        success?: boolean | null;
      };
    };

    const data = await sdkRequest<RestoreIssueLabelResponse>(
      client,
      `mutation($id: String!) {
        issueLabelRestore(id: $id) {
          success
        }
      }`,
      { id },
    );

    return { success: !!data?.issueLabelRestore?.success };
  });
}
