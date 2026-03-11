import type { Env } from "../env";
import { withWorkspaceAccessToken } from "./client";
import { sdkRequest } from "./sdk";

export interface ProjectSummary {
  id: string;
  name: string;
  description?: string | null;
  state?: string | null;
}

type ProjectNode = {
  id: string;
  name: string;
  description?: string | null;
  state?: string | null;
};

type ProjectsConnection = {
  nodes: ProjectNode[];
};

type ListProjectsResponse =
  | {
      team: {
        projects: ProjectsConnection;
      };
    }
  | {
      projects: ProjectsConnection;
    };

type GetProjectResponse = {
  project: ProjectNode | null;
};

type CreateProjectResponse = {
  projectCreate: {
    success: boolean;
    project: ProjectNode;
  };
};

type UpdateProjectResponse = {
  projectUpdate: {
    success: boolean;
    project: ProjectNode;
  };
};

type ArchiveProjectResponse = {
  projectArchive: {
    success: boolean;
  };
};

export async function listProjects(env: Env, workspaceId: string, teamId?: string) {
  return withWorkspaceAccessToken<{ success: boolean; projects: ProjectSummary[] }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);

    const query = teamId
      ? `query($teamId: String!) { team(id: $teamId) { projects { nodes { id name description state } } } }`
      : `query { projects { nodes { id name description state } } }`;

    const data = await sdkRequest<ListProjectsResponse>(client, query, teamId ? { teamId } : {});
    const nodes = "team" in data ? data.team.projects.nodes : data.projects.nodes;

    return {
      success: true,
      projects: (nodes ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description ?? null,
        state: p.state ?? null,
      })),
    };
  });
}

export async function getProject(env: Env, workspaceId: string, projectId: string) {
  return withWorkspaceAccessToken<{ success: boolean; project: ProjectSummary | null }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);

    const data = await sdkRequest<GetProjectResponse>(
      client,
      `query($id: String!) { project(id: $id) { id name description state } }`,
      { id: projectId },
    );
    const p = data.project;

    return { success: true, project: p ? { id: p.id, name: p.name, description: p.description ?? null, state: p.state ?? null } : null };
  });
}

export async function createProject(env: Env, workspaceId: string, input: { name: string; description?: string; teamId: string }) {
  return withWorkspaceAccessToken<{ success: boolean; project: ProjectSummary }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);

    const data = await sdkRequest<CreateProjectResponse>(
      client,
      `mutation($input: ProjectCreateInput!) {
        projectCreate(input: $input) {
          success
          project { id name description state }
        }
      }`,
      { input: { name: input.name, description: input.description, teamIds: [input.teamId] } },
    );
    const proj = data.projectCreate.project;

    return { success: true, project: { id: proj.id, name: proj.name, description: proj.description ?? null, state: proj.state ?? null } };
  });
}

export async function updateProject(env: Env, workspaceId: string, input: { projectId: string; name?: string; description?: string }) {
  return withWorkspaceAccessToken<{ success: boolean; project: ProjectSummary }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);

    const data = await sdkRequest<UpdateProjectResponse>(
      client,
      `mutation($id: String!, $input: ProjectUpdateInput!) {
        projectUpdate(id: $id, input: $input) {
          success
          project { id name description state }
        }
      }`,
      { id: input.projectId, input: { name: input.name, description: input.description } },
    );
    const proj = data.projectUpdate.project;

    return { success: true, project: { id: proj.id, name: proj.name, description: proj.description ?? null, state: proj.state ?? null } };
  });
}

export async function archiveProject(env: Env, workspaceId: string, projectId: string) {
  return withWorkspaceAccessToken<{ success: boolean; project: ProjectSummary | null }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);

    const data = await sdkRequest<ArchiveProjectResponse>(
      client,
      `mutation($id: String!) { projectArchive(id: $id) { success } }`,
      { id: projectId },
    );
    const success = data.projectArchive.success;

    const getData = await sdkRequest<GetProjectResponse>(
      client,
      `query($id: String!) { project(id: $id) { id name description state } }`,
      { id: projectId },
    );
    const proj = getData.project;

    return { success: !!success, project: proj ? { id: proj.id, name: proj.name, description: proj.description ?? null, state: proj.state ?? null } : null };
  });
}
