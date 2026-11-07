import { createHmac, timingSafeEqual } from "node:crypto";
import type { z } from "zod";
import type { HostControlContext } from "@/backend/ownership/HostControlServer";
import { mcpOauthStatusResultSchema } from "@/shared/contracts/mcpServer";
import { pluginAccountsResultSchema } from "@/shared/contracts/pluginCatalog";
import type { SharedSettings } from "@/shared/settings";
import {
  HOST_ADMIN_INTEGRATION_ACCOUNT_FORMAT_VERSION,
  hostAdminMcpAuthLogoutSchema,
  hostAdminMcpAuthStatusSchema,
  hostAdminPluginAccountsSchema,
  type hostAdminV10CommandSchema,
} from "@/shared/hostAdminProtocol";
import { requireSavedMcpServer, summarizeMcpServer } from "./hostIntegrationInventory";
import type { AdminSupervisorCall } from "./hostProviderAuth";

export function selectMcpAuthenticationTarget(
  servers: SharedSettings["mcpServers"],
  serverId: string,
  revisionKey: Uint8Array,
) {
  const server = requireSavedMcpServer(servers, serverId);
  if (server.transport.type === "stdio")
    throw new Error(
      "This saved MCP server uses stdio. OAuth applies only to HTTP or SSE servers; provider accounts are separate.",
    );
  const transport = server.transport;
  const sharedServerIds = [
    ...new Set(
      servers
        .filter(
          (candidate) =>
            candidate.transport.type !== "stdio" && candidate.transport.url === transport.url,
        )
        .map((candidate) => candidate.id),
    ),
  ].sort();
  const serverRevision = createHmac("sha256", revisionKey)
    .update("mcp-auth-v1\0")
    .update(JSON.stringify({ server, sharedServerIds }))
    .digest("hex");
  return {
    server: { ...server, transport },
    sharedServerIds,
    serverRevision,
    headerAuthorization: Object.keys(transport.headers).some(
      (name) => name.toLowerCase() === "authorization",
    ),
  };
}

export async function administerIntegrationAccounts(
  input: z.infer<typeof hostAdminV10CommandSchema>,
  context: HostControlContext,
  options: {
    call: AdminSupervisorCall;
    readSettings(): SharedSettings;
    revisionKey: Uint8Array;
    assertCanPersistSecrets(): void;
  },
): Promise<unknown> {
  context.assertActive();
  const formatVersion = HOST_ADMIN_INTEGRATION_ACCOUNT_FORMAT_VERSION;
  if ("pluginName" in input) {
    const operation =
      input.action === "plugin-accounts-list"
        ? "list"
        : input.action === "plugin-account-select"
          ? "select"
          : "logout";
    if (operation !== "list") options.assertCanPersistSecrets();
    const payload =
      input.action === "plugin-accounts-list"
        ? { action: "list" as const, pluginName: input.pluginName }
        : {
            action: operation as "select" | "logout",
            pluginName: input.pluginName,
            serverName: input.serverName,
            accountId: input.accountId,
          };
    const result = pluginAccountsResultSchema.parse(await options.call("pluginAccounts", payload));
    context.assertActive();
    if (result.accounts.some((account) => account.pluginName !== input.pluginName))
      throw new Error(
        "The supervisor returned a different plugin account inventory; no accounts were printed.",
      );
    return hostAdminPluginAccountsSchema.parse({
      formatVersion,
      scope: "plugin-service-accounts",
      pluginName: input.pluginName,
      operation,
      accounts: result.accounts,
    });
  }
  const { server, sharedServerIds, serverRevision, headerAuthorization } =
    selectMcpAuthenticationTarget(
      options.readSettings().mcpServers,
      input.serverId,
      options.revisionKey,
    );
  const url = server.transport.url;
  if (input.action === "mcp-auth-status") {
    const status = mcpOauthStatusResultSchema.parse(await options.call("getMcpOauthStatus", {}));
    context.assertActive();
    if (
      selectMcpAuthenticationTarget(
        options.readSettings().mcpServers,
        input.serverId,
        options.revisionKey,
      ).serverRevision !== serverRevision
    )
      throw new Error(
        "The selected MCP definition changed while reading authentication status. Retry mcp auth status; no metadata was printed.",
      );
    return hostAdminMcpAuthStatusSchema.parse({
      formatVersion,
      scope: "saved-user-oauth",
      server: summarizeMcpServer(server),
      usableCredentials: status.authenticatedUrls.includes(url),
      headerAuthorization,
      sharedServerIds,
      serverRevision,
    });
  }
  if (
    !timingSafeEqual(
      Buffer.from(input.expectedServerRevision, "hex"),
      Buffer.from(serverRevision, "hex"),
    )
  )
    throw new Error(
      "The selected MCP definition changed. No credentials were cleared; review mcp auth status and retry logout.",
    );
  options.assertCanPersistSecrets();
  context.assertActive();
  await options.call("clearMcpServerOauth", { url });
  context.assertActive();
  return hostAdminMcpAuthLogoutSchema.parse({
    formatVersion,
    scope: "saved-user-oauth",
    serverId: server.id,
    loggedOut: true,
    headerAuthorization,
    sharedServerIds,
  });
}
