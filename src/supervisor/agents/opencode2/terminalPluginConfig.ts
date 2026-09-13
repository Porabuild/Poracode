import { readFile } from "node:fs/promises";
import { join, posix } from "node:path";
import JSON5 from "json5";
import type { AgentPluginPackage, ProjectLocation } from "@/shared/contracts";
import { toWslUncPath } from "@/shared/wsl";
import { readAgentCommandOutput } from "../base";
import { OPENCODE2_ENV } from "./binary";

/** The native HTTP catalog excludes packages configured only in cli.json. */
export function readTerminalPluginTargets(text: string): string[] {
  const config: unknown = JSON5.parse(text);
  if (!config || typeof config !== "object" || Array.isArray(config))
    throw new Error("Invalid terminal configuration.");
  const entries = "plugins" in config ? config.plugins : [];
  if (!Array.isArray(entries)) throw new Error("Invalid terminal plugins configuration.");
  return [
    ...new Set(
      entries.flatMap((entry: unknown) => {
        const target =
          typeof entry === "string"
            ? entry
            : entry && typeof entry === "object" && "package" in entry
              ? entry.package
              : undefined;
        // Control rules and local plugins are not package-manager targets.
        return typeof target === "string" &&
          !/^(?:[-.*/]|file:|[A-Za-z]:[\\/])/.test(target) &&
          !target.endsWith(".*")
          ? [target]
          : [];
      }),
    ),
  ];
}

export async function readOpenCode2TerminalPackages(
  location: ProjectLocation,
  binary: string,
): Promise<AgentPluginPackage[]> {
  const result = await readAgentCommandOutput(location, binary, ["debug", "paths", "config"], {
    env: OPENCODE2_ENV,
    timeoutMs: 10_000,
  });
  if (!result.ok || !result.stdout.trim())
    throw new Error("Could not find the native plugin configuration.");
  const directory = result.stdout.trim();
  const file =
    location.kind === "wsl"
      ? toWslUncPath(location.distro, posix.join(directory, "cli.json"))
      : join(directory, "cli.json");
  const text = await readFile(file, "utf8").catch((error: unknown) => {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
      return "{}";
    throw error;
  });
  return readTerminalPluginTargets(text).map((target) => ({
    target,
    status: "configured",
    outdated: false,
    server: false,
    terminal: true,
  }));
}
