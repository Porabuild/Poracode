import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join, normalize, posix } from "node:path";
import { promisify } from "node:util";
import type { GitRemoteInfo, ProjectLocation, RemoteHostPlatform } from "@/shared/contracts";
import { resolveLightcodePaths } from "@/shared/lightcodePaths";
import { attachErrorDetails, errorDetail, msg } from "@/shared/messages";
import { getProjectName } from "@/shared/wsl";
import { sanitizeWorktreeBranchName, sanitizeWorktreePathSegment } from "@/shared/worktree";
import { buildAgentCommand, readWslCommandOutputAsync } from "../agents/base";
import { readSshCommandOutput, resolveSshHomeDirectoryAsync } from "../ssh";
import type { WslBridgeClient, WslGitExecResult } from "../wsl/bridge/client";
import { mkdir } from "node:fs/promises";

const execFileAsync = promisify(execFile);

export const GIT_STATUS_TIMEOUT = 10_000;
export const GIT_DIFF_TIMEOUT = 15_000;
export const GIT_NETWORK_TIMEOUT = 30_000;
export const GIT_DEFAULT_TIMEOUT = 15_000;
// Operations that invoke user-defined hooks (pre-commit lint/typecheck/test, etc.).
// Generous bound so common hook chains complete; still finite so a hung hook can't pin the UI forever.
export const GIT_HOOK_TIMEOUT = 300_000;

let wslGitBridgeClient: WslBridgeClient | undefined;

export function setWslGitBridgeClient(client: WslBridgeClient | undefined): void {
  wslGitBridgeClient = client;
}

export interface WslGitBatchCommand {
  cwd: string;
  args: string[];
  env?: Record<string, string>;
  loginEnv?: boolean;
}

export async function execGitBatchWslBridge(
  location: ProjectLocation & { kind: "wsl" },
  commands: WslGitBatchCommand[],
  timeoutMs: number,
): Promise<WslGitExecResult[] | undefined> {
  const client = wslGitBridgeClient;
  if (!client) return undefined;
  try {
    const result = await client.gitBatch(location, {
      commands: commands.map((command) =>
        command.loginEnv === undefined ? { ...command, loginEnv: true } : command,
      ),
      timeoutMs,
    });
    return result.results;
  } catch {
    return undefined;
  }
}

export async function ghVersionWslBridge(
  location: ProjectLocation & { kind: "wsl" },
  timeoutMs: number,
): Promise<boolean | undefined> {
  const client = wslGitBridgeClient;
  if (!client) return undefined;
  try {
    const result = await client.ghVersion(location, {
      cwd: location.linuxPath,
      loginEnv: true,
      timeoutMs,
    });
    return result.ok;
  } catch {
    return undefined;
  }
}

export async function execGit(
  location: ProjectLocation,
  args: string[],
  options?: { timeout?: number; allowNonZeroExit?: boolean; env?: Record<string, string> },
): Promise<string> {
  const timeout = options?.timeout ?? GIT_DEFAULT_TIMEOUT;
  const maxBuffer = 50 * 1024 * 1024;

  try {
    if (location.kind === "wsl") {
      const bridgeResult = await execGitWslBridge(location, args, timeout, options?.env);
      if (bridgeResult) {
        if (bridgeResult.ok) return bridgeResult.stdout;
        if (options?.allowNonZeroExit && bridgeResult.stdout) return bridgeResult.stdout;
        throw gitBridgeResultToError(bridgeResult);
      }

      const spec = buildAgentCommand(location, "git", args, undefined, {
        GIT_OPTIONAL_LOCKS: "0",
        ...(options?.env ?? {}),
      });
      const { stdout } = await execFileAsync(spec.command, spec.args, {
        windowsHide: true,
        timeout,
        maxBuffer,
      });
      return stdout;
    }

    if (location.kind === "ssh") {
      const { stdout } = await readSshCommandOutput(location, "git", args, {
        timeout,
        maxBuffer,
        env: {
          GIT_OPTIONAL_LOCKS: "0",
          ...(options?.env ?? {}),
        },
      });
      return stdout;
    }

    const env = { ...process.env, GIT_OPTIONAL_LOCKS: "0", ...(options?.env ?? {}) };
    const { stdout } = await execFileAsync("git", args, {
      cwd: location.path,
      env,
      timeout,
      maxBuffer,
      windowsHide: true,
    });
    return stdout;
  } catch (error: unknown) {
    if (options?.allowNonZeroExit && error && typeof error === "object" && "stdout" in error) {
      const stdout = String((error as { stdout: unknown }).stdout);
      if (stdout) {
        return stdout;
      }
    }
    throw buildGitCommandError(args[0]!, error);
  }
}

async function execGitWslBridge(
  location: ProjectLocation & { kind: "wsl" },
  args: string[],
  timeoutMs: number,
  env: Record<string, string> | undefined,
): Promise<WslGitExecResult | undefined> {
  const client = wslGitBridgeClient;
  if (!client) return undefined;
  try {
    return await client.gitExec(location, {
      cwd: location.linuxPath,
      args,
      loginEnv: true,
      timeoutMs,
      ...(env ? { env } : {}),
    });
  } catch {
    return undefined;
  }
}

function gitBridgeResultToError(result: WslGitExecResult): Error {
  const error = new Error(
    result.error || result.stderr || `git exited ${result.exitCode}`,
  ) as Error & {
    stdout?: string;
    stderr?: string;
    code?: number;
    signal?: string;
  };
  error.stdout = result.stdout;
  error.stderr = result.stderr;
  error.code = result.exitCode;
  if (result.signal) error.signal = result.signal;
  return error;
}

/**
 * Wrap a child_process error into a user-facing message that preserves the
 * original stderr as a separate detail block. Node's promisified `execFile`
 * truncates stderr inside `error.message`, so we read the full `error.stderr`
 * field and attach it via the {@link DETAILS_SENTINEL} so the renderer can
 * disclose it without parsing the truncated message tail.
 */
function buildGitCommandError(command: string, error: unknown): Error {
  const stderr = extractStderr(error);
  const summary = msg("git.commandFailed", { command, detail: errorDetail(error) });
  const message = stderr ? attachErrorDetails(summary, stderr) : summary;
  return new Error(message, { cause: error });
}

function extractStderr(error: unknown): string {
  if (!error || typeof error !== "object" || !("stderr" in error)) return "";
  const raw = (error as { stderr: unknown }).stderr;
  return typeof raw === "string" ? raw.trim() : "";
}

export function toForwardSlash(path: string): string {
  return path.replace(/\\/g, "/");
}

export function normalizeWorktreePath(location: ProjectLocation, path: string): string {
  if (location.kind === "wsl" || location.kind === "ssh") {
    return path;
  }
  return normalize(path).replace(/\\/g, "/").toLowerCase();
}

export function getLocationIdentity(location: ProjectLocation): string {
  if (location.kind === "wsl") {
    return `wsl:${location.distro}:${location.linuxPath}`;
  }
  if (location.kind === "windows") {
    return `windows:${toForwardSlash(location.path).toLowerCase()}`;
  }
  if (location.kind === "ssh") {
    return `ssh:${location.host}:${location.path}`;
  }
  return `posix:${location.path}`;
}

function getWorktreeRepoDirName(location: ProjectLocation): string {
  const repoName = sanitizeWorktreePathSegment(getProjectName(location));
  const hash = createHash("sha256").update(getLocationIdentity(location)).digest("hex").slice(0, 4);
  return `${repoName}-${hash}`;
}

async function resolveWslHomeDirectory(distro: string): Promise<string> {
  if (wslGitBridgeClient) {
    try {
      const result = await wslGitBridgeClient.home({
        kind: "wsl",
        distro,
        linuxPath: "/",
        uncPath: `\\\\wsl.localhost\\${distro}\\`,
      });
      if (result.home) return result.home;
    } catch {
      // fall back to wsl.exe below
    }
  }
  const result = await readWslCommandOutputAsync(distro, "sh", ["-lc", 'printf %s "$HOME"']);
  const homePath = result.stdout.trim();
  if (!result.ok || !homePath) {
    throw new Error(msg("git.wsl.homeNotFound", { distro }));
  }
  return homePath;
}

export async function computeDefaultWorktreePath(
  location: ProjectLocation,
  branch: string,
): Promise<string> {
  const repoDir = getWorktreeRepoDirName(location);
  const branchDir = sanitizeWorktreeBranchName(branch);
  if (location.kind === "wsl") {
    const homePath = await resolveWslHomeDirectory(location.distro);
    return posix.join(homePath, ".lightcode", "worktrees", repoDir, branchDir);
  }
  if (location.kind === "ssh") {
    // `path: "/"` so the cached resolver `cd`s into a directory that always
    // exists (the project path may be a not-yet-created worktree). The result
    // is memoized per host in ssh.ts.
    const homePath = await resolveSshHomeDirectoryAsync({ ...location, path: "/" });
    if (!homePath) {
      throw new Error(`Unable to resolve home directory for ${location.host}.`);
    }
    return posix.join(homePath, ".lightcode", "worktrees", repoDir, branchDir);
  }
  return join(
    resolveLightcodePaths(join(homedir(), ".lightcode")).worktreesDir,
    repoDir,
    branchDir,
  );
}

export async function ensureWorktreeParentExists(
  location: ProjectLocation,
  worktreePath: string,
): Promise<void> {
  if (location.kind === "wsl") {
    const parentPath = posix.dirname(worktreePath);
    if (wslGitBridgeClient) {
      try {
        await wslGitBridgeClient.mkdir({ ...location, linuxPath: parentPath }, parentPath, {
          recursive: true,
        });
        return;
      } catch {
        // fall back to wsl.exe below
      }
    }
    const result = await readWslCommandOutputAsync(location.distro, "mkdir", ["-p", parentPath]);
    if (!result.ok) {
      throw new Error(result.stderr || msg("git.wsl.mkdirFailed", { path: parentPath }));
    }
    return;
  }

  if (location.kind === "ssh") {
    await readSshCommandOutput({ ...location, path: "/" }, "mkdir", [
      "-p",
      posix.dirname(worktreePath),
    ]);
    return;
  }

  await mkdir(dirname(worktreePath), { recursive: true });
}

export async function removeWslPathViaBridge(
  location: ProjectLocation & { kind: "wsl" },
  path: string,
  options: { recursive?: boolean; force?: boolean },
): Promise<boolean> {
  if (!wslGitBridgeClient) return false;
  try {
    await wslGitBridgeClient.rm({ ...location, linuxPath: posix.dirname(path) }, path, options);
    return true;
  } catch {
    return false;
  }
}

function detectPlatform(hostname: string): RemoteHostPlatform {
  const normalized = hostname.toLowerCase();
  if (normalized === "github.com" || normalized.includes("github")) return "github";
  if (normalized === "gitlab.com" || normalized.includes("gitlab")) return "gitlab";
  if (normalized === "bitbucket.org" || normalized.includes("bitbucket")) return "bitbucket";
  return "unknown";
}

export function parseRemoteUrl(url: string): GitRemoteInfo | null {
  const httpsMatch = url.match(/^https?:\/\/([^/]+)\/([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (httpsMatch) {
    const [, hostname, owner, repo] = httpsMatch;
    return { url, platform: detectPlatform(hostname!), owner: owner!, repo: repo! };
  }

  const sshMatch = url.match(/^[^@]+@([^:]+):([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (sshMatch) {
    const [, hostname, owner, repo] = sshMatch;
    return { url, platform: detectPlatform(hostname!), owner: owner!, repo: repo! };
  }

  return null;
}
