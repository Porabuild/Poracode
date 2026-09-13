import type {
  AgentConnectedProvider,
  ManageAgentCredentialsPayload,
  ManageAgentCredentialsResult,
} from "@/shared/contracts";
import type { StatusProbeResult } from "../base/types";
import { detectProbeLocation } from "../base";
import { acquireOpenCode2Server, resolveOpenCode2SessionDirectory } from "./client";

/**
 * One stored credential for an integration. `id` is what `credential.remove`
 * accepts; `label` is the account/key name the server shows for it.
 */
export interface OpenCode2IntegrationCredential {
  id: string;
  label: string;
}

/**
 * An upstream AI provider as the V2 server reports it. `credentials` are the
 * removable ones; `envBacked` marks a provider wired up through an environment
 * variable, which counts as signed in but has nothing to remove.
 */
export interface OpenCode2InventoryIntegration {
  id: string;
  name: string;
  credentials: OpenCode2IntegrationCredential[];
  envBacked: boolean;
}

/**
 * Flatten integrations into the connected-provider rows the settings UI shows.
 *
 * One row per stored credential rather than per provider: a provider can hold
 * several (e.g. two API keys), and each is removed by its own id. Env-backed
 * providers are deliberately omitted — they are not stored credentials, so
 * offering a sign-out for them would promise something the server cannot do.
 */
export function openCode2ConnectedProviders(
  integrations: readonly OpenCode2InventoryIntegration[],
): AgentConnectedProvider[] {
  return integrations.flatMap((integration) =>
    integration.credentials.map((credential) => ({
      label: integration.name.trim() || integration.id,
      id: credential.id,
      ...(credential.label.trim() && credential.label.trim() !== integration.name.trim()
        ? { detail: credential.label.trim() }
        : {}),
    })),
  );
}

/**
 * Auth state counts env-backed providers too: OpenCode works without a stored
 * credential when a provider key comes from the environment, so reporting
 * "login required" there would be wrong.
 */
export function buildOpenCode2StatusFromIntegrations(
  integrations: readonly OpenCode2InventoryIntegration[],
): StatusProbeResult {
  const connectedProviders = openCode2ConnectedProviders(integrations);
  const signedIn =
    connectedProviders.length > 0 || integrations.some((integration) => integration.envBacked);
  return {
    authState: signedIn ? "authenticated" : "missing",
    ...(connectedProviders.length > 0 ? { providerMetadata: { connectedProviders } } : {}),
  };
}

/** Shape the server's integration list into the inventory entry above. */
export function readOpenCode2Integrations(
  data: readonly {
    id: string;
    name: string;
    connections: readonly (
      | { type: "credential"; id: string; label: string }
      | { type: "env"; name: string }
    )[];
  }[],
): OpenCode2InventoryIntegration[] {
  return data.map((integration) => ({
    id: integration.id,
    name: integration.name,
    credentials: integration.connections.flatMap((connection) =>
      connection.type === "credential" ? [{ id: connection.id, label: connection.label }] : [],
    ),
    envBacked: integration.connections.some((connection) => connection.type === "env"),
  }));
}

/**
 * List or sign out of the upstream AI providers OpenCode 2 has credentials for.
 * Sign-out goes through the server's `credential.remove` so the user never has
 * to leave the settings page; adding a provider stays on the CLI, which owns
 * the OAuth and API-key flows.
 */
export async function manageOpenCode2Credentials(
  input: Omit<ManageAgentCredentialsPayload, "agentKind">,
): Promise<ManageAgentCredentialsResult> {
  const location = detectProbeLocation(
    input.env.kind === "wsl"
      ? { envKind: "wsl", wslDistro: input.env.distro }
      : { envKind: process.platform === "win32" ? "windows" : "posix" },
  );
  const acquired = await acquireOpenCode2Server({ projectLocation: location });
  try {
    const options = { signal: AbortSignal.timeout(30_000) };
    const locationInput = { directory: resolveOpenCode2SessionDirectory(location) };
    if (input.action === "remove") {
      await acquired.client.credential.remove(
        {
          credentialID: input.credentialId as Parameters<
            typeof acquired.client.credential.remove
          >[0]["credentialID"],
          location: locationInput,
        },
        options,
      );
    }
    const listed = await acquired.client.integration.list({ location: locationInput }, options);
    return { providers: openCode2ConnectedProviders(readOpenCode2Integrations(listed.data)) };
  } finally {
    await acquired.dispose();
  }
}
