import type { ProjectLocation, ResolvedMcpServer } from "@/shared/contracts";
import { stageLaunchFiles } from "../base/launchFiles";
import { buildStandardMcpConfig } from "../userMcp/standardConfig";

/** Cursor's native plugin loader provides the session-local MCP config seam. */
export function cursorMcpLaunch(
  location: ProjectLocation,
  servers: readonly ResolvedMcpServer[] = [],
) {
  if (!servers.length) return { args: [] as string[] };
  const files = stageLaunchFiles(location, "cursor-mcp", {
    ".cursor-plugin/plugin.json": JSON.stringify({ name: "poracode-mcp", version: "1.0.0" }),
    "mcp.json": JSON.stringify(buildStandardMcpConfig(servers)),
  });
  return { args: ["--plugin-dir", files.directory], cleanup: files.cleanup };
}
