import type { Env } from "../env";
import { withWorkspaceAccessToken } from "./client";
import { sdkRequest } from "./sdk";

export type CustomerSummary = {
  id: string;
  name: string;
  domains?: string[] | null;
  revenue?: number | null;
  size?: number | null;
};

export type CustomerNeedSummary = {
  id: string;
  body: string;
  priority?: number | null;
  customer?: { id: string; name: string } | null;
  issue?: { id: string; identifier: string } | null;
  project?: { id: string; name: string } | null;
};

type CustomerNode = {
  id: string;
  name: string;
  domains?: string[] | null;
  revenue?: number | null;
  size?: number | null;
};

type CustomerNeedNode = {
  id: string;
  body: string;
  priority?: number | null;
  customer?: { id: string; name: string } | null;
  issue?: { id: string; identifier: string } | null;
  project?: { id: string; name: string } | null;
};

function mapCustomer(customer: CustomerNode): CustomerSummary {
  return {
    id: customer.id,
    name: customer.name,
    domains: customer.domains ?? null,
    revenue: customer.revenue ?? null,
    size: customer.size ?? null,
  };
}

function mapCustomerNeed(need: CustomerNeedNode): CustomerNeedSummary {
  return {
    id: need.id,
    body: need.body,
    priority: need.priority ?? null,
    customer: need.customer ? { id: need.customer.id, name: need.customer.name } : null,
    issue: need.issue ? { id: need.issue.id, identifier: need.issue.identifier } : null,
    project: need.project ? { id: need.project.id, name: need.project.name } : null,
  };
}

export async function listCustomers(env: Env, workspaceId: string, limit: number = 25) {
  const first = Math.min(Math.max(limit, 1), 100);
  return withWorkspaceAccessToken<{ success: boolean; customers: CustomerSummary[] }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);
    const data = await sdkRequest<{ customers?: { nodes?: CustomerNode[] } }>(
      client,
      `query($first: Int!) {
        customers(first: $first) {
          nodes { id name domains revenue size }
        }
      }`,
      { first },
    );

    return {
      success: true,
      customers: (data.customers?.nodes ?? []).map(mapCustomer),
    };
  });
}

export async function getCustomer(env: Env, workspaceId: string, id: string) {
  return withWorkspaceAccessToken<{ success: boolean; customer: CustomerSummary | null }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);
    const data = await sdkRequest<{ customer?: CustomerNode | null }>(
      client,
      `query($id: String!) {
        customer(id: $id) { id name domains revenue size }
      }`,
      { id },
    );

    return {
      success: true,
      customer: data.customer ? mapCustomer(data.customer) : null,
    };
  });
}

export async function createCustomer(
  env: Env,
  workspaceId: string,
  input: { name: string; domains?: string[] | null; revenue?: number | null; size?: number | null },
) {
  return withWorkspaceAccessToken<{ success: boolean; customerId: string | null; customer: CustomerSummary | null }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);
    const data = await sdkRequest<{ customerCreate?: { success?: boolean | null; customer?: CustomerNode | null } | null }>(
      client,
      `mutation($input: CustomerCreateInput!) {
        customerCreate(input: $input) {
          success
          customer { id name domains revenue size }
        }
      }`,
      {
        input: {
          name: input.name,
          domains: input.domains ?? undefined,
          revenue: input.revenue ?? undefined,
          size: input.size ?? undefined,
        },
      },
    );

    const payload = data.customerCreate;
    return {
      success: !!payload?.success,
      customerId: payload?.customer?.id ?? null,
      customer: payload?.customer ? mapCustomer(payload.customer) : null,
    };
  });
}

export async function updateCustomer(
  env: Env,
  workspaceId: string,
  id: string,
  input: { name?: string; domains?: string[] | null; revenue?: number | null; size?: number | null },
) {
  return withWorkspaceAccessToken<{ success: boolean; customer: CustomerSummary | null }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);
    const data = await sdkRequest<{ customerUpdate?: { success?: boolean | null; customer?: CustomerNode | null } | null }>(
      client,
      `mutation($id: String!, $input: CustomerUpdateInput!) {
        customerUpdate(id: $id, input: $input) {
          success
          customer { id name domains revenue size }
        }
      }`,
      {
        id,
        input: {
          name: input.name ?? undefined,
          domains: input.domains === undefined ? undefined : input.domains,
          revenue: input.revenue === undefined ? undefined : input.revenue,
          size: input.size === undefined ? undefined : input.size,
        },
      },
    );

    const payload = data.customerUpdate;
    return {
      success: !!payload?.success,
      customer: payload?.customer ? mapCustomer(payload.customer) : null,
    };
  });
}

export async function deleteCustomer(env: Env, workspaceId: string, id: string) {
  return withWorkspaceAccessToken<{ success: boolean }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);
    const data = await sdkRequest<{ customerDelete?: { success?: boolean | null } | null }>(
      client,
      `mutation($id: String!) {
        customerDelete(id: $id) { success }
      }`,
      { id },
    );

    return { success: !!data.customerDelete?.success };
  });
}

export async function listCustomerNeeds(env: Env, workspaceId: string, limit: number = 25) {
  const first = Math.min(Math.max(limit, 1), 100);
  return withWorkspaceAccessToken<{ success: boolean; customerNeeds: CustomerNeedSummary[] }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);
    const data = await sdkRequest<{ customerNeeds?: { nodes?: CustomerNeedNode[] } }>(
      client,
      `query($first: Int!) {
        customerNeeds(first: $first) {
          nodes {
            id
            body
            priority
            customer { id name }
            issue { id identifier }
            project { id name }
          }
        }
      }`,
      { first },
    );

    return {
      success: true,
      customerNeeds: (data.customerNeeds?.nodes ?? []).map(mapCustomerNeed),
    };
  });
}

export async function getCustomerNeed(env: Env, workspaceId: string, id: string) {
  return withWorkspaceAccessToken<{ success: boolean; customerNeed: CustomerNeedSummary | null }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);
    const data = await sdkRequest<{ customerNeed?: CustomerNeedNode | null }>(
      client,
      `query($id: String!) {
        customerNeed(id: $id) {
          id
          body
          priority
          customer { id name }
          issue { id identifier }
          project { id name }
        }
      }`,
      { id },
    );

    return {
      success: true,
      customerNeed: data.customerNeed ? mapCustomerNeed(data.customerNeed) : null,
    };
  });
}

export async function createCustomerNeed(
  env: Env,
  workspaceId: string,
  input: { body: string; customerId?: string; issueId?: string; projectId?: string; priority?: number | null },
) {
  return withWorkspaceAccessToken<{ success: boolean; customerNeedId: string | null; customerNeed: CustomerNeedSummary | null }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);
    const data = await sdkRequest<{ customerNeedCreate?: { success?: boolean | null; customerNeed?: CustomerNeedNode | null } | null }>(
      client,
      `mutation($input: CustomerNeedCreateInput!) {
        customerNeedCreate(input: $input) {
          success
          customerNeed {
            id
            body
            priority
            customer { id name }
            issue { id identifier }
            project { id name }
          }
        }
      }`,
      {
        input: {
          body: input.body,
          customerId: input.customerId ?? undefined,
          issueId: input.issueId ?? undefined,
          projectId: input.projectId ?? undefined,
          priority: input.priority ?? undefined,
        },
      },
    );

    const payload = data.customerNeedCreate;
    return {
      success: !!payload?.success,
      customerNeedId: payload?.customerNeed?.id ?? null,
      customerNeed: payload?.customerNeed ? mapCustomerNeed(payload.customerNeed) : null,
    };
  });
}

export async function updateCustomerNeed(
  env: Env,
  workspaceId: string,
  id: string,
  input: { body?: string; customerId?: string | null; issueId?: string | null; projectId?: string | null; priority?: number | null },
) {
  return withWorkspaceAccessToken<{ success: boolean; customerNeed: CustomerNeedSummary | null }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);
    const data = await sdkRequest<{ customerNeedUpdate?: { success?: boolean | null; customerNeed?: CustomerNeedNode | null } | null }>(
      client,
      `mutation($id: String!, $input: CustomerNeedUpdateInput!) {
        customerNeedUpdate(id: $id, input: $input) {
          success
          customerNeed {
            id
            body
            priority
            customer { id name }
            issue { id identifier }
            project { id name }
          }
        }
      }`,
      {
        id,
        input: {
          body: input.body ?? undefined,
          customerId: input.customerId === undefined ? undefined : input.customerId,
          issueId: input.issueId === undefined ? undefined : input.issueId,
          projectId: input.projectId === undefined ? undefined : input.projectId,
          priority: input.priority === undefined ? undefined : input.priority,
        },
      },
    );

    const payload = data.customerNeedUpdate;
    return {
      success: !!payload?.success,
      customerNeed: payload?.customerNeed ? mapCustomerNeed(payload.customerNeed) : null,
    };
  });
}

export async function deleteCustomerNeed(env: Env, workspaceId: string, id: string) {
  return withWorkspaceAccessToken<{ success: boolean }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);
    const data = await sdkRequest<{ customerNeedArchive?: { success?: boolean | null } | null }>(
      client,
      `mutation($id: String!) {
        customerNeedArchive(id: $id) { success }
      }`,
      { id },
    );

    return { success: !!data.customerNeedArchive?.success };
  });
}

export async function unarchiveCustomerNeed(env: Env, workspaceId: string, id: string) {
  return withWorkspaceAccessToken<{ success: boolean; customerNeedId: string | null }>(env, workspaceId, async (accessToken: string) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);
    const data = await sdkRequest<{ customerNeedUnarchive?: { success?: boolean | null; entity?: { id: string } | null } | null }>(
      client,
      `mutation($id: String!) {
        customerNeedUnarchive(id: $id) {
          success
          entity { id }
        }
      }`,
      { id },
    );

    return {
      success: !!data.customerNeedUnarchive?.success,
      customerNeedId: data.customerNeedUnarchive?.entity?.id ?? null,
    };
  });
}
