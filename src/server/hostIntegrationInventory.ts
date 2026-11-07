import type { McpServer } from "@/shared/contracts/mcpServer";
import type { InstalledPlugins, LoadedPlugin } from "@/shared/contracts/plugin";
import { isPluginSupportedOnHost, resolveInstalledPluginState } from "@/shared/plugins/catalog";
import {
  hostAdminMcpInspectionSchema,
  hostAdminMcpSummarySchema,
  hostAdminPluginInventorySchema,
  HOST_ADMIN_INVENTORY_FORMAT_VERSION,
} from "@/shared/hostAdminProtocol";

export function summarizePluginInventory(
  plugins: readonly LoadedPlugin[],
  installed: InstalledPlugins,
) {
  return hostAdminPluginInventorySchema.parse({
    formatVersion: HOST_ADMIN_INVENTORY_FORMAT_VERSION,
    scope: "global",
    plugins: plugins.map((plugin) => {
      const state = resolveInstalledPluginState(plugin, installed);
      return {
        name: plugin.name,
        version: plugin.manifest.version ?? null,
        source: plugin.source,
        installed: state !== undefined,
        enabled: state?.enabled === true,
        hostSupported: isPluginSupportedOnHost(plugin, process.platform),
        skillCount: plugin.skills.length,
        mcpServerNames: plugin.mcpServers.map((server) => server.name),
        errorCount: plugin.diagnostics.filter((diagnostic) => diagnostic.severity === "error")
          .length,
        warningCount: plugin.diagnostics.filter((diagnostic) => diagnostic.severity === "warning")
          .length,
      };
    }),
  });
}

export function summarizeMcpServer(server: McpServer) {
  return hostAdminMcpSummarySchema.parse({
    id: server.id,
    name: server.name,
    enabled: server.enabled,
    transport: server.transport.type,
    timeoutMs: server.timeoutMs,
    disabledToolCount: server.disabledTools?.length ?? 0,
  });
}

export function requireSavedMcpServer(servers: readonly McpServer[], serverId: string): McpServer {
  const matches = servers.filter((server) => server.id === serverId);
  if (!matches.length)
    throw new Error("Saved MCP server not found. Run mcp list; use its exact ID, not its name.");
  if (matches.length !== 1)
    throw new Error(
      "More than one saved MCP server uses this ID. Repair duplicate IDs in the saved configuration; no server was selected.",
    );
  return matches[0]!;
}

export function inspectSavedMcpServer(servers: readonly McpServer[], serverId: string) {
  const server = requireSavedMcpServer(servers, serverId);
  return hostAdminMcpInspectionSchema.parse({
    formatVersion: HOST_ADMIN_INVENTORY_FORMAT_VERSION,
    scope: "saved-user",
    server: {
      ...summarizeMcpServer(server),
      environmentNames: server.transport.type === "stdio" ? Object.keys(server.transport.env) : [],
      headerNames: server.transport.type === "stdio" ? [] : Object.keys(server.transport.headers),
      disabledTools: server.disabledTools ?? [],
    },
  });
}
