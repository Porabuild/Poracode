import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
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
  if (servers.length === 0 && location.kind !== "windows")
    return { binary: "muse", ...buildMuseTerminalMcpLaunch([]) };
  await prepareAgentLocationEnvironment(location);
  let binary = resolveAgentBinaryPath(location, "muse") ?? "muse";
  if (location.kind === "windows" && /(?:^|[\\/])muse\.cmd$/i.test(binary)) {
    // The official shim forwards through PowerShell 5.1, which strips JSON
    // quotes. Follow its installed-version marker instead; no updater runs.
    const directory = dirname(binary);
    const version = await readFile(join(directory, ".muse-version"), "utf8").catch(() => "");
    if (/^\d+\.\d+\.\d+-R\d+(?:\.\d+)?$/.test(version.trim())) {
      const executable = join(directory, `muse-bin-${version.trim()}.exe`);
      if (
        await stat(executable).then(
          (file) => file.isFile(),
          () => false,
        )
      )
        binary = executable;
    }
  }
  if (servers.length === 0) return { binary, ...buildMuseTerminalMcpLaunch([]) };
  const help = await readAgentCommandOutput(location, binary, ["--help"], {
    timeoutMs: 8_000,
    ...(museDetectionSpec.baseSpawnEnv ? { env: museDetectionSpec.baseSpawnEnv } : {}),
  }).catch(() => undefined);
  const supported = help?.ok && museHelpSupportsConfigFlag(`${help.stdout}\n${help.stderr}`);
  return { binary, ...buildMuseTerminalMcpLaunch(supported ? servers : []) };
}
