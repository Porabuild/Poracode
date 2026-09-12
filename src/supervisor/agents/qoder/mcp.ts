import type { ProjectLocation, ResolvedMcpServer } from "@/shared/contracts";
import { stageLaunchFiles } from "../base/launchFiles";
import { buildStandardMcpConfig } from "../userMcp/standardConfig";

export function qoderMcpLaunch(
  location: ProjectLocation,
  servers: readonly ResolvedMcpServer[] = [],
) {
  if (!servers.length) return { args: [] as string[] };
  const files = stageLaunchFiles(location, "qoder-mcp", {
    "mcp.json": JSON.stringify(buildStandardMcpConfig(servers)),
  });
  return { args: ["--mcp-config", `${files.directory}/mcp.json`], cleanup: files.cleanup };
}
