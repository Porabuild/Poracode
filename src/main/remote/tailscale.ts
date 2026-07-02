import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { z } from "zod";

const execFileAsync = promisify(execFile);

/**
 * Tailscale integration for HTTPS remote access. When the local Tailscale
 * daemon is running and HTTPS is available on the tailnet, the desktop can run
 * `tailscale serve` to reverse-proxy `https://<machine>.<tailnet>.ts.net` to the
 * local remote-access port, giving the mobile PWA a real secure context (needed
 * for install + notifications) without exposing the LAN address.
 *
 * This module deliberately has no Electron imports so it stays unit-testable.
 * The CLI is invoked through an injectable {@link TailscaleRunner} so tests can
 * mock `child_process` behaviour.
 */

const STATUS_TIMEOUT_MS = 5_000;
const SERVE_TIMEOUT_MS = 15_000;
const SERVE_HTTPS_PORT = 443;

/** Well-known install locations probed before falling back to `tailscale` on PATH. */
const POSIX_WELL_KNOWN_PATHS = [
  "/opt/homebrew/bin/tailscale",
  "/usr/local/bin/tailscale",
  "/usr/bin/tailscale",
  "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
] as const;

function windowsWellKnownPaths(): string[] {
  const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
  return [`${programFiles}\\Tailscale\\tailscale.exe`];
}

let cachedCliPath: string | null | undefined;

/**
 * Locates the tailscale CLI via a well-known-paths probe, falling back to plain
 * `tailscale` on PATH. Cached for the process lifetime. `null` means no binary
 * was found in any known location (still returns `"tailscale"` as a last resort
 * via {@link tailscaleCliPath}; `resolveTailscaleCliPath` reports the probe).
 */
export function resolveTailscaleCliPath(): string | null {
  if (cachedCliPath !== undefined) return cachedCliPath;
  const candidates =
    process.platform === "win32" ? windowsWellKnownPaths() : [...POSIX_WELL_KNOWN_PATHS];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      cachedCliPath = candidate;
      return cachedCliPath;
    }
  }
  cachedCliPath = null;
  return cachedCliPath;
}

/** The executable to invoke: a resolved well-known path, or `tailscale` on PATH. */
function tailscaleCliPath(): string {
  return resolveTailscaleCliPath() ?? "tailscale";
}

/** Test seam: reset the cached CLI path. */
export function resetTailscaleCliCache(): void {
  cachedCliPath = undefined;
}

export interface TailscaleRunResult {
  readonly stdout: string;
  readonly stderr: string;
}

export type TailscaleRunner = (
  args: readonly string[],
  options?: { readonly timeoutMs?: number },
) => Promise<TailscaleRunResult>;

const defaultRunner: TailscaleRunner = async (args, options) => {
  const { stdout, stderr } = await execFileAsync(tailscaleCliPath(), [...args], {
    timeout: options?.timeoutMs ?? STATUS_TIMEOUT_MS,
    windowsHide: true,
    encoding: "utf8",
  });
  return { stdout, stderr };
};

/** Discriminated result of a `tailscale status` probe. */
export type TailscaleStatus =
  | { readonly state: "not-installed" }
  | { readonly state: "not-running" }
  | { readonly state: "needs-login" }
  | { readonly state: "running"; readonly dnsName: string; readonly httpsAvailable: boolean }
  | { readonly state: "error"; readonly message: string };

const tailscaleStatusSchema = z.object({
  BackendState: z.string().optional(),
  Self: z
    .object({
      DNSName: z.string().optional(),
    })
    .nullish(),
  CertDomains: z.array(z.string()).nullish(),
});

/** MagicDNS FQDNs are reported with a trailing dot; strip it for URL building. */
function stripTrailingDot(value: string): string {
  return value.endsWith(".") ? value.slice(0, -1) : value;
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT"
  );
}

function errorStdout(error: unknown): string {
  const raw = (error as { stdout?: unknown } | null)?.stdout;
  if (typeof raw === "string") return raw;
  if (raw && typeof (raw as { toString?: unknown }).toString === "function") {
    return String(raw);
  }
  return "";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    const stderr = (error as { stderr?: unknown }).stderr;
    if (typeof stderr === "string" && stderr.trim()) return stderr.trim();
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return String(error);
}

function parseStatusJson(raw: string): TailscaleStatus {
  let json: unknown;
  try {
    json = JSON.parse(raw) as unknown;
  } catch {
    return { state: "error", message: "Unable to parse tailscale status output." };
  }
  const parsed = tailscaleStatusSchema.safeParse(json);
  if (!parsed.success) {
    return { state: "error", message: "Unexpected tailscale status output." };
  }
  const backendState = parsed.data.BackendState;
  // The daemon is up but not logged in / not machine-authorized: the Tailscale
  // GUI can drive that auth, so surface it distinctly from a stopped daemon.
  if (backendState === "NeedsLogin" || backendState === "NeedsMachineAuth") {
    return { state: "needs-login" };
  }
  // Other non-Running backends (Stopped, NoState) mean the daemon exists but
  // isn't ready to serve; surface that as "not-running".
  if (backendState && backendState !== "Running") {
    return { state: "not-running" };
  }
  const dnsName = stripTrailingDot(parsed.data.Self?.DNSName?.trim() ?? "");
  // `CertDomains` non-empty is the signal that HTTPS certs are provisionable on
  // this tailnet. When the field is absent we treat HTTPS as unknown-but-try.
  const certDomains = parsed.data.CertDomains;
  const httpsAvailable =
    certDomains === null || certDomains === undefined || certDomains.length > 0;
  return { state: "running", dnsName, httpsAvailable };
}

/**
 * Probes the local Tailscale daemon via `tailscale status --json`. Never
 * throws — failures collapse into the discriminated {@link TailscaleStatus}.
 */
export async function probeTailscaleStatus(
  runner: TailscaleRunner = defaultRunner,
): Promise<TailscaleStatus> {
  // We always attempt the probe (a well-known path may be absent but `tailscale`
  // could still be on PATH); an ENOENT below reports not-installed.
  try {
    const { stdout } = await runner(["status", "--json"], { timeoutMs: STATUS_TIMEOUT_MS });
    return parseStatusJson(stdout);
  } catch (error) {
    if (isEnoent(error)) {
      return { state: "not-installed" };
    }
    // A stopped daemon exits non-zero but may still print parseable JSON on
    // stdout (with BackendState "Stopped"); prefer that over a raw error.
    const stdout = errorStdout(error);
    if (stdout.trim()) {
      return parseStatusJson(stdout);
    }
    const message = errorMessage(error);
    if (/not\s+running|is\s+stopped|failed to connect/i.test(message)) {
      return { state: "not-running" };
    }
    return { state: "error", message };
  }
}

export type TailscaleServeResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

/**
 * Configures `tailscale serve` to reverse-proxy the tailnet HTTPS endpoint to
 * the local remote-access port, in the background (`--bg`). On failure the CLI
 * prints an actionable message (e.g. HTTPS not enabled on the tailnet); that
 * message is propagated so the UI can show it.
 */
export async function enableTailscaleServe(
  port: number,
  runner: TailscaleRunner = defaultRunner,
): Promise<TailscaleServeResult> {
  try {
    await runner(["serve", "--bg", `--https=${SERVE_HTTPS_PORT}`, `http://127.0.0.1:${port}`], {
      timeoutMs: SERVE_TIMEOUT_MS,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

/**
 * Turns off the tailnet HTTPS serve mapping. Best-effort and targeted (only the
 * `--https=443` handler) so we never clobber other serves the user set up;
 * failures are swallowed.
 */
export async function disableTailscaleServe(
  runner: TailscaleRunner = defaultRunner,
): Promise<void> {
  try {
    await runner(["serve", `--https=${SERVE_HTTPS_PORT}`, "off"], { timeoutMs: SERVE_TIMEOUT_MS });
  } catch {
    // Best-effort teardown; if the mapping is already gone (or the daemon is
    // down) there is nothing to clean up.
  }
}

/** Builds the advertised HTTPS base URL for a MagicDNS name (serve uses 443). */
export function buildTailscaleHttpsUrl(dnsName: string): string {
  return `https://${stripTrailingDot(dnsName.trim())}/`;
}

const LAUNCH_TIMEOUT_MS = 10_000;

/**
 * Injectable seam for launching the Tailscale GUI app, so {@link launchTailscaleApp}
 * stays unit-testable without touching real processes. `run` awaits a short-lived
 * command to completion (macOS `open`); `spawnDetached` fires-and-forgets a
 * long-lived GUI process (the Windows tray app); `fileExists` probes an install
 * path; `platform` selects the per-OS branch.
 */
export interface TailscaleLaunchDeps {
  readonly platform: NodeJS.Platform;
  readonly run: (command: string, args: readonly string[]) => Promise<void>;
  readonly spawnDetached: (command: string, args: readonly string[]) => void;
  readonly fileExists: (path: string) => boolean;
}

const defaultLaunchDeps: TailscaleLaunchDeps = {
  platform: process.platform,
  run: async (command, args) => {
    await execFileAsync(command, [...args], { timeout: LAUNCH_TIMEOUT_MS, windowsHide: true });
  },
  spawnDetached: (command, args) => {
    const child = spawn(command, [...args], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
  },
  fileExists: existsSync,
};

/**
 * Launches the Tailscale GUI so the user can start the daemon / complete login
 * without a terminal. Same action serves the "not-running" and "needs-login"
 * states (the GUI opens on its login screen when auth is required).
 *
 * - macOS: `open -a Tailscale` (a non-zero exit means the app is missing).
 * - Windows: spawns the tray binary in Program Files, detached.
 * - Linux: no GUI to drive the systemd daemon; returns an actionable message.
 *
 * Never throws — failures collapse into `{ ok: false, message }`.
 */
export async function launchTailscaleApp(
  deps: TailscaleLaunchDeps = defaultLaunchDeps,
): Promise<TailscaleServeResult> {
  if (deps.platform === "darwin") {
    try {
      await deps.run("open", ["-a", "Tailscale"]);
      return { ok: true };
    } catch (error) {
      return { ok: false, message: errorMessage(error) };
    }
  }
  if (deps.platform === "win32") {
    const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
    const guiPath = `${programFiles}\\Tailscale\\tailscale-ipn.exe`;
    if (!deps.fileExists(guiPath)) {
      return { ok: false, message: "Tailscale is not installed." };
    }
    try {
      deps.spawnDetached(guiPath, []);
      return { ok: true };
    } catch (error) {
      return { ok: false, message: errorMessage(error) };
    }
  }
  return {
    ok: false,
    message: "Start the Tailscale daemon with: sudo systemctl start tailscaled",
  };
}
