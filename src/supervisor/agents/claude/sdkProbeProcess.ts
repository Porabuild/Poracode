import { spawn } from "node:child_process";
import type { SpawnOptions, SpawnedProcess } from "@anthropic-ai/claude-agent-sdk";

function isEpipeError(error: Error): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "EPIPE" || error.message === "write EPIPE";
}

/**
 * The SDK probe owns a short-lived child process and may close/abort it while the
 * SDK is still draining streaming input. On Windows that can emit stdin EPIPE
 * outside the SDK's awaited promise chain; keep that broken pipe local to this
 * probe child while preserving all other stream errors.
 */
export function spawnClaudeProbeProcess(options: SpawnOptions): SpawnedProcess {
  const child = spawn(options.command, options.args, {
    env: options.env,
    signal: options.signal,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    ...(options.cwd ? { cwd: options.cwd } : {}),
  }) as unknown as SpawnedProcess;

  child.stdin.on("error", (error: Error) => {
    if (isEpipeError(error)) return;
    throw error;
  });

  return child;
}
