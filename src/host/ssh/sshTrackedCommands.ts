import { spawn, type ChildProcess } from "node:child_process";

/**
 * Shared process custody for one-shot ssh/scp/ssh-keyscan commands.
 *
 * Every command is tracked from spawn to observed exit, captures bounded
 * stdout/stderr, and is killed and joined on timeout or abort. `dispose`
 * kill-and-joins every live child, so a shutdown cannot orphan a probe. The
 * runner is deliberately SSH-agnostic: `SshConnectionManager` uses it for
 * connect/upload/exec commands and the host-key trust helper uses it for
 * resolution/probe commands.
 */

export const SSH_COMMAND_MAX_OUTPUT_BYTES = 256 * 1024;
/** Bounded join after a kill before the child is abandoned to SIGKILL. */
export const SSH_CHILD_KILL_GRACE_MS = 2_000;
const SIGKILL_JOIN_GRACE_MS = 1_000;

export interface SshCommandResult {
  readonly stdout: string;
  readonly stderr: string;
}

export interface SshTrackedCommandOptions {
  readonly stdin?: string;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly maxOutputBytes?: number;
}

export interface SshTrackedCommandRunnerOptions {
  /** Timeout for commands that pass none of their own. */
  readonly defaultTimeoutMs?: number;
  readonly maxOutputBytes?: number;
  /** Bounded join after SIGTERM before SIGKILL is sent. */
  readonly killGraceMs?: number;
}

export function appendBoundedOutput(
  current: string,
  chunk: Buffer,
  maxOutputBytes: number,
): string {
  const next = current + chunk.toString("utf8");
  return next.length > maxOutputBytes ? next.slice(next.length - maxOutputBytes) : next;
}

function commandFailure(command: string, result: SshCommandResult, code: number | null): Error {
  const detail = result.stderr.trim() || result.stdout.trim();
  return new Error(detail || `${command} exited with code ${code ?? "unknown"}.`);
}

/**
 * Kill a child and resolve once it exited (SIGTERM, then SIGKILL after the
 * grace period). A killed process still has to be observed exiting; the second
 * bound only guards an unkillable child so shutdown can never wedge here.
 */
export function joinChildProcess(
  child: ChildProcess,
  killGraceMs: number = SSH_CHILD_KILL_GRACE_MS,
): Promise<void> {
  if (child.exitCode !== null || child.signalCode != null) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let settled = false;
    let sigkillTimer: ReturnType<typeof setTimeout> | null = null;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(graceTimer);
      if (sigkillTimer !== null) clearTimeout(sigkillTimer);
      resolve();
    };
    const graceTimer = setTimeout(() => {
      child.kill("SIGKILL");
      sigkillTimer = setTimeout(finish, SIGKILL_JOIN_GRACE_MS);
      sigkillTimer.unref?.();
    }, killGraceMs);
    graceTimer.unref?.();
    child.once("exit", finish);
    child.kill();
  });
}

export class SshTrackedCommandRunner {
  private readonly children = new Set<ChildProcess>();
  private readonly defaultTimeoutMs: number | undefined;
  private readonly maxOutputBytes: number;
  private readonly killGraceMs: number;

  constructor(options: SshTrackedCommandRunnerOptions = {}) {
    this.defaultTimeoutMs = options.defaultTimeoutMs;
    this.maxOutputBytes = options.maxOutputBytes ?? SSH_COMMAND_MAX_OUTPUT_BYTES;
    this.killGraceMs = options.killGraceMs ?? SSH_CHILD_KILL_GRACE_MS;
  }

  /** Live one-shot commands, including ones already being killed. */
  get liveChildCount(): number {
    return this.children.size;
  }

  run(
    command: string,
    args: readonly string[],
    options: SshTrackedCommandOptions = {},
  ): Promise<SshCommandResult> {
    const signal = options.signal;
    if (signal?.aborted) {
      return Promise.reject(abortReason(signal));
    }
    const maxOutputBytes = options.maxOutputBytes ?? this.maxOutputBytes;
    return new Promise<SshCommandResult>((resolve, reject) => {
      const child = spawn(command, [...args], {
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
      this.children.add(child);
      let stdout = "";
      let stderr = "";
      let settled = false;
      let outcome: Error | SshCommandResult | null = null;
      const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
      const timer =
        timeoutMs === undefined
          ? null
          : setTimeout(() => {
              if (settled) return;
              outcome = new Error(`${command} timed out after ${timeoutMs}ms.`);
              void joinChildProcess(child, this.killGraceMs).then(() => finish());
            }, timeoutMs);
      timer?.unref?.();
      const onAbort = (): void => {
        if (settled) return;
        outcome = abortReason(signal);
        void joinChildProcess(child, this.killGraceMs).then(() => finish());
      };
      const cleanup = (): void => {
        if (timer !== null) clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        this.children.delete(child);
      };
      const finish = (): void => {
        if (settled) return;
        settled = true;
        cleanup();
        if (outcome instanceof Error) reject(outcome);
        else resolve(outcome as SshCommandResult);
      };

      child.stdout?.on("data", (chunk: Buffer) => {
        stdout = appendBoundedOutput(stdout, chunk, maxOutputBytes);
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr = appendBoundedOutput(stderr, chunk, maxOutputBytes);
      });
      child.once("error", (error) => {
        if (settled) return;
        outcome = error;
        finish();
      });
      child.once("exit", (code) => {
        if (settled) return;
        if (outcome === null) {
          const result = { stdout, stderr };
          outcome = code === 0 ? result : commandFailure(command, result, code);
        }
        finish();
      });
      child.stdin?.on("error", (error) => {
        // An ssh that dies before consuming stdin (auth failure, refused
        // connection) surfaces here as EPIPE; the exit handler above is the
        // authoritative outcome. Other stdin errors reject like child errors.
        if ((error as NodeJS.ErrnoException).code !== "EPIPE" && !settled) {
          outcome = error;
          void joinChildProcess(child, this.killGraceMs).then(() => finish());
        }
      });
      if (options.stdin !== undefined) child.stdin?.end(options.stdin);
      else child.stdin?.end();
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) onAbort();
    });
  }

  /** Kill and join every live command; idempotent. */
  async dispose(): Promise<void> {
    await Promise.all([...this.children].map((child) => joinChildProcess(child, this.killGraceMs)));
  }
}

export function abortReason(signal: AbortSignal | undefined): Error {
  const reason = signal?.reason;
  if (reason instanceof Error) return reason;
  const error = new Error(
    typeof reason === "string" && reason.length > 0 ? reason : "The SSH command was cancelled.",
  );
  error.name = "AbortError";
  return error;
}
