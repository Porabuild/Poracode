import type { ResolvedMcpServer } from "@/shared/contracts";
import { buildCodexMcp as translateMcp, codexMcpServerName } from "../userMcp";
import { envIdentityHash } from "../userMcp/identity";

/** Apply provider startup policy at the provider boundary, for both GUI and PTY. */
export function buildCodexMcp(
  servers: readonly ResolvedMcpServer[],
  nativeNames: readonly string[] = [],
) {
  const result = translateMcp(servers);
  const native = new Set(nativeNames);
  const reserved = new Set([...nativeNames, ...servers.map(codexMcpServerName)]);
  for (const server of servers) {
    const name = codexMcpServerName(server);
    if (!native.has(name)) continue;
    // Codex recursively merges overrides with native tables, even whole-table
    // overrides. A proxied HTTP server would inherit `url` alongside `command`.
    // Use a fresh table and disable the native duplicate only for this launch.
    const base = `poracode_${name}_${envIdentityHash(server.id, server.name).toLowerCase()}`;
    let alias = base;
    for (let suffix = 2; reserved.has(alias); suffix += 1) alias = `${base}_${suffix}`;
    reserved.add(alias);
    const key = `mcp_servers.${name}`;
    const aliasKey = `mcp_servers.${alias}`;
    result.config[aliasKey] = result.config[key];
    result.config[key] = { enabled: false };
    result.args = result.args.map((arg) =>
      arg.startsWith(`${key}.`) ? `${aliasKey}${arg.slice(key.length)}` : arg,
    );
    result.args.push("-c", `${key}.enabled=false`);
  }
  for (const [key, value] of Object.entries(result.config)) {
    // The translator constructs each entry with this numeric timeout. Native
    // optional-MCP grace still bounds the first turn independently; its later
    // connection must have the configured budget, including shared OAuth.
    const config = value as { tool_timeout_sec: number; startup_timeout_sec?: number };
    if (!("tool_timeout_sec" in config)) continue;
    config.startup_timeout_sec = config.tool_timeout_sec;
    result.args.push("-c", `${key}.startup_timeout_sec=${config.startup_timeout_sec}`);
  }
  return result;
}
