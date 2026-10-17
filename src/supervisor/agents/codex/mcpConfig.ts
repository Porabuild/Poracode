import type { ResolvedMcpServer } from "@/shared/contracts";
import { buildCodexMcp as translateMcp } from "../userMcp";

/** Apply provider startup policy at the provider boundary, for both GUI and PTY. */
export function buildCodexMcp(servers: readonly ResolvedMcpServer[]) {
  const result = translateMcp(servers);
  for (const [key, value] of Object.entries(result.config)) {
    // The translator constructs each entry with this numeric timeout. Native
    // optional-MCP grace still bounds the first turn independently; its later
    // connection must have the configured budget, including shared OAuth.
    const config = value as { tool_timeout_sec: number; startup_timeout_sec?: number };
    config.startup_timeout_sec = config.tool_timeout_sec;
    result.args.push("-c", `${key}.startup_timeout_sec=${config.startup_timeout_sec}`);
  }
  return result;
}
