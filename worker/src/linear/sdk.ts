import { LinearClient } from '@linear/sdk';

export type LinearSdkClient = LinearClient;

export function createLinearSdkClient(accessToken: string): LinearSdkClient {
  return new LinearClient({ accessToken });
}

export async function sdkRequest<T>(client: any, query: string, variables: Record<string, unknown>): Promise<T> {
  // Use underlying GraphQL client to avoid model hydration issues in unit tests.
  const res = await client.client.rawRequest(query, variables);
  return res.data as T;
}
