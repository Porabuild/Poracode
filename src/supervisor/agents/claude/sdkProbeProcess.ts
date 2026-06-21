import { spawn } from "node:child_process";
import type { SpawnOptions, SpawnedProcess } from "@anthropic-ai/claude-agent-sdk";
import { buildAgentCommand, definedEnv } from "../base";

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
  // On Windows, route through the shared launch builder so npm `.cmd` shims are
  // rewritten to `node.exe cli.mjs` and the probe child spawns no console window.
  let command = options.command;
  let args = options.args;
  let env: Record<string, string | undefined> | undefined = options.env;
  let cwd = options.cwd;
  if (process.platform === "win32") {
    const spec = buildAgentCommand(
      { kind: "windows", path: options.cwd ?? process.cwd() },
      options.command,
      options.args,
      undefined,
      definedEnv(options.env),
    );
    command = spec.command;
    args = spec.args;
    env = spec.env;
    cwd = spec.cwd;
  }

  const child = spawn(command, args, {
    ...(env ? { env } : {}),
    signal: options.signal,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    ...(cwd ? { cwd } : {}),
  }) as unknown as SpawnedProcess;

  child.stdin.on("error", (error: Error) => {
    if (isEpipeError(error)) return;
    throw error;
  });

  return child;
}
