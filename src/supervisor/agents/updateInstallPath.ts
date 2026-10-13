import { realpath } from "node:fs/promises";
import type { AgentEnvContext } from "./base";
import { detectProbeLocation, readAgentCommandOutput } from "./base";

/** `command -v` often returns an npm/brew symlink; lock the installation it actually targets. */
export async function resolveUpdateInstallPath(
  executablePath: string | undefined,
  env: AgentEnvContext,
): Promise<string | undefined> {
  if (!executablePath) return undefined;
  try {
    if (env.envKind !== "wsl") return await realpath(executablePath);
    const result = await readAgentCommandOutput(
      detectProbeLocation(env),
      "readlink",
      ["-f", "--", executablePath],
      { timeoutMs: 5_000 },
    );
    return result.ok && result.stdout.trim() ? result.stdout.trim() : executablePath;
  } catch {
    return executablePath;
  }
}
