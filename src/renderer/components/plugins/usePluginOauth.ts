import { useEffect, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import type { LoadedPlugin, McpServer } from "@/shared/contracts";
import { DEFAULT_MCP_SERVER_TIMEOUT_MS } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { pluginMcpServerId, pluginMcpServerName } from "@/shared/plugins/catalog";

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
  // Must match what `pluginMcpRuntime.buildTransport` launches: the token store
  // is keyed on the exact URL string.
  return entry.type === "stdio" ? undefined : entry.url.trim();
}

/**
 * Mirrors the record `pluginMcpRuntime` builds so the supervisor authorizes the
 * same server. `McpOAuthService.begin` only reads `transport.url`, but the
 * transport kind and headers are carried through so the two sides cannot drift.
 */
function toMcpServer(
  plugin: LoadedPlugin,
  declaration: LoadedPlugin["mcpServers"][number],
  url: string,
): McpServer {
  const entry = declaration.entry;
  return {
    id: pluginMcpServerId(plugin.name, declaration.name),
    name: pluginMcpServerName(plugin.name, declaration.name),
    description: plugin.manifest.description ?? "",
    enabled: true,
    timeoutMs: DEFAULT_MCP_SERVER_TIMEOUT_MS,
    transport: {
      type: entry.type === "streamable-http" ? "http" : "sse",
      url,
      headers: entry.type === "stdio" ? {} : { ...entry.headers },
    },
  };
}

export function usePluginOauth(plugin: LoadedPlugin) {
  const { t } = useLingui();
  const [authorizedUrls, setAuthorizedUrls] = useState<string[]>();
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState<string>();

  const refresh = async () => {
    try {
      const status = await readBridge().getMcpOauthStatus({});
      setAuthorizedUrls(status.authenticatedUrls);
    } catch {
      // Leave the state unknown rather than claiming a server is disconnected.
      setAuthorizedUrls(undefined);
    }
  };

  const hasRemoteServer = plugin.mcpServers.some((server) => remoteServerUrl(server.entry));

  useEffect(() => {
    if (hasRemoteServer) void refresh();
    // `refresh` only closes over setState, which is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRemoteServer]);

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
    if (!server || !url) return;
    setPending(serverName);
    setError(undefined);
    try {
      const bridge = readBridge();
      const begin = await bridge.beginMcpServerOauth({
        server: toMcpServer(plugin, server, url),
      });
      if (begin.status === "error") {
        setError(t`Could not sign in to ${serverName}.`);
        return;
      }
      if (begin.status === "redirect") {
        await bridge.openExternalNative(begin.authorizationUrl);
        const result = await bridge.waitMcpServerOauth({ flowId: begin.flowId });
        if (result.status === "error") {
          setError(t`Could not sign in to ${serverName}.`);
          return;
        }
      }
      await refresh();
    } catch {
      setError(t`Could not sign in to ${serverName}.`);
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
    } catch {
      setError(t`Could not sign out of ${serverName}.`);
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
