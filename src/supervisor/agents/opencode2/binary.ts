import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { ProjectLocation } from "@/shared/contracts";
import { readAgentCommandOutput, resolveExecutablePathAsync } from "../base";
import { resolveAgentBinaryPath } from "../binaryResolver";

/** First beta with per-session permission rules used by this adapter. */
export const OPENCODE2_MIN_BETA = 19500;
/** Keep V2's schema out of the V1 database while retaining shared credentials/config. */
export const OPENCODE2_ENV = { OPENCODE_DB: "opencode-v2.db" };

const OPENCODE2_STUB = /opencode2\.(?:cjs|cmd|ps1)$/;

function normalizeInstallPath(path: string): string {
  return path.replaceAll("\\", "/");
}

/** V1 npm layout (`opencode-ai`). Never treat those binaries as OpenCode 2. */
export function isOpenCode1PackagePath(path: string | undefined): boolean {
  if (!path) return false;
  const normalized = normalizeInstallPath(path);
  return /\/opencode-ai\//.test(normalized) && !/\/@opencode\//.test(normalized);
}

export function parseOpenCode2Version(output: string): string | undefined {
  return /\bv?(0\.0\.0-beta-\d+|2\.\d+\.\d+(?:-[\w.-]+)?)\b/.exec(output)?.[1];
}

export function supportsOpenCode2Version(version: string | undefined): boolean {
  if (!version) return false;
  const beta = /^0\.0\.0-beta-(\d+)$/.exec(version);
  return beta ? Number(beta[1]) >= OPENCODE2_MIN_BETA : /^2\.\d+\.\d+$/.test(version);
}

export function requireOpenCode2Version(version: string | undefined): void {
  if (!supportsOpenCode2Version(version))
    throw new Error(
      `OpenCode 2 ${version ?? "unknown"} is unsupported. Update OpenCode 2 to 2.0.0 or newer in provider settings.`,
    );
}

export function acceptOpenCode2Binary(
  path: string | undefined,
  version: string | undefined,
): boolean {
  if (!path || isOpenCode2Stub(path) || isOpenCode1PackagePath(path)) return false;
  return supportsOpenCode2Version(version);
}

function resolvedBasename(path: string): string {
  try {
    return basename(realpathSync(path));
  } catch {
    return basename(path);
  }
}

/** npm's `opencode2` entry is a stub that prints a rename message and exits 1. */
export function isOpenCode2Stub(path: string): boolean {
  return OPENCODE2_STUB.test(resolvedBasename(path));
}

const resolved = new Map<string, string>();
const scope = (location: ProjectLocation) =>
  location.kind === "wsl" ? `wsl:${location.distro}` : location.kind;

export function managedOpenCode2Binary(): string {
  return join(homedir(), ".opencode2", "node_modules", "@opencode", "cli", "bin", "opencode.exe");
}

/** 2.0.0 leaves `opencode2` as a migration stub beside the real `opencode` executable. */
export function unwrapOpenCode2Binary(path: string): string {
  let target = path;
  try {
    target = realpathSync(path);
  } catch {
    return path;
  }
  if (!OPENCODE2_STUB.test(basename(target))) return path;
  const candidates = [
    join(dirname(target), "opencode.exe"),
    join(dirname(target), "node_modules", "@opencode", "cli", "bin", "opencode.exe"),
  ];
  return candidates.find(existsSync) ?? path;
}

function usableOpenCode2Binary(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const unwrapped = unwrapOpenCode2Binary(path);
  if (isOpenCode2Stub(unwrapped) || isOpenCode1PackagePath(unwrapped)) return undefined;
  return unwrapped;
}

export function cachedOpenCode2Binary(location: ProjectLocation): string | undefined {
  const cached = resolved.get(scope(location));
  if (cached && (location.kind === "wsl" || existsSync(cached))) return cached;
  if (location.kind !== "wsl") {
    const managed = usableOpenCode2Binary(
      existsSync(managedOpenCode2Binary()) ? managedOpenCode2Binary() : undefined,
    );
    if (managed) return managed;
  }
  const alias = resolveAgentBinaryPath(location, "opencode2");
  return location.kind === "wsl" ? alias : usableOpenCode2Binary(alias);
}

export async function resolveOpenCode2Binary(
  location: ProjectLocation,
  signal?: AbortSignal,
  detectionOnly = false,
): Promise<string | undefined> {
  const candidates: Array<string | undefined> = [];
  if (location.kind === "wsl") {
    const script = [
      'managed="$HOME/.opencode2/node_modules/@opencode/cli/bin/opencode.exe"',
      'if [ -x "$managed" ]; then printf "%s\\n" "$managed"; exit; fi',
      "alias_path=$(command -v opencode2 2>/dev/null || true)",
      'if [ -n "$alias_path" ]; then target=$(readlink -f "$alias_path" 2>/dev/null || printf "%s" "$alias_path"); sibling="$(dirname "$target")/opencode.exe"; if [ -x "$sibling" ]; then printf "%s\\n" "$sibling"; exit; fi; case "$target" in *opencode2.cjs|*opencode2.cmd|*opencode2.ps1) ;; *) printf "%s\\n" "$alias_path"; exit ;; esac; fi',
      "command -v opencode",
    ].join("; ");
    const result = await readAgentCommandOutput(location, "sh", ["-c", script], {
      ...(signal ? { signal } : {}),
    });
    const found = result.ok ? result.stdout.trim().split(/\r?\n/).at(-1) : undefined;
    candidates.push(found?.startsWith("/mnt/") ? undefined : found);
  } else {
    candidates.push(
      existsSync(managedOpenCode2Binary()) ? managedOpenCode2Binary() : undefined,
      usableOpenCode2Binary(await resolveExecutablePathAsync("opencode2")),
      await resolveExecutablePathAsync("opencode"),
    );
  }

  let lastUnsupported: { path: string; version: string } | undefined;
  for (const raw of candidates) {
    const candidate = usableOpenCode2Binary(raw);
    if (!candidate) continue;
    const version = await readAgentCommandOutput(location, candidate, ["--version"], {
      ...(signal ? { signal } : {}),
      timeoutMs: 10_000,
    });
    const parsed = parseOpenCode2Version(version.stdout);
    if (!version.ok || !parsed) continue;
    if (!acceptOpenCode2Binary(candidate, parsed)) {
      if (supportsOpenCode2Version(parsed)) continue;
      lastUnsupported = { path: candidate, version: parsed };
      continue;
    }
    resolved.set(scope(location), candidate);
    return candidate;
  }
  if (lastUnsupported) {
    if (!detectionOnly) requireOpenCode2Version(lastUnsupported.version);
    resolved.set(scope(location), lastUnsupported.path);
    return lastUnsupported.path;
  }
  return undefined;
}
