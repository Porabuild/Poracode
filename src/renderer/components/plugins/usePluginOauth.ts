import { useCallback, useEffect, useState } from "react";
import type { LoadedPlugin, McpServer } from "@/shared/contracts";
import { DEFAULT_MCP_SERVER_TIMEOUT_MS } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";

/**
 * Connection state for a plugin's remote MCP servers.
 *
 * Remote servers a package declares in `mcp.json` are authorized through the
 * same OAuth 2.1 flow already used for user-configured MCP servers
 * (`src/supervisor/mcp/McpOAuthService.ts`). The supervisor owns the loopback
 * redirect listener and the sealed token store; the renderer only ever sees the
 * authorization URL and a connected flag.
 */

type ConnectionState = "unknown" | "connected" | "disconnected" | "connecting";

function remoteServerUrl(entry: LoadedPlugin["mcpServers"][number]["entry"]): string | undefined {
  return entry.type === "stdio" ? undefined : entry.url;
}

/** Mirrors the shape `pluginMcpRuntime` builds, so the supervisor authorizes the same server. */
function toMcpServer(plugin: LoadedPlugin, serverName: string, url: string): McpServer {
  return {
    id: `plugin:${plugin.name}:${serverName}`,
    name: `${plugin.name}.${serverName}`,
    description: plugin.manifest.description ?? "",
    enabled: true,
    timeoutMs: DEFAULT_MCP_SERVER_TIMEOUT_MS,
    transport: { type: "http", url, headers: {} },
  };
}

export function usePluginOauth(plugin: LoadedPlugin) {
  const [authorizedUrls, setAuthorizedUrls] = useState<string[]>();
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    try {
      const status = await readBridge().getMcpOauthStatus();
      setAuthorizedUrls(status.authenticatedUrls);
    } catch {
      // Leave the state unknown rather than claiming a server is disconnected.
      setAuthorizedUrls(undefined);
    }
  }, []);

  const hasRemoteServer = plugin.mcpServers.some((server) => remoteServerUrl(server.entry));

  useEffect(() => {
    if (hasRemoteServer) void refresh();
  }, [hasRemoteServer, refresh]);

  const stateFor = (serverName: string): ConnectionState => {
    const server = plugin.mcpServers.find((candidate) => candidate.name === serverName);
    const url = server ? remoteServerUrl(server.entry) : undefined;
    if (!url) return "unknown";
    if (pending === serverName) return "connecting";
    if (!authorizedUrls) return "unknown";
    return authorizedUrls.includes(url) ? "connected" : "disconnected";
  };

  const connect = async (serverName: string) => {
    const server = plugin.mcpServers.find((candidate) => candidate.name === serverName);
    const url = server ? remoteServerUrl(server.entry) : undefined;
    if (!url) return;
    setPending(serverName);
    setError(undefined);
    try {
      const bridge = readBridge();
      const begin = await bridge.beginMcpServerOauth({
        server: toMcpServer(plugin, serverName, url),
      });
      if (begin.status === "error") {
        setError(begin.message);
        return;
      }
      if (begin.status === "redirect") {
        await bridge.openExternal(begin.authorizationUrl);
        const result = await bridge.waitMcpServerOauth({ flowId: begin.flowId });
        if (result.status === "error") {
          setError(result.message);
          return;
        }
      }
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPending(undefined);
    }
  };

  const disconnect = async (serverName: string) => {
    const server = plugin.mcpServers.find((candidate) => candidate.name === serverName);
    const url = server ? remoteServerUrl(server.entry) : undefined;
    if (!url) return;
    setError(undefined);
    try {
      await readBridge().clearMcpServerOauth({ url });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  /** True for servers reached over the network, which are the ones that can be authorized. */
  const isRemoteServer = (serverName: string): boolean => {
    const server = plugin.mcpServers.find((candidate) => candidate.name === serverName);
    return server ? remoteServerUrl(server.entry) !== undefined : false;
  };

  return { stateFor, isRemoteServer, connect, disconnect, error };
}

export type PluginOauthConnectionState = ConnectionState;
