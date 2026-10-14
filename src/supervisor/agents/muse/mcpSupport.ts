import type { ProjectLocation, ResolvedMcpServer } from "@/shared/contracts";
import { prepareAgentLocationEnvironment, readAgentCommandOutput } from "../base";
import { resolveAgentBinaryPath } from "../binaryResolver";
import { museDetectionSpec, museHelpSupportsConfigFlag } from "./detection";
import { buildMuseTerminalMcpLaunch } from "./mcpLaunch";

/**
 * Check the binary in the launch cwd, including WSL and project shell setup.
 * Discovery can finish in another target or still be refreshing a cached status;
 * rechecking at each process launch also handles an independently updated CLI.
 */
export async function buildMuseTerminalMcpForLocation(
  location: ProjectLocation,
  servers: readonly ResolvedMcpServer[],
) {
  if (servers.length === 0) return { binary: "muse", ...buildMuseTerminalMcpLaunch([]) };
  await prepareAgentLocationEnvironment(location);
  const binary = resolveAgentBinaryPath(location, "muse") ?? "muse";
  const help = await readAgentCommandOutput(location, binary, ["--help"], {
    timeoutMs: 8_000,
    ...(museDetectionSpec.baseSpawnEnv ? { env: museDetectionSpec.baseSpawnEnv } : {}),
  }).catch(() => undefined);
  const supported = help?.ok && museHelpSupportsConfigFlag(`${help.stdout}\n${help.stderr}`);
  return { binary, ...buildMuseTerminalMcpLaunch(supported ? servers : []) };
}
