import type { ResolvedMcpServer } from "@/shared/contracts";

/** Common named MCP config dialect: explicit transport type, URL/command, env and cwd. */
export function buildStandardMcpConfig(servers: readonly ResolvedMcpServer[]) {
  return {
    mcpServers: Object.fromEntries(
      servers.map((server) => [
        server.name,
        {
          ...server.transport,
          timeout: server.timeoutMs,
        },
      ]),
    ),
  };
}
