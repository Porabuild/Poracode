import { compactAgentProviderMetadata, type AgentProviderMetadata } from "@/shared/contracts";
import {
  emailFromUserStatus,
  GET_USER_STATUS,
  planFromUserStatus,
  queryLs,
} from "./antigravityLanguageServer";
import { resolveAntigravityLsEndpoints } from "./antigravityProcessScan";

/** Build the account metadata from a GetUserStatus body; undefined when empty. */
export function antigravityAccountFromUserStatus(body: unknown): AgentProviderMetadata | undefined {
  // `compactAgentProviderMetadata` drops blank/missing fields and returns
  // undefined when nothing remains, so passing both extracted values is enough.
  const authenticatedAs = emailFromUserStatus(body);
  const plan = planFromUserStatus(body);
  return compactAgentProviderMetadata({
    ...(authenticatedAs ? { authenticatedAs } : {}),
    ...(plan ? { plan } : {}),
  });
}

/** Resolve account metadata only from an already-running local language server. */
export async function probeAntigravityAccount(
  wslDistros: readonly string[] = [],
): Promise<AgentProviderMetadata | undefined> {
  const { ports, csrfTokens } = await resolveAntigravityLsEndpoints(wslDistros).catch(() => ({
    ports: [],
    csrfTokens: [],
  }));
  for (const port of ports) {
    const account = antigravityAccountFromUserStatus(
      await queryLs(port, GET_USER_STATUS, csrfTokens).catch(() => undefined),
    );
    if (account) return account;
  }
  return undefined;
}
