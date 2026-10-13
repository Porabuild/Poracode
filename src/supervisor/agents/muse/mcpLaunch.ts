import type { ResolvedMcpServer } from "@/shared/contracts";
import { envIdentityHash, envLabel, mcpSettingsServerName } from "../userMcp/identity";
import { buildMuseSettingsMcpServer } from "./mcpSettings";

/**
 * Muse addresses one MCP server per `-c mcpServers.<name>` key, so a
 * provider-visible name must be a single settings path segment. Keep the
 * namespace readable and add a stable suffix only when normalization is
 * needed (using the shared settings-name identity rule).
 */
export const museMcpServerName = mcpSettingsServerName;

export type MuseMspMcpServerConfig =
  | {
      transport: "stdio";
      command: string;
      args?: string[];
      env?: Record<string, string>;
      mode: "optional";
    }
  | {
      transport: "streamableHttp";
      url: string;
      headers?: Record<string, string>;
      mode: "optional";
    };

/**
 * Project Poracode's provider-neutral MCP descriptors into the MSP
 * `session/start` / `session/resume` `config.mcpServers` shape (closed
 * stdio|streamableHttp union, so SSE servers are skipped). Values travel
 * literally over the host's private stdio wire. Muse has no per-server
 * timeout, cwd, or tool-filter field, so those stay behind. Servers are
 * `optional`: one unreachable server must not fail the turn, matching the
 * tolerant launch behavior of the other providers.
 */
export function buildMuseMspMcpServers(
  servers: readonly ResolvedMcpServer[],
): Record<string, MuseMspMcpServerConfig> {
  const result: Record<string, MuseMspMcpServerConfig> = {};
  for (const server of servers) {
    const transport = server.transport;
    if (transport.type === "stdio") {
      result[museMcpServerName(server)] = {
        transport: "stdio",
        command: transport.command,
        ...(transport.args.length > 0 ? { args: transport.args } : {}),
        ...(Object.keys(transport.env).length > 0 ? { env: transport.env } : {}),
        mode: "optional",
      };
    } else if (transport.type === "http") {
      result[museMcpServerName(server)] = {
        transport: "streamableHttp",
        url: transport.url,
        ...(Object.keys(transport.headers).length > 0 ? { headers: transport.headers } : {}),
        mode: "optional",
      };
    }
  }
  return result;
}

function museMcpEnvVar(
  server: Pick<ResolvedMcpServer, "id" | "name">,
  kind: "ENV" | "HEADER",
  key: string,
): string {
  return `PORACODE_MCP_MUSE_${envLabel(server.name, "SERVER")}_${envIdentityHash(server.name, server.id)}_${kind}_${envLabel(key, "VALUE")}_${envIdentityHash(kind, key)}`;
}

export interface MuseTerminalMcpLaunch {
  args: string[];
  env: Record<string, string>;
}

/**
 * Build the terminal launch `-c mcpServers.<name>=<settings JSON>` flags.
 * Muse refuses literal secret leaves in `-c` values (header and stdio env
 * values alike), so every such value rides in the child process env and the
 * flag carries a whole-value `${VAR}` reference the CLI expands. The
 * settings shape mirrors the native-setup file (`streamable_http`), minus
 * the fields Muse cannot express (timeout, cwd, tool filters); SSE is
 * skipped as unsupported.
 */
export function buildMuseTerminalMcpLaunch(
  servers: readonly ResolvedMcpServer[],
): MuseTerminalMcpLaunch {
  const args: string[] = [];
  const env: Record<string, string> = {};
  const secretRefs = (
    server: ResolvedMcpServer,
    kind: "ENV" | "HEADER",
    values: Record<string, string>,
  ): Record<string, string> =>
    Object.fromEntries(
      Object.entries(values).map(([key, value]) => {
        const envVar = museMcpEnvVar(server, kind, key);
        env[envVar] = value;
        return [key, `\${${envVar}}`];
      }),
    );

  for (const server of servers) {
    const transport = server.transport;
    if (transport.type === "sse") continue;
    const name = museMcpServerName(server);
    const settings = buildMuseSettingsMcpServer(
      transport.type === "stdio"
        ? { ...transport, env: secretRefs(server, "ENV", transport.env) }
        : { ...transport, headers: secretRefs(server, "HEADER", transport.headers) },
    );
    args.push("-c", `mcpServers.${name}=${JSON.stringify({ ...settings, mode: "optional" })}`);
  }
  return { args, env };
}
