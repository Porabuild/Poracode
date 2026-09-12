import type { ResolvedMcpServer } from "@/shared/contracts";
import type { McpAddInput } from "./clientTypes";

/**
 * Server config accepted by `client.mcp.add`. Same `local`/`remote` split as
 * OpenCode 1's config format, but V2 replaces the flat `enabled: true` /
 * `timeout: <ms>` pair with `disabled?` and a per-phase timeout object.
 */
export type OpenCode2McpServerConfig = McpAddInput["config"];

/**
 * Project Poracode's provider-neutral MCP descriptors into the OpenCode 2
 * dynamic `mcp.add` shape. Kept provider-owned (rather than an option on the
 * shared `buildOpenCodeMcp`) because the config form differs structurally from
 * OpenCode 1's: the enabled flag is inverted and the timeout is per-phase.
 *
 * Poracode's single per-server `timeoutMs` maps to the `execution` phase — it
 * is the tool-call budget the user configures, and the startup/catalog phases
 * are better left on the server's own defaults. The TimeoutConfig unit is
 * milliseconds by config lineage: V2 inherits the V1 MCP config format (where
 * `timeout` was ms), and Poracode's own `timeoutMs` contract is ms too
 * (`DEFAULT_MCP_SERVER_TIMEOUT_MS = 30_000`).
 */
export function buildOpenCode2McpServers(
  servers: readonly ResolvedMcpServer[],
): Record<string, OpenCode2McpServerConfig> {
  return Object.fromEntries(
    servers.map((server) => {
      const transport = server.transport;
      const timeout = { execution: server.timeoutMs };
      if (transport.type === "stdio") {
        return [
          server.name,
          {
            type: "local" as const,
            command: [transport.command, ...transport.args],
            ...(transport.cwd ? { cwd: transport.cwd } : {}),
            ...(Object.keys(transport.env).length > 0 ? { environment: transport.env } : {}),
            timeout,
          },
        ];
      }
      // V2 has a single "remote" form: HTTP and SSE both travel as a URL.
      return [
        server.name,
        {
          type: "remote" as const,
          url: transport.url,
          ...(Object.keys(transport.headers).length > 0 ? { headers: transport.headers } : {}),
          timeout,
        },
      ];
    }),
  );
}
