import { LinearClient } from '@linear/sdk';

export type LinearSdkClient = LinearClient;

type RawRequestCapable = {
  client: {
    rawRequest: <T = unknown>(query: string, variables: Record<string, unknown>) => Promise<{ data?: T }>;
  };
};

export function createLinearSdkClient(accessToken: string): LinearSdkClient {
  return new LinearClient({ accessToken });
}

export async function sdkRequest<T>(client: RawRequestCapable, query: string, variables: Record<string, unknown>): Promise<T> {
  // Use underlying GraphQL client to avoid model hydration issues in unit tests.
  const res = await client.client.rawRequest<unknown>(query, variables);
  return (res.data ?? {}) as T;
}
