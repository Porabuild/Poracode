import type { ProjectLocation, ResolvedMcpServer } from "@/shared/contracts";
import { stageLaunchHelper } from "../base/launchHelper";

export function piMcpLaunch(
  location: ProjectLocation,
  servers: readonly ResolvedMcpServer[] = [],
): {
  args: string[];
  env?: Record<string, string>;
  cleanup?: () => void;
} {
  if (!servers.length) return { args: [] };
  const helper = stageLaunchHelper(location, "pi-mcp-extension.mjs", "pi-mcp");
  return {
    args: ["--extension", helper.path],
    env: {
      PORACODE_PI_MCP: Buffer.from(JSON.stringify({ version: 1, servers })).toString("base64url"),
    },
    ...(helper.cleanup ? { cleanup: helper.cleanup } : {}),
  };
}
