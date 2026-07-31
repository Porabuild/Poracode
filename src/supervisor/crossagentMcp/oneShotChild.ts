import { spawn as spawnChild } from "node:child_process";
import { spawn as spawnPty, type IDisposable } from "node-pty";
import { stripAnsi } from "@/shared/ansi";
import type { ProjectLocation } from "@/shared/contracts";
import type { AgentAdapter } from "@/supervisor/agents/base";
import { buildOneShotSpec } from "@/supervisor/oneShotSpawn";
import { ensureNodePtySpawnHelperExecutable } from "@/supervisor/nodePty";
import { processEnvRecord } from "@/supervisor/processEnv";

/**
 * Hard ceiling on a one-shot child's process lifetime. Unlike a structured
 * child (which settles on its own turn.completed), a one-shot CLI could hang
 * indefinitely with no interactive channel to unblock it, so we cap it. The
 * caller's `run_agent`/`wait_for_agent` `timeout_s` governs how long a WAIT
 * blocks — this is a separate safety net for the underlying process.
 */
export const ONE_SHOT_CHILD_MAX_LIFETIME_MS = 20 * 60 * 1000;

/** Grace period between SIGTERM and SIGKILL when cancelling. */
const KILL_GRACE_MS = 3_000;

/** Last N chars of stderr surfaced as the failure message. */
const STDERR_TAIL_CHARS = 2_000;

/**
 * Micro-batch window for stdout deltas. Chatty CLIs can emit many tiny chunks;
 * coalescing them over a short unref'd timer (or once the buffer crosses
 * {@link STDOUT_FLUSH_CHARS}) cuts the per-chunk event volume without losing
 * output — the pending buffer is always flushed before settling.
 */
const STDOUT_FLUSH_MS = 25;
const STDOUT_FLUSH_CHARS = 4_096;

export interface OneShotChildParams {
  adapter: AgentAdapter;
  projectLocation: ProjectLocation;
  model: string;
  effort: string | undefined;
  prompt: string;
  /** Safety ceiling on process lifetime (ms). */
  maxLifetimeMs?: number;
  /** Streamed stdout chunk (ANSI-stripped, micro-batched). */
  onTextDelta: (delta: string) => void;
  /** Terminal settle. `completed` on exit 0, `failed` otherwise. */
  onSettle: (result: { status: "completed" | "failed"; errorMessage?: string }) => void;
}

export interface OneShotChildHandle {
  /** SIGTERM now, SIGKILL after a grace period. Idempotent. */
  cancel(): void;
}

/** A no-op handle returned when spawning failed synchronously (already settled). */
const NOOP_HANDLE: OneShotChildHandle = { cancel: () => {} };

/** Terminal result computed by a transport from its exit signal. */
interface SettleResult {
  status: "completed" | "failed";
  errorMessage?: string;
}

/**
 * The minimal per-lane surface the shared driver needs. Each lane (child_process
 * vs node-pty) adapts its own spawn/stream/exit/kill primitives to this shape so
 * the settle / lifetime / cancel / kill-grace state machine lives in one place.
 */
interface ChildTransport {
  /** Feed the prompt to the child (lane decides stdin.end vs pty.write). */
  write(input: string): void;
  /** Raw (un-stripped) stdout chunks. */
  onData(cb: (chunk: string) => void): void;
  /** Fires once with the terminal result derived from the exit signal. */
  onExit(cb: (result: SettleResult) => void): void;
  /** Graceful terminate (SIGTERM). */
  kill(): void;
  /** Forceful terminate (SIGKILL). */
  killForce(): void;
}

type SpawnSpec = {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
};

/**
 * Drive an agent WITHOUT a structured runtime as a one-shot subagent child:
 * build its bypass-permissions CLI invocation, spawn it in the parent's project
 * cwd (WSL-aware via {@link buildOneShotSpec}), stream stdout incrementally, and
 * settle from the exit code (0 → completed with accumulated output; non-zero →
 * failed with the stderr tail / exit-code message).
 *
 * Recursion guard parity: one-shot children carry no MCP config, so they can't
 * spawn grandchildren.
 */
export function runOneShotChild(params: OneShotChildParams): OneShotChildHandle {
  const cmd = params.adapter.buildSubagentOneShotCommand?.({
    model: params.model,
    effort: params.effort,
    prompt: params.prompt,
    location: params.projectLocation,
  });
  if (!cmd) {
    params.onSettle({
      status: "failed",
      errorMessage: `${params.adapter.label} cannot be spawned as a one-shot subagent`,
    });
    return NOOP_HANDLE;
  }

  const spec = buildOneShotSpec(params.projectLocation, cmd.command, cmd.args, {
    ...(cmd.env ? { env: cmd.env } : {}),
  });
  const input = cmd.stdin ?? params.prompt;
  const maxLifetimeMs = params.maxLifetimeMs ?? ONE_SHOT_CHILD_MAX_LIFETIME_MS;

  let transport: ChildTransport;
  try {
    transport = cmd.pty ? spawnPtyTransport(spec) : spawnProcessTransport(spec);
  } catch (error) {
    params.onSettle({
      status: "failed",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return NOOP_HANDLE;
  }

  return driveChild(transport, input, maxLifetimeMs, params);
}

/**
 * The single settle/lifetime/cancel/kill-grace/delta-batch state machine shared
 * by both transports. Preserves exact semantics: exit-derived settle, unref'd
 * lifetime timer, SIGTERM→grace→SIGKILL cancel, timers cleared on settle, and a
 * pending stdout buffer that is always flushed before settling.
 */
function driveChild(
  transport: ChildTransport,
  input: string,
  maxLifetimeMs: number,
  params: OneShotChildParams,
): OneShotChildHandle {
  let settled = false;
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  let buffer = "";

  const flush = () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = undefined;
    }
    if (!buffer) return;
    const text = buffer;
    buffer = "";
    params.onTextDelta(text);
  };

  const lifetimeTimer = armUnref(setTimeout(() => cancel(), maxLifetimeMs));

  const settle = (result: SettleResult) => {
    if (settled) return;
    settled = true;
    clearTimeout(lifetimeTimer);
    if (killTimer) clearTimeout(killTimer);
    flush();
    params.onSettle(
      result.errorMessage
        ? { status: result.status, errorMessage: result.errorMessage }
        : { status: result.status },
    );
  };

  transport.onData((chunk) => {
    const text = stripAnsi(chunk);
    if (!text) return;
    buffer += text;
    if (buffer.length >= STDOUT_FLUSH_CHARS) {
      flush();
    } else if (!flushTimer) {
      flushTimer = armUnref(setTimeout(flush, STDOUT_FLUSH_MS));
    }
  });
  transport.onExit((result) => settle(result));

  transport.write(input);

  const cancel = () => {
    if (settled) return;
    transport.kill();
    killTimer = armUnref(setTimeout(() => transport.killForce(), KILL_GRACE_MS));
  };

  return { cancel };
}

/** child_process lane: pipe stdio, accumulate stderr, settle from close/error. */
function spawnProcessTransport(spec: SpawnSpec): ChildTransport {
  const child = spawnChild(spec.command, spec.args, {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    ...(spec.cwd ? { cwd: spec.cwd } : {}),
    ...(spec.env ? { env: { ...processEnvRecord(), ...spec.env } } : {}),
  });

  const stderrChunks: string[] = [];
  child.stderr?.on("data", (data: Buffer) => {
    stderrChunks.push(data.toString());
  });

  return {
    write(input) {
      try {
        child.stdin?.end(input);
      } catch {
        // stdin may already be closed if the process died immediately.
      }
    },
    onData(cb) {
      child.stdout?.on("data", (data: Buffer) => cb(data.toString()));
    },
    onExit(cb) {
      child.on("error", (err) => cb({ status: "failed", errorMessage: err.message }));
      child.on("close", (code) => {
        if (code === 0) {
          cb({ status: "completed" });
        } else {
          const tail = stderrChunks.join("").slice(-STDERR_TAIL_CHARS).trim();
          cb({ status: "failed", errorMessage: tail || `Agent exited with code ${code}` });
        }
      });
    },
    kill() {
      child.kill("SIGTERM");
    },
    killForce() {
      if (!child.killed) child.kill("SIGKILL");
    },
  };
}

/** node-pty lane: single combined stream, settle from the exit code. */
function spawnPtyTransport(spec: SpawnSpec): ChildTransport {
  ensureNodePtySpawnHelperExecutable();
  const pty = spawnPty(spec.command, spec.args, {
    cols: 120,
    rows: 30,
    ...(spec.cwd ? { cwd: spec.cwd } : {}),
    env: { ...processEnvRecord(), ...spec.env },
  });

  let dataDisposable: IDisposable | undefined;
  let exitDisposable: IDisposable | undefined;

  return {
    write(input) {
      if (input) pty.write(input);
    },
    onData(cb) {
      dataDisposable = pty.onData((data) => cb(data));
    },
    onExit(cb) {
      exitDisposable = pty.onExit(({ exitCode }) => {
        dataDisposable?.dispose();
        exitDisposable?.dispose();
        cb(
          exitCode === 0
            ? { status: "completed" }
            : { status: "failed", errorMessage: `Agent exited with code ${exitCode}` },
        );
      });
    },
    kill() {
      try {
        pty.kill();
      } catch {
        // PTY may already be gone.
      }
    },
    killForce() {
      try {
        pty.kill("SIGKILL");
      } catch {
        // Already reaped.
      }
    },
  };
}

function armUnref(timer: ReturnType<typeof setTimeout>): ReturnType<typeof setTimeout> {
  if (typeof timer.unref === "function") timer.unref();
  return timer;
}
