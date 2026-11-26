import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import type { ProjectLocation, UsageSnapshot } from "@/shared/contracts";
import { antigravityQuotaSummaryWindows } from "@poracode/agents-usage";
import { extractSemverFromVersionOutput, readAgentCommandOutput } from "../base";
import { ANTIGRAVITY_DISABLE_AUTO_UPDATE_ENV } from "./detection";

/**
 * Read-only Antigravity CLI usage report.
 *
 * `agy -p /usage --output-format json` renders the CLI's native quota report.
 * The command itself is dispatched by the vendor, so this reader only accepts
 * its strict `SUCCESS`/`usage` envelope and never treats an ordinary model
 * answer as quota. It never reads OAuth, keychain, or token files: the caller
 * must supply a qualified executable whose account is already signed in, and
 * an unsigned-in/failed run simply returns `undefined`.
 *
 * Commands run in a neutral temporary directory with auto-update disabled and
 * browser launch suppressed where the vendor honors it. Native POSIX/WSL use
 * `open`/`xdg-open` stubs or `BROWSER=/bin/true`. The scanner uses the local
 * and ACP paths on native Windows, where browser suppression is unqualified.
 * `readAgentCommandOutput` runs print mode with stdin closed and a bounded
 * timeout, and all failure diagnostics stay generic: stdout/stderr are never
 * surfaced.
 */

const VERSION_ARGS = ["--version"];
const USAGE_ARGS = ["-p", "/usage", "--output-format", "json"];
const VERSION_TIMEOUT_MS = 5_000;
const USAGE_TIMEOUT_MS = 30_000;
const BROWSER_STUB_SCRIPT = "#!/bin/sh\nexit 1\n";

export interface AntigravityCliUsageDeps {
  runCommand: typeof readAgentCommandOutput;
  signal?: AbortSignal;
}

const defaultDeps: AntigravityCliUsageDeps = { runCommand: readAgentCommandOutput };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function qualifiesVersion(raw: string | undefined): boolean {
  if (!raw) return false;
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(raw.trim());
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  return major > 1 || (major === 1 && (minor > 1 || (minor === 1 && patch >= 11)));
}

function remainingFraction(raw: Record<string, unknown>): number | undefined {
  const flat = raw.remainingFraction ?? raw.remaining_fraction;
  if (typeof flat === "number" && Number.isFinite(flat)) return flat;
  const remaining = raw.remaining;
  if (!isRecord(remaining)) return undefined;
  const nested = remaining.remainingFraction ?? remaining.remaining_fraction;
  if (typeof nested === "number" && Number.isFinite(nested)) return nested;
  if (remaining.case === "remainingFraction" && typeof remaining.value === "number") {
    return Number.isFinite(remaining.value) ? remaining.value : undefined;
  }
  return undefined;
}

/**
 * A reset is context only when the vendor supplied one, but a present reset
 * must be a usable positive instant. Zero/negative epochs and unparseable
 * strings mark the bucket unavailable instead of leaking a bogus reset.
 */
function usableResetMs(raw: Record<string, unknown>): number | undefined | false {
  const value = raw.resetTime ?? raw.reset_time;
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return false;
    return Math.round(value < 1e12 ? value * 1000 : value);
  }
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const epoch = Number(trimmed);
    if (!Number.isFinite(epoch) || epoch <= 0) return false;
    return Math.round(epoch < 1e12 ? epoch * 1000 : epoch);
  }
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : false;
}

function hasKnownCadence(raw: Record<string, unknown>): boolean {
  if (nonEmptyString(raw.window)) return true;
  const label = `${String(raw.displayName ?? "")} ${String(raw.name ?? "")}`.toLowerCase();
  return /\b(hour|daily|day|week|month)\b/.test(label);
}

function usableBucket(raw: unknown): Record<string, unknown> | undefined {
  if (!isRecord(raw)) return undefined;
  if (raw.disabled !== undefined && raw.disabled !== null && typeof raw.disabled !== "boolean") {
    return undefined;
  }
  if (raw.disabled === true) return undefined;
  if (!hasKnownCadence(raw)) return undefined;
  const fraction = remainingFraction(raw);
  if (fraction === undefined || fraction < 0 || fraction > 1) return undefined;
  const resetMs = usableResetMs(raw);
  if (resetMs === false) return undefined;
  return {
    ...raw,
    remainingFraction: fraction,
    ...(resetMs !== undefined ? { resetTime: new Date(resetMs).toISOString() } : {}),
  };
}

function usableGroups(data: Record<string, unknown>): Record<string, unknown>[] {
  if (!Array.isArray(data.groups)) return [];
  return data.groups.flatMap((rawGroup) => {
    if (!isRecord(rawGroup) || !Array.isArray(rawGroup.buckets)) return [];
    const buckets = rawGroup.buckets.flatMap((bucket) => {
      const usable = usableBucket(bucket);
      return usable ? [usable] : [];
    });
    return buckets.length > 0 ? [{ ...rawGroup, buckets }] : [];
  });
}

function parseReport(stdout: string, nowMs: number): UsageSnapshot | undefined {
  let root: unknown;
  try {
    root = JSON.parse(stdout);
  } catch {
    return undefined;
  }
  if (!isRecord(root) || root.status !== "SUCCESS") return undefined;
  if (root.error !== undefined && root.error !== null && root.error !== "") return undefined;
  const command = isRecord(root.command) ? root.command : undefined;
  if (command?.name !== "usage" || !isRecord(command.data)) return undefined;
  const groups = usableGroups(command.data);
  if (groups.length === 0) return undefined;
  const windows = antigravityQuotaSummaryWindows({ groups });
  if (windows.length === 0) return undefined;
  return {
    providerId: "antigravity",
    status: "ok",
    windows,
    fetchedAt: nowMs,
  };
}

interface ProbeContext {
  location: ProjectLocation;
  options: {
    posixCwd?: string;
    wslLinuxCwd?: string;
    env: Record<string, string>;
  };
  cleanup: () => Promise<void>;
}

async function prepareProbe(location: ProjectLocation): Promise<ProbeContext> {
  if (location.kind === "wsl") {
    return {
      location,
      options: {
        wslLinuxCwd: "/tmp",
        env: { ...ANTIGRAVITY_DISABLE_AUTO_UPDATE_ENV, BROWSER: "/bin/true" },
      },
      cleanup: async () => {},
    };
  }

  const probeDir = await mkdtemp(join(tmpdir(), "poracode-agy-usage-")).catch(() => undefined);
  const cwd = probeDir ?? tmpdir();
  const env: Record<string, string> = { ...ANTIGRAVITY_DISABLE_AUTO_UPDATE_ENV };
  if (probeDir && location.kind === "posix") {
    try {
      await Promise.all(
        ["open", "xdg-open"].map((name) =>
          writeFile(join(probeDir, name), BROWSER_STUB_SCRIPT, { mode: 0o700 }),
        ),
      );
      env.BROWSER = join(probeDir, "open");
      env.PATH = `${probeDir}${delimiter}${process.env.PATH ?? ""}`;
    } catch {
      env.BROWSER = "/bin/true";
    }
  } else if (location.kind === "posix") {
    env.BROWSER = "/bin/true";
  }
  return {
    location: { ...location, path: cwd } as ProjectLocation,
    options: {
      posixCwd: cwd,
      wslLinuxCwd: "/tmp",
      env,
    },
    cleanup: async () => {
      if (probeDir) await rm(probeDir, { recursive: true, force: true }).catch(() => {});
    },
  };
}

/**
 * Read native Antigravity CLI quota for an already-qualified executable.
 * Returns `undefined` for unresolved versions (<1.1.11), auth failure, normal
 * model output, empty/disabled quota, malformed resets, timeout, or any other
 * generic failure. The caller owns executable resolution and sign-in.
 */
export async function readAntigravityCliUsage(
  executablePath: string,
  location: ProjectLocation,
  nowMs: number,
  deps: Partial<AntigravityCliUsageDeps> = {},
): Promise<UsageSnapshot | undefined> {
  const executable = executablePath.trim();
  if (!executable) return undefined;
  const runCommand = deps.runCommand ?? defaultDeps.runCommand;
  const signal = deps.signal;
  if (signal?.aborted) return undefined;
  const probe = await prepareProbe(location).catch(() => undefined);
  if (!probe) return undefined;

  const invoke = (args: string[], options: ProbeContext["options"] & { timeoutMs?: number }) =>
    Promise.resolve()
      .then(() =>
        runCommand(probe.location, executable, args, {
          ...options,
          ...(signal ? { signal } : {}),
        }),
      )
      .catch(() => undefined);

  try {
    const version = await invoke(VERSION_ARGS, {
      ...probe.options,
      timeoutMs: VERSION_TIMEOUT_MS,
    });
    if (!version?.ok) return undefined;
    if (!qualifiesVersion(extractSemverFromVersionOutput(version.stdout))) return undefined;

    const report = await invoke(USAGE_ARGS, {
      ...probe.options,
      timeoutMs: USAGE_TIMEOUT_MS,
    });
    if (!report?.ok || !report.stdout.trim()) return undefined;
    return parseReport(report.stdout, nowMs);
  } finally {
    await probe.cleanup();
  }
}
