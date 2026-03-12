import type { Env } from "../env";
import { withWorkspaceAccessToken } from "./client";
import { sdkRequest } from "./sdk";

export type DocumentSummary = {
  id: string;
  title: string;
  content?: string | null;
  url?: string | null;
  icon?: string | null;
  color?: string | null;
};

type DocumentNode = {
  id: string;
  title: string;
  content?: string | null;
  url?: string | null;
  icon?: string | null;
  color?: string | null;
};

type ListDocumentsResponse = {
  documents?: {
    nodes?: DocumentNode[];
  };
};

type GetDocumentResponse = {
  document?: DocumentNode | null;
};

type DocumentMutationResponse = {
  success?: boolean | null;
  document?: DocumentNode | null;
};

type DeleteDocumentResponse = {
  documentDelete?: {
    success?: boolean | null;
  } | null;
};

type UnarchiveDocumentResponse = {
  documentUnarchive?: {
    success?: boolean | null;
    entity?: { id: string } | null;
  } | null;
};

function mapDocument(document: DocumentNode): DocumentSummary {
  return {
    id: document.id,
    title: document.title,
    content: document.content ?? null,
    url: document.url ?? null,
    icon: document.icon ?? null,
    color: document.color ?? null,
  };
}

export async function listDocuments(
  env: Env,
  workspaceId: string,
  input: { limit?: number; issueId?: string; projectId?: string; initiativeId?: string } = {},
) {
  const first = Math.min(Math.max(input.limit ?? 25, 1), 100);
  return withWorkspaceAccessToken<{ success: boolean; documents: DocumentSummary[] }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);

    const filter = input.issueId
      ? "issue: { id: { eq: $issueId } }"
      : input.projectId
        ? "project: { id: { eq: $projectId } }"
        : input.initiativeId
          ? "initiative: { id: { eq: $initiativeId } }"
          : "";

    const query = filter
      ? `query($first: Int!, $issueId: String, $projectId: String, $initiativeId: String) {
          documents(first: $first, filter: { ${filter} }) {
            nodes { id title content url icon color }
          }
        }`
      : `query($first: Int!) {
          documents(first: $first) {
            nodes { id title content url icon color }
          }
        }`;

    const data = await sdkRequest<ListDocumentsResponse>(client, query, {
      first,
      issueId: input.issueId,
      projectId: input.projectId,
      initiativeId: input.initiativeId,
    });

    return {
      success: true,
      documents: (data.documents?.nodes ?? []).map(mapDocument),
    };
  });
}

export async function getDocument(env: Env, workspaceId: string, id: string) {
  return withWorkspaceAccessToken<{ success: boolean; document: DocumentSummary | null }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);

    const data = await sdkRequest<GetDocumentResponse>(
      client,
      `query($id: String!) {
        document(id: $id) { id title content url icon color }
      }`,
      { id },
    );

    return {
      success: true,
      document: data.document ? mapDocument(data.document) : null,
    };
  });
}

export async function createDocument(
  env: Env,
  workspaceId: string,
  input: { title: string; content?: string | null; issueId?: string; projectId?: string; initiativeId?: string; icon?: string | null; color?: string | null },
) {
  return withWorkspaceAccessToken<{ success: boolean; documentId: string | null; document: DocumentSummary | null }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);

    const data = await sdkRequest<{ documentCreate?: DocumentMutationResponse | null }>(
      client,
      `mutation($input: DocumentCreateInput!) {
        documentCreate(input: $input) {
          success
          document { id title content url icon color }
        }
      }`,
      {
        input: {
          title: input.title,
          content: input.content ?? undefined,
          issueId: input.issueId ?? undefined,
          projectId: input.projectId ?? undefined,
          initiativeId: input.initiativeId ?? undefined,
          icon: input.icon ?? undefined,
          color: input.color ?? undefined,
        },
      },
    );

    const payload = data.documentCreate;
    return {
      success: !!payload?.success,
      documentId: payload?.document?.id ?? null,
      document: payload?.document ? mapDocument(payload.document) : null,
    };
  });
}

export async function updateDocument(
  env: Env,
  workspaceId: string,
  id: string,
  input: { title?: string; content?: string | null; icon?: string | null; color?: string | null },
) {
  return withWorkspaceAccessToken<{ success: boolean; document: DocumentSummary | null }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);

    const data = await sdkRequest<{ documentUpdate?: DocumentMutationResponse | null }>(
      client,
      `mutation($id: String!, $input: DocumentUpdateInput!) {
        documentUpdate(id: $id, input: $input) {
          success
          document { id title content url icon color }
        }
      }`,
      {
        id,
        input: {
          title: input.title ?? undefined,
          content: input.content === undefined ? undefined : input.content,
          icon: input.icon === undefined ? undefined : input.icon,
          color: input.color === undefined ? undefined : input.color,
        },
      },
    );

    const payload = data.documentUpdate;
    return {
      success: !!payload?.success,
      document: payload?.document ? mapDocument(payload.document) : null,
    };
  });
}

export async function deleteDocument(env: Env, workspaceId: string, id: string) {
  return withWorkspaceAccessToken<{ success: boolean }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);

    const data = await sdkRequest<DeleteDocumentResponse>(
      client,
      `mutation($id: String!) {
        documentDelete(id: $id) { success }
      }`,
      { id },
    );

    return { success: !!data.documentDelete?.success };
  });
}

export async function unarchiveDocument(env: Env, workspaceId: string, id: string) {
  return withWorkspaceAccessToken<{ success: boolean; documentId: string | null }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);

    const data = await sdkRequest<UnarchiveDocumentResponse>(
      client,
      `mutation($id: String!) {
        documentUnarchive(id: $id) {
          success
          entity { id }
        }
      }`,
      { id },
    );

    return {
      success: !!data.documentUnarchive?.success,
      documentId: data.documentUnarchive?.entity?.id ?? null,
    };
  });
}
