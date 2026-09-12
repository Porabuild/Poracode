import type { ProjectLocation } from "@/shared/contracts";
import {
  extractSemverFromVersionOutput,
  readAgentCommandOutput,
  resolveExecutablePathAsync,
} from "../base";
import { resolveAgentBinaryPath } from "../binaryResolver";

const resolved = new Map<string, string>();
/** Version learned while accepting the binary above, keyed by the same scope. */
const resolvedVersions = new Map<string, string>();
const scope = (location: ProjectLocation) =>
  location.kind === "wsl" ? `wsl:${location.distro}` : location.kind;

function normalizeInstallPath(path: string): string {
  return path.replaceAll("\\", "/");
}

/** OpenCode 1 is the 1.x CLI (`opencode-ai`). 2.x and V2 betas are OpenCode 2. */
export function isOpenCode1CliVersion(version: string | undefined): boolean {
  if (!version) return false;
  return /^1\.\d+/.test(version.replace(/^v/i, ""));
}

/**
 * Paths that belong to the OpenCode 2 npm layout even if `--version` is
 * unavailable. V1 must not claim the managed `~/.opencode2` prefix or
 * `@opencode/cli` package binaries.
 */
export function isOpenCode2ForeignInstallPath(path: string | undefined): boolean {
  if (!path) return false;
  const normalized = normalizeInstallPath(path);
  return /(?:^|\/)\.opencode2(?:\/|$)/.test(normalized) || /\/@opencode\/cli\//.test(normalized);
}

export function acceptOpenCode1Binary(
  path: string | undefined,
  version: string | undefined,
): boolean {
  if (!path || isOpenCode2ForeignInstallPath(path)) return false;
  return isOpenCode1CliVersion(version);
}

export function cachedOpenCode1Binary(location: ProjectLocation): string | undefined {
  return resolved.get(scope(location));
}

/**
 * Version reported by the binary `resolveOpenCode1Binary` accepted. Lets
 * detection reuse that `--version` result instead of spawning the CLI again.
 */
export function cachedOpenCode1Version(location: ProjectLocation): string | undefined {
  return resolvedVersions.get(scope(location));
}

export function clearOpenCode1BinaryCache(): void {
  resolved.clear();
  resolvedVersions.clear();
}

export async function resolveOpenCode1Binary(
  location: ProjectLocation,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const candidates: Array<string | undefined> = [];
  if (location.kind === "wsl") {
    const script = [
      "path=$(command -v opencode 2>/dev/null || true)",
      'if [ -z "$path" ]; then exit; fi',
      'case "$path" in *.opencode2/*|*@opencode/cli*) exit ;; esac',
      'printf "%s\\n" "$path"',
    ].join("; ");
    const result = await readAgentCommandOutput(location, "sh", ["-c", script], {
      ...(signal ? { signal } : {}),
    });
    const found = result.ok ? result.stdout.trim().split(/\r?\n/).at(-1) : undefined;
    candidates.push(found?.startsWith("/mnt/") ? undefined : found);
  } else {
    candidates.push(
      await resolveExecutablePathAsync("opencode"),
      resolveAgentBinaryPath(location, "opencode"),
    );
  }

  for (const raw of candidates) {
    if (!raw || isOpenCode2ForeignInstallPath(raw)) continue;
    const version = await readAgentCommandOutput(location, raw, ["--version"], {
      ...(signal ? { signal } : {}),
      timeoutMs: 10_000,
    });
    const parsed = extractSemverFromVersionOutput(version.stdout);
    if (!version.ok || !acceptOpenCode1Binary(raw, parsed)) continue;
    resolved.set(scope(location), raw);
    if (parsed) resolvedVersions.set(scope(location), parsed);
    return raw;
  }
  return undefined;
}
