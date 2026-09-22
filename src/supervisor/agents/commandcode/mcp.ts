import type { ProjectLocation, ResolvedMcpServer } from "@/shared/contracts";
import { stageLaunchHelper } from "../base/launchHelper";

export async function commandCodeMcpLaunch(
  location: ProjectLocation,
  servers: readonly ResolvedMcpServer[] = [],
): Promise<{ args: string[]; env?: Record<string, string>; cleanup?: () => Promise<void> }> {
  if (!servers.length) return { args: [] };
  const helper = await stageLaunchHelper(location, "commandcode-mcp-mod.mjs", "commandcode");
  return {
    args: ["--mod", helper.path],
    env: {
      PORACODE_COMMANDCODE_MCP: Buffer.from(JSON.stringify({ version: 1, servers })).toString(
        "base64url",
      ),
    },
    ...(helper.cleanup ? { cleanup: helper.cleanup } : {}),
  };
}
