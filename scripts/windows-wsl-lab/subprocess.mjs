import { spawn } from "node:child_process";
import { join } from "node:path";

import {
  EXEC_TIMEOUT_MS,
  HARD_KILL_SLACK_MS,
  KILL_TREE_TIMEOUT_MS,
  MAX_CAPTURE_BYTES,
  WSL_NO_DISTROS_EXIT,
} from "./constants.mjs";
import { SubprocessError, UsageError } from "./errors.mjs";
import { computeTaskkillArgs, decodeWslOutput, parseDistroList } from "./pure.mjs";

// ── Bounded subprocess core ─────────────────────────────────────────────────

export function systemCommand(...segments) {
  const systemRoot = process.env.SystemRoot ?? process.env.windir ?? "C:\\Windows";
  return join(systemRoot, "System32", ...segments);
}

function killTree(child) {
  const pid = child.pid;
  if (pid === undefined) {
    try {
      child.kill("SIGKILL");
    } catch {
      // Already gone.
    }
    return;
  }
  if (process.platform === "win32") {
    try {
      const killer = spawn(systemCommand("taskkill.exe"), computeTaskkillArgs(pid), {
        stdio: "ignore",
        windowsHide: true,
      });
      const settle = () => undefined;
      killer.once("close", settle);
      killer.once("error", settle);
    } catch {
      try {
        child.kill("SIGKILL");
      } catch {
        // Already gone.
      }
    }
    return;
  }
  try {
    child.kill("SIGKILL");
  } catch {
    // Already gone.
  }
}

/**
 * Run one subprocess with a hard deadline and an argv array. stdout/stderr are
 * captured with byte caps; the deadline kills the whole Windows process tree,
 * and a hard fallback rejects even if the killed process never reaps.
 * Non-zero exit throws SubprocessError unless the code is allow-listed.
 */
export function runBounded(file, args, options) {
  const {
    timeoutMs,
    stdin,
    cwd,
    env,
    label = file,
    allowExitCodes = [0],
    maxOutputBytes = MAX_CAPTURE_BYTES,
  } = options;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new UsageError(`runBounded(${label}) requires a positive timeoutMs`);
  }
  return new Promise((resolveRun, rejectRun) => {
    let settled = false;
    let timedOut = false;
    let capturedBytes = 0;
    let stderrTail = "";
    let child;
    const chunks = { stdout: [], stderr: [] };

    const finish = (settle) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(hardTimer);
      settle();
    };
    const timer = setTimeout(() => {
      timedOut = true;
      if (child) killTree(child);
    }, timeoutMs);
    timer.unref?.();
    // Even an unkillable process cannot hold this promise past the hard limit.
    const hardTimer = setTimeout(
      () => {
        timedOut = true;
        finish(() => rejectRun(new SubprocessError(label, "timeout", stderrTail)));
      },
      timeoutMs + KILL_TREE_TIMEOUT_MS + HARD_KILL_SLACK_MS,
    );
    hardTimer.unref?.();

    try {
      child = spawn(file, args, {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        ...(cwd !== undefined ? { cwd } : {}),
        ...(env !== undefined ? { env } : {}),
      });
    } catch (error) {
      finish(() => rejectRun(new SubprocessError(label, -1, String(error))));
      return;
    }

    child.once("error", (error) => {
      finish(() => rejectRun(new SubprocessError(label, -1, String(error))));
    });
    child.once("close", (code) => {
      if (timedOut) {
        finish(() => rejectRun(new SubprocessError(label, "timeout", stderrTail)));
        return;
      }
      const tail = stderrTail.trim();
      if (!allowExitCodes.includes(code ?? -1)) {
        finish(() => rejectRun(new SubprocessError(label, code ?? -1, tail)));
        return;
      }
      finish(() =>
        resolveRun({
          code: code ?? -1,
          stdout: Buffer.concat(chunks.stdout),
          stderr: Buffer.concat(chunks.stderr),
        }),
      );
    });

    if (stdin !== undefined) {
      child.stdin?.once("error", () => undefined);
      child.stdin?.end(stdin);
    } else {
      child.stdin?.end();
    }

    for (const channel of ["stdout", "stderr"]) {
      child[channel]?.on("data", (chunk) => {
        capturedBytes += chunk.length;
        if (capturedBytes > maxOutputBytes) {
          stderrTail = "output exceeded capture cap";
          killTree(child);
          return;
        }
        chunks[channel].push(chunk);
        if (channel === "stderr") {
          stderrTail = `${stderrTail}${chunk.toString("utf8")}`.slice(-2_000);
        }
      });
    }
  });
}

function wslPath() {
  return systemCommand("wsl.exe");
}

export async function runWsl(args, options = {}) {
  return runBounded(wslPath(), args, {
    label: `wsl.exe ${args[0] ?? ""}`.trim(),
    ...options,
  });
}

export async function wslListDistros(log) {
  // Older WSL exits 0xFFFFFFFF when no distros are registered.
  const result = await runWsl(["--list", "--quiet"], {
    timeoutMs: EXEC_TIMEOUT_MS,
    allowExitCodes: [0, WSL_NO_DISTROS_EXIT],
  });
  const names = parseDistroList(decodeWslOutput(result.stdout));
  log(
    `registered distros: ${
      names.length > 0 ? names.map((name) => JSON.stringify(name)).join(", ") : "(none)"
    }`,
  );
  return names;
}
