import type { ProjectLocation } from "@/shared/contracts";
import {
  buildAgentCommand,
  prepareAgentLocationEnvironment,
  readCommandOutputAsync,
} from "../base";
import { resolveAgentBinaryPath } from "../binaryResolver";

/**
 * Ask `cursor-agent create-chat` for a pre-assigned chat id. Async and bounded
 * so a WSL launch never pins the supervisor control loop: the WSL location is
 * prepared against the shared launch-environment cache and the command runs
 * through the async child runner.
 */
export async function createCursorChat(location: ProjectLocation): Promise<string | undefined> {
  await prepareAgentLocationEnvironment(location);
  const spec = buildAgentCommand(
    location,
    "cursor-agent",
    ["create-chat"],
    resolveAgentBinaryPath(location, "cursor-agent"),
  );
  try {
    const result = await readCommandOutputAsync(spec.command, spec.args, {
      ...(spec.cwd ? { cwd: spec.cwd } : {}),
      timeout: 15_000,
    });
    if (result.ok && result.stdout.length > 0) {
      return result.stdout;
    }
  } catch {
    // Fall through — launch without a pre-assigned session
  }
  return undefined;
}
