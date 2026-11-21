import type { ResolvedMcpServer } from "@/shared/contracts";
import type { McpAddInput } from "./clientTypes";

/**
 * Server config accepted by `client.mcp.add`, using `disabled?` and a
 * per-phase timeout object.
 */
export type OpenCodeMcpServerConfig = McpAddInput["config"];

/** OpenCode attaches this native identity to MCP calls, including Code Mode. */
export function readOpenCodeMcpSessionId(
  metadata: Readonly<Record<string, unknown>>,
): string | undefined {
  const sessionId = metadata["ai.opencode/sessionID"];
  return typeof sessionId === "string" && sessionId.length > 0 ? sessionId : undefined;
}

/**
 * Project Poracode's provider-neutral MCP descriptors into the OpenCode
 * dynamic `mcp.add` shape.
 *
 * Poracode's single per-server `timeoutMs` maps to the `execution` phase — it
 * is the tool-call budget the user configures, and the startup/catalog phases
 * are better left on the server's own defaults. The TimeoutConfig unit is
 * milliseconds (`DEFAULT_MCP_SERVER_TIMEOUT_MS = 30_000`).
 */
export function buildOpenCodeMcpServers(
  servers: readonly ResolvedMcpServer[],
): Record<string, OpenCodeMcpServerConfig> {
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
