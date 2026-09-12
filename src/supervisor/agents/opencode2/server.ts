import { spawn, type ChildProcess } from "node:child_process";
import { terminateChildProcessTree } from "@/shared/processTree";
import { ExpectedStructuredRuntimeError, type CommandSpec } from "../base";
import { classifyOpenCode2Error } from "./opencode2Errors";

const URL_LINE_PREFIX = "server listening";
const URL_REGEX = /on\s+(https?:\/\/[^\s]+)/;
const PASSWORD_LINE_PREFIX = "server password";
const PASSWORD_REGEX = /^server password (\S+)$/;
const READY_TIMEOUT_MS = 15_000;
const POSIX_TERM_GRACE_MS = 1_000;

/** Environmental/provider readiness failure, distinct from runtime defects. */
export class OpenCode2ReadinessTimeoutError extends ExpectedStructuredRuntimeError {
  override readonly name = "OpenCode2ReadinessTimeoutError";
}

const activeServerChildren = new Set<ChildProcess>();
let processExitCleanupRegistered = false;

export interface OpenCode2ServerHandle {
  readonly child: ChildProcess;
  readonly baseUrl: Promise<string>;
  /** Server-generated Basic password, announced on stdout after the URL. */
  readonly password: Promise<string>;
  /** Captured stdout/stderr buffer for error diagnostics. */
  readonly formatOutput: () => string;
  dispose(): Promise<void>;
}

interface PendingResolve {
  resolve(ready: { baseUrl: string; password: string }): void;
  reject(err: Error): void;
}

function terminateOpenCode2ServerChildNow(child: ChildProcess): void {
  if (typeof child.pid !== "number") return;
  if (child.exitCode !== null || child.killed) return;

  if (process.platform === "win32") {
    terminateChildProcessTree(child);
    return;
  }

  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    try {
      process.kill(child.pid, "SIGKILL");
    } catch {
      // Already gone.
    }
  }
}

/** Terminate only `opencode2 serve` children spawned through {@link spawnOpenCode2Server}. */
export function disposeSpawnedOpenCode2ServerHandles(): void {
  for (const child of activeServerChildren) {
    terminateOpenCode2ServerChildNow(child);
  }
  activeServerChildren.clear();
}

function registerProcessExitCleanup(): void {
  if (processExitCleanupRegistered) return;
  processExitCleanupRegistered = true;
  process.once("exit", disposeSpawnedOpenCode2ServerHandles);
}

export function spawnOpenCode2Server(commandSpec: CommandSpec): OpenCode2ServerHandle {
  registerProcessExitCleanup();
  const isWin = process.platform === "win32";
  const child = spawn(commandSpec.command, commandSpec.args, {
    cwd: commandSpec.cwd,
    env: {
      ...process.env,
      ...commandSpec.env,
    },
    stdio: ["pipe", "pipe", "pipe"],
    shell: false,
    windowsHide: true,
    // POSIX: own process group so dispose() can `kill(-pid, ...)` to take
    // the whole tree down (opencode2 forks subprocesses for tools).
    // Windows has no process groups; taskkill /T handles the tree.
    detached: !isWin,
  });
  activeServerChildren.add(child);

  let stdoutBuf = "";
  let stdoutAll = "";
  let stderrBuf = "";
  let baseUrl: string | undefined;
  let password: string | undefined;
  let pending: PendingResolve | undefined;

  const readyPromise = new Promise<{ baseUrl: string; password: string }>((resolve, reject) => {
    pending = { resolve, reject };
  });

  // The two readiness promises come off the same deferred; a caller that only
  // awaits one must not turn the other into an unhandled rejection.
  const baseUrlPromise = readyPromise.then((ready) => ready.baseUrl);
  const passwordPromise = readyPromise.then((ready) => ready.password);
  baseUrlPromise.catch(() => undefined);
  passwordPromise.catch(() => undefined);

  const settleIfReady = () => {
    if (!baseUrl || !password) return;
    clearTimeout(readyTimeout);
    pending?.resolve({ baseUrl, password });
  };

  // Spawn-error and early-exit guards (mirrors OpenCode 1 sdkServer.ts).
  child.once("error", (err) => {
    pending?.reject(
      new Error(classifyOpenCode2Error({ cause: err, operation: "spawn opencode2 serve" })),
    );
  });
  child.once("exit", (code, signal) => {
    activeServerChildren.delete(child);
    if (!baseUrl || !password) {
      const detail = formatOutput();
      const exitMessage = `opencode2 serve exited before ready (code=${code} signal=${signal}).${detail}`;
      // Run the captured stdout/stderr through the classifier too — a binary
      // that bails out on macOS quarantine, ENOENT, or a missing libc usually
      // prints something useful before exit, and we want the user-facing
      // message to reflect that instead of a bare exit code.
      pending?.reject(
        new Error(
          classifyOpenCode2Error({
            cause: new Error(`${exitMessage}\n${detail}`),
            operation: "opencode2 serve",
          }),
        ),
      );
    }
  });

  const readyTimeout = setTimeout(() => {
    if (!baseUrl || !password) {
      pending?.reject(
        new OpenCode2ReadinessTimeoutError(
          classifyOpenCode2Error({
            cause: new Error(
              `opencode2 serve did not emit its ready URL and password within ${READY_TIMEOUT_MS}ms`,
            ),
            operation: "opencode2 serve",
          }),
        ),
      );
    }
  }, READY_TIMEOUT_MS);
  // Don't keep the event loop alive on this timer.
  if (typeof readyTimeout.unref === "function") readyTimeout.unref();

  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    stdoutBuf += chunk;
    // Scan complete lines for the two ready markers: the bind URL first, then
    // the generated password the server prints right after it. A partial
    // trailing chunk stays buffered — matching on it could read a truncated
    // URL and strand every later request.
    const lines = stdoutBuf.split("\n");
    stdoutBuf = lines.pop() ?? "";
    for (const raw of lines) {
      const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
      // Readiness credentials are transport state, never diagnostic output.
      if (!line.startsWith(PASSWORD_LINE_PREFIX)) {
        stdoutAll = (stdoutAll + line + "\n").slice(-32_000);
      }
      if (!baseUrl && line.startsWith(URL_LINE_PREFIX)) {
        const m = line.match(URL_REGEX);
        if (m && m[1]) baseUrl = m[1];
      }
      if (!password && line.startsWith(PASSWORD_LINE_PREFIX)) {
        const m = line.match(PASSWORD_REGEX);
        if (m && m[1]) password = m[1];
      }
    }
    // Discard oversized incomplete diagnostic lines without retaining a
    // possible password fragment as a new line.
    if (stdoutBuf.length > 64_000) stdoutBuf = stdoutBuf.slice(0, 64_000);
    settleIfReady();
  });
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    // opencode2 emits structured `INFO ...` lines on stderr when run with
    // --print-logs; treat as diagnostic output, not errors.
    stderrBuf += chunk;
    // Keep the buffer bounded to avoid unbounded growth.
    if (stderrBuf.length > 64_000) {
      stderrBuf = stderrBuf.slice(-32_000);
    }
  });

  function formatOutput(): string {
    const redact = (text: string) =>
      (password ? text.replaceAll(password, "[redacted]") : text).replace(
        /server password[^\r\n]*/g,
        "server password [redacted]",
      );
    const out = redact(stdoutAll).trim();
    const err = redact(stderrBuf).trim();
    const parts: string[] = [];
    if (out) parts.push(`\n--- opencode2 stdout ---\n${out}`);
    if (err) parts.push(`\n--- opencode2 stderr ---\n${err}`);
    return parts.join("");
  }

  let disposed = false;
  async function dispose(): Promise<void> {
    if (disposed) return;
    disposed = true;
    clearTimeout(readyTimeout);
    if (child.exitCode !== null || child.killed) return;

    if (isWin) {
      // taskkill /T /F walks the descendant tree. Cleanest available signal
      // on Windows; no graceful equivalent exists for our use case.
      terminateChildProcessTree(child);
      return;
    }

    // POSIX: SIGTERM the process group, wait briefly, then SIGKILL.
    const pid = child.pid;
    if (typeof pid !== "number") return;
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      // Group may be gone; fall back to single-process kill.
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        return;
      }
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, POSIX_TERM_GRACE_MS);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    if (child.exitCode !== null) return;
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // Already gone.
      }
    }
  }

  return {
    child,
    baseUrl: baseUrlPromise,
    password: passwordPromise,
    formatOutput,
    dispose,
  };
}
