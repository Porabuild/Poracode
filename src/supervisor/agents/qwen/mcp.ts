import type { ProjectLocation, ResolvedMcpServer } from "@/shared/contracts";
import { stageLaunchFiles } from "../base/launchFiles";
import { buildGeminiMcpServers } from "../userMcp";

export async function qwenMcpLaunch(
  location: ProjectLocation,
  servers: readonly ResolvedMcpServer[] = [],
) {
  if (!servers.length) return { args: [] as string[] };
  const files = await stageLaunchFiles(location, "qwen-mcp", {
    "mcp.json": JSON.stringify({ mcpServers: buildGeminiMcpServers(servers) }),
  });
  return { args: ["--mcp-config", `${files.directory}/mcp.json`], cleanup: files.cleanup };
}
