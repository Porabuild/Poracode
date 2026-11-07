import type { ProjectLocation, ResolvedMcpServer } from "@/shared/contracts";
import { buildAgentCommand, readCommandOutputAsync } from "../base";
import { resolveCodexWindowsLaunchBinary } from "./windowsExecutable";

/**
 * Let Codex resolve its own config layers, trust and account home. Inspecting
 * config.toml ourselves would miss managed/project settings or disable an entry
 * from a project config Codex did not trust. This command never connects to MCPs.
 */
export async function readCodexNativeMcpNames(
  location: ProjectLocation,
  servers: readonly ResolvedMcpServer[],
  env?: Record<string, string>,
  executablePath?: string,
): Promise<readonly string[]> {
  if (servers.length === 0) return [];
  const command = buildAgentCommand(
    location,
    "codex",
    ["mcp", "list", "--json"],
    resolveCodexWindowsLaunchBinary(location) ?? executablePath,
    env,
  );
  const result = await readCommandOutputAsync(command.command, command.args, {
    ...(command.cwd ? { cwd: command.cwd } : {}),
    ...(command.env ? { env: command.env } : {}),
  });
  // Native output may contain credentials. Never include it in diagnostics.
  if (result.ok) {
    // Login shells (especially WSL) may print rc banners before exec. Accept
    // only a complete array at a line boundary through the end of stdout.
    for (const match of result.stdout.matchAll(/(?:^|\n)[\t ]*(?=\[)/gu)) {
      try {
        const entries: unknown = JSON.parse(result.stdout.slice(match.index).trimStart());
        if (
          Array.isArray(entries) &&
          entries.every(
            (entry: unknown) =>
              entry !== null &&
              typeof entry === "object" &&
              "name" in entry &&
              typeof entry.name === "string",
          )
        ) {
          return entries.map((entry: { name: string }) => entry.name);
        }
      } catch {
        // A banner can also begin with '['; continue to the actual document.
      }
    }
  }
  throw new Error("Unable to read Codex MCP configuration before launch.");
}
