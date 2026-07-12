import { rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type NpxDistribution = { package: string; args?: string[] | undefined };

/** Temporary override until the ACP registry stops publishing Droid's broken daemon mode. */
export function applyAcpRegistryNpxArgsOverride(agentId: string, args: string[]): string[] {
  if (agentId !== "factory-droid") return args;
  const outputFormatIndex = args.indexOf("--output-format");
  if (args[outputFormatIndex + 1] !== "acp-daemon") return args;
  const next = [...args];
  next[outputFormatIndex + 1] = "acp";
  return next;
}

/**
 * argv for a lightweight `npx` prefetch that warms the package cache.
 *
 * Must align with how the agent is launched. A bare `--help` on the package
 * root breaks CLIs that only expose subcommands (e.g. `droid exec …`) and can
 * leave a corrupted `_npx` cache entry on Windows.
 */
export function buildNpxPrefetchArgs(dist: NpxDistribution): string[] {
  const launchArgs = dist.args ?? [];
  if (launchArgs[0] === "exec") {
    return ["-y", dist.package, "exec", "--help"];
  }
  if (launchArgs.length > 0) {
    return ["-y", dist.package, ...launchArgs, "--help"];
  }
  return ["-y", dist.package, "--help"];
}

export function isNpxCacheCorruptionError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return (
    /npm-cache[\\/]_npx/i.test(text) &&
    (/ENOENT/i.test(text) || /Could not read package\.json/i.test(text))
  );
}

/** Best-effort: remove broken `npx` execution cache dirs so the next run can re-fetch. */
export function clearNpxExecutionCache(): void {
  const base = process.env.LOCALAPPDATA ?? process.env.APPDATA ?? homedir();
  rmSync(join(base, "npm-cache", "_npx"), { recursive: true, force: true });
}
