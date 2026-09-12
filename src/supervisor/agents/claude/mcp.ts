import type { ProjectLocation, ResolvedMcpServer } from "@/shared/contracts";
import { stageLaunchFiles } from "../base/launchFiles";
import { buildClaudeMcpServers } from "../userMcp";

export function claudeMcpLaunch(
  location: ProjectLocation,
  servers: readonly ResolvedMcpServer[] = [],
) {
  if (!servers.length) return { args: [] as string[] };
  const files = stageLaunchFiles(location, "claude-mcp", {
    "mcp.json": JSON.stringify({ mcpServers: buildClaudeMcpServers(servers) }),
  });
  return { args: ["--mcp-config", `${files.directory}/mcp.json`, "--"], cleanup: files.cleanup };
}
