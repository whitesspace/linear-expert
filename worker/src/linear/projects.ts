import type { Env } from "../env";
import { createLinearSdkClient, sdkRequest } from "./sdk";

async function withWorkspaceAccessToken<T>(env: Env, workspaceId: string, fn: (accessToken: string) => Promise<T>): Promise<T> {
  const { getStorage } = await import("../storage");
  const storage = getStorage(env);
  const token = await storage.oauth.get(workspaceId);
  if (!token?.accessToken) {
    throw new Error(`No OAuth token stored for workspace ${workspaceId}`);
  }
  if (token.expiresAt && new Date(token.expiresAt) < new Date()) {
    throw new Error(`OAuth token for workspace ${workspaceId} is expired`);
  }
  return fn(token.accessToken);
}

export interface ProjectSummary {
  id: string;
  name: string;
  description?: string | null;
  state?: string | null;
}

export async function listProjects(env: Env, workspaceId: string, teamId?: string) {
  return withWorkspaceAccessToken<{ success: boolean; projects: ProjectSummary[] }>(env, workspaceId, async (accessToken) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);

    const query = teamId
      ? `query($teamId: String!) { team(id: $teamId) { projects { nodes { id name description state } } } }`
      : `query { projects { nodes { id name description state } } }`;

    const data: any = await sdkRequest<any>(client, query, teamId ? { teamId } : {});
    const nodes = teamId ? data?.team?.projects?.nodes : data?.projects?.nodes;
    const projects: ProjectSummary[] = (nodes ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? null,
      state: p.state ?? null,
    }));
    return { success: true, projects };
  });
}

export async function getProject(env: Env, workspaceId: string, projectId: string) {
  return withWorkspaceAccessToken<{ success: boolean; project: ProjectSummary | null }>(env, workspaceId, async (accessToken) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);
    const data: any = await sdkRequest<any>(
      client,
      `query($id: String!) { project(id: $id) { id name description state } }`,
      { id: projectId },
    );
    const p = data?.project;
    return { success: true, project: p ? { id: p.id, name: p.name, description: p.description ?? null, state: p.state ?? null } : null };
  });
}

export async function createProject(env: Env, workspaceId: string, input: { name: string; description?: string; teamId?: string }) {
  return withWorkspaceAccessToken<{ success: boolean; project: ProjectSummary }>(env, workspaceId, async (accessToken) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);
    // teamId is required for projectCreate
    const teamId = input.teamId || "03c51bbb-17f9-4f97-b153-07072e5cca5e"; // default WS team
    const data: any = await sdkRequest<any>(
      client,
      `mutation($input: ProjectCreateInput!) {
        projectCreate(input: $input) {
          success
          project { id name description state }
        }
      }`,
      { input: { name: input.name, description: input.description, teamIds: [teamId] } },
    );
    const proj = data?.projectCreate?.project;
    return { success: true, project: { id: proj.id, name: proj.name, description: proj.description ?? null, state: proj.state ?? null } };
  });
}

export async function updateProject(env: Env, workspaceId: string, input: { projectId: string; name?: string; description?: string }) {
  return withWorkspaceAccessToken<{ success: boolean; project: ProjectSummary }>(env, workspaceId, async (accessToken) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);
    const data: any = await sdkRequest<any>(
      client,
      `mutation($id: String!, $input: ProjectUpdateInput!) {
        projectUpdate(id: $id, input: $input) {
          success
          project { id name description state }
        }
      }`,
      { id: input.projectId, input: { name: input.name, description: input.description } },
    );
    const proj = data?.projectUpdate?.project;
    return { success: true, project: { id: proj.id, name: proj.name, description: proj.description ?? null, state: proj.state ?? null } };
  });
}

export async function archiveProject(env: Env, workspaceId: string, projectId: string) {
  return withWorkspaceAccessToken<{ success: boolean; project: ProjectSummary | null }>(env, workspaceId, async (accessToken) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);
    const data: any = await sdkRequest<any>(
      client,
      `mutation($id: String!) {
        projectArchive(id: $id) {
          success
        }
      }`,
      { id: projectId },
    );
    const success = data?.projectArchive?.success;
    // After archive, project is "archived" state - we can get it to confirm
    const getData: any = await sdkRequest<any>(
      client,
      `query($id: String!) { project(id: $id) { id name description state } }`,
      { id: projectId },
    );
    const proj = getData?.project;
    return { success: !!success, project: proj ? { id: proj.id, name: proj.name, description: proj.description ?? null, state: proj.state ?? null } : null };
  });
}
