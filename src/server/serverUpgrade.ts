import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { restartServerPrefix } from "./serverUpgradeRestart";
import { applyServerNativeOverlay, writeCurrentSymlink } from "./serverNativeOverlay";

export const UPGRADE_USAGE =
  "Usage: poracode-server upgrade --from <tarball> [--prefix <path>] [--json]";

export interface UpgradeCliOptions {
  readonly from: string;
  readonly prefix: string;
  readonly json: boolean;
  /**
   * How long the post-swap (and post-rollback) health probe keeps polling the
   * restarted daemon before declaring it unhealthy. A freshly spawned server
   * needs a few seconds to bind, so a single probe would roll back spuriously.
   */
  readonly healthTimeoutMs?: number;
}

export function parseUpgradeCliOptions(args: readonly string[]): UpgradeCliOptions {
  let from: string | undefined;
  let prefix = "/opt/poracode";
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--json") {
      json = true;
    } else if (argument === "--from" || argument === "--prefix") {
      const value = args[index + 1];
      if (value === undefined) throw new Error(UPGRADE_USAGE);
      if (argument === "--from") from = value;
      else prefix = value;
      index += 1;
    } else {
      throw new Error(UPGRADE_USAGE);
    }
  }
  if (from === undefined) throw new Error(UPGRADE_USAGE);
  return { from, prefix, json };
}

export interface UpgradeIo {
  readonly extract: (tarball: string, destination: string) => void;
  readonly npmInstall: (releaseDir: string) => void;
  readonly doctor: (releaseDir: string) => { readonly ok: boolean; readonly detail: string };
  readonly health: (prefix: string) => Promise<boolean>;
  readonly restart: (prefix: string) => Promise<void>;
}

export interface UpgradeResult {
  readonly ok: boolean;
  readonly prefix: string;
  readonly current: string;
  readonly previous: string | null;
  readonly rolledBack: boolean;
  readonly detail: string;
}

/**
 * The production IO surface. Exported so tests (and embedders) can override
 * individual legs — e.g. exercise the real restart against a fake bundle —
 * while the rest stays real.
 */
export const defaultUpgradeIo: UpgradeIo = {
  extract: (tarball, destination) => {
    mkdirSync(destination, { recursive: true });
    execFileSync("tar", ["-xzf", tarball, "-C", destination], { stdio: "pipe" });
  },
  npmInstall: (releaseDir) => {
    execFileSync("npm", ["install", "--omit=dev", "--no-audit", "--no-fund", "--loglevel=error"], {
      cwd: releaseDir,
      stdio: "pipe",
    });
  },
  doctor: (releaseDir) => {
    const result = execFileSync(
      process.execPath,
      [join(releaseDir, "lib", "server.cjs"), "doctor", "--json"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const parsed = JSON.parse(result) as { checks?: readonly { status?: string }[] };
    const ok = !(parsed.checks ?? []).some((check) => check.status === "error");
    return { ok, detail: ok ? "doctor ok" : "doctor reported an error" };
  },
  health: async (prefix) => {
    const url = readHealthUrl(prefix);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3_000) });
      return response.ok;
    } catch {
      return false;
    }
  },
  restart: restartServerPrefix,
};

const DEFAULT_HEALTH_TIMEOUT_MS = 30_000;
const HEALTH_POLL_INTERVAL_MS = 500;

function readHealthUrl(prefix: string): string {
  const configured = process.env.PORACODE_REMOTE_HEALTH_URL?.trim();
  if (configured) return configured;
  const host = process.env.PORACODE_REMOTE_ACCESS_HOST?.trim() || "127.0.0.1";
  const port = process.env.PORACODE_REMOTE_ACCESS_PORT?.trim() || "49152";
  const marker = join(prefix, "health.url");
  if (existsSync(marker)) {
    const line = readFileSync(marker, "utf8").trim();
    if (line.startsWith("http://") || line.startsWith("https://")) return line;
  }
  return `http://${host}:${port}/healthz`;
}

/**
 * Poll the health surface until the restarted daemon answers or the window
 * closes. A single probe right after spawn would nearly always race the
 * daemon's own boot and roll back a perfectly good release.
 */
async function waitForHealthy(io: UpgradeIo, prefix: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await io.health(prefix)) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolveWait) => setTimeout(resolveWait, HEALTH_POLL_INTERVAL_MS));
  }
}

function readCurrentTarget(prefix: string): string | null {
  const current = join(prefix, "current");
  if (!existsSync(current)) return null;
  try {
    return readlinkSync(current);
  } catch {
    return current;
  }
}

/**
 * Stage a tarball, doctor it, swap `<prefix>/current`, restart the daemon,
 * health-check the RUNNING process, and roll the symlink (and daemon) back
 * when health fails (V6 D.4).
 */
export async function upgradeServerPrefix(
  options: UpgradeCliOptions,
  io: UpgradeIo = defaultUpgradeIo,
): Promise<UpgradeResult> {
  const previous = readCurrentTarget(options.prefix);
  const releaseId = `release-${Date.now().toString(36)}`;
  const releaseDir = join(options.prefix, "releases", releaseId);
  const healthTimeoutMs = options.healthTimeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS;
  mkdirSync(join(options.prefix, "releases"), { recursive: true });
  let swapped = false;
  try {
    io.extract(options.from, releaseDir);
    const overlayRoot = join(releaseDir, "native-overlay");
    if (existsSync(overlayRoot)) {
      applyServerNativeOverlay({ prefix: releaseDir, overlayRoot });
    }
    io.npmInstall(releaseDir);
    const doctor = io.doctor(releaseDir);
    if (!doctor.ok) {
      rmSync(releaseDir, { recursive: true, force: true });
      return {
        ok: false,
        prefix: options.prefix,
        current: previous ?? "",
        previous,
        rolledBack: false,
        detail: doctor.detail,
      };
    }
    writeCurrentSymlink(options.prefix, releaseDir);
    swapped = true;
    await io.restart(options.prefix);
    const healthy = await waitForHealthy(io, options.prefix, healthTimeoutMs);
    if (!healthy) {
      let restored = false;
      if (previous) {
        const previousPath = previous.startsWith("/") ? previous : join(options.prefix, previous);
        writeCurrentSymlink(options.prefix, previousPath);
        await io.restart(options.prefix);
        restored = await waitForHealthy(io, options.prefix, healthTimeoutMs);
      }
      if (!previous) rmSync(join(options.prefix, "current"), { force: true });
      rmSync(releaseDir, { recursive: true, force: true });
      return {
        ok: false,
        prefix: options.prefix,
        current: previous ?? "",
        previous,
        rolledBack: previous !== null,
        detail: restored
          ? "health check failed after swap; rolled back to the previous release"
          : "health check failed after swap; rolled back, but the previous release is not healthy either",
      };
    }
    return {
      ok: true,
      prefix: options.prefix,
      current: join(options.prefix, "current"),
      previous,
      rolledBack: false,
      detail: "upgraded",
    };
  } catch (error) {
    // Staging failures must not disturb the running release. Once swapped,
    // restoring the link alone is insufficient: restart the previous daemon
    // before reporting the original upgrade failure.
    if (swapped && previous) {
      const previousPath = previous.startsWith("/") ? previous : join(options.prefix, previous);
      try {
        writeCurrentSymlink(options.prefix, previousPath);
        await io.restart(options.prefix);
        if (!(await waitForHealthy(io, options.prefix, healthTimeoutMs))) {
          throw new Error("The previous release is not healthy after rollback", { cause: error });
        }
      } catch (rollbackError) {
        // Retain the staged files when recovery fails; a process may still
        // be using them and the operator needs both releases for recovery.
        throw new AggregateError([error, rollbackError], "Upgrade failed and rollback failed", {
          cause: rollbackError,
        });
      }
    } else if (swapped) {
      rmSync(join(options.prefix, "current"), { force: true });
    }
    rmSync(releaseDir, { recursive: true, force: true });
    throw error;
  }
}
