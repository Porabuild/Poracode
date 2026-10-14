import type { ProjectLocation, ResolvedMcpServer } from "@/shared/contracts";
import { stageLaunchFiles } from "../base/launchFiles";
import { buildClaudeMcpServers } from "../userMcp";

export async function claudeMcpLaunch(
  location: ProjectLocation,
  servers: readonly ResolvedMcpServer[] = [],
) {
  if (!servers.length) return { args: [] as string[] };
  const files = await stageLaunchFiles(location, "claude-mcp", {
    "mcp.json": JSON.stringify({ mcpServers: buildClaudeMcpServers(servers) }),
  });
  return { args: ["--mcp-config", `${files.directory}/mcp.json`, "--"], cleanup: files.cleanup };
}
