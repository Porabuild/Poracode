import { spawn as spawnChild } from "node:child_process";
import { tmpdir } from "node:os";
import { spawn as spawnPty } from "node-pty";
import { stripAnsi } from "@/shared/ansi";
import type { ProjectLocation } from "@/shared/contracts";
import { terminateProcessTree } from "@/shared/processTree";
import { buildAgentCommand, type CommandSpec } from "./agents/base";
import { ensureNodePtySpawnHelperExecutable } from "./nodePty";
import { processEnvRecord } from "./processEnv";

export interface OneShotSpecOptions {
  /**
   * Run the one-shot in a throwaway scratch cwd instead of the project cwd.
   * Some CLIs (e.g. `agy`) key their "last conversation per workspace" cache
   * on the working directory, so a one-shot launched in the project cwd would
   * overwrite that entry and get mistaken for the real interactive session by
   * `discoverSessionRef`. One-shots embed all input in the prompt, so the cwd
   * is irrelevant to the result.
   */
  isolateCwd?: boolean | undefined;
  env?: Record<string, string> | undefined;
}

/**
 * Swap a location's working directory for a platform-appropriate scratch dir,
 * keeping every other field (distro, kind) intact. WSL must stay a Linux path
 * inside the distro; native uses the OS temp dir.
 */
function isolatedCwdLocation(location: ProjectLocation): ProjectLocation {
  if (location.kind === "wsl") {
    return { ...location, linuxPath: "/tmp" };
  }
  return { ...location, path: tmpdir() };
}

export function buildOneShotSpec(
  location: ProjectLocation,
  command: string,
  args: string[],
  options?: OneShotSpecOptions,
): CommandSpec {
  const effectiveLocation = options?.isolateCwd ? isolatedCwdLocation(location) : location;
  return buildAgentCommand(effectiveLocation, command, args, undefined, options?.env);
}

/**
 * Resolve the spawn spec and spawn implementation for a `buildOneShotCommand`
 * result in one place, so every one-shot caller honors the two command flags
 * identically: `isolateCwd` neutralizes the working directory (see
 * `OneShotSpecOptions`) and `pty` selects the terminal-backed spawner for CLIs
 * that only emit their answer when attached to a tty (e.g. `agy -p`).
 */
export function prepareOneShot(
  location: ProjectLocation,
  cmd: {
    command: string;
    args: string[];
    isolateCwd?: boolean;
    pty?: boolean;
    env?: Record<string, string>;
  },
): { spec: CommandSpec; spawn: typeof spawnAgent } {
  const spec = buildOneShotSpec(location, cmd.command, cmd.args, {
    isolateCwd: cmd.isolateCwd,
    ...(cmd.env ? { env: cmd.env } : {}),
  });
  return { spec, spawn: cmd.pty ? spawnAgentPty : spawnAgent };
}

export function spawnAgent(
  spec: CommandSpec,
  input: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Aborted"));
      return;
    }

    const child = spawnChild(spec.command, spec.args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      timeout: timeoutMs,
      ...(spec.cwd ? { cwd: spec.cwd } : {}),
      ...(spec.env ? { env: { ...process.env, ...spec.env } } : {}),
    });

    const onAbort = () => {
      child.kill();
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", (err) => {
      signal?.removeEventListener("abort", onAbort);
      reject(err);
    });
    child.on("close", (code) => {
      signal?.removeEventListener("abort", onAbort);
      if (signal?.aborted) {
        reject(new Error("Aborted"));
      } else if (code === 0 && stdout.trim()) {
        resolve(stdout.trim());
      } else if (code === null && child.killed) {
        reject(new Error("Agent timed out"));
      } else {
        reject(new Error(stderr.trim() || `Agent exited with code ${code}`));
      }
    });

    child.stdin.end(input);
  });
}

export function spawnAgentPty(
  spec: CommandSpec,
  input: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Aborted"));
      return;
    }

    ensureNodePtySpawnHelperExecutable();

    let pty;
    try {
      pty = spawnPty(spec.command, spec.args, {
        cols: 120,
        rows: 30,
        ...(spec.cwd ? { cwd: spec.cwd } : {}),
        env: { ...processEnvRecord(), ...spec.env },
      });
    } catch (error) {
      reject(error);
      return;
    }

    let output = "";
    let timedOut = false;

    const killPty = () => {
      if (process.platform === "win32") {
        terminateProcessTree(pty.pid);
        return;
      }
      pty.kill();
    };
    const onAbort = () => {
      killPty();
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killPty();
    }, timeoutMs);
    if (typeof timer.unref === "function") timer.unref();

    const dataDisposable = pty.onData((data) => {
      output += data;
    });
    const exitDisposable = pty.onExit(({ exitCode }) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      dataDisposable.dispose();
      exitDisposable.dispose();

      const text = stripAnsi(output).trim();
      if (signal?.aborted) {
        reject(new Error("Aborted"));
      } else if (timedOut) {
        reject(new Error("Agent timed out"));
      } else if (exitCode === 0 && text) {
        resolve(text);
      } else {
        reject(new Error(text || `Agent exited with code ${exitCode}`));
      }
    });

    signal?.addEventListener("abort", onAbort, { once: true });
    if (input) pty.write(input);
  });
}
