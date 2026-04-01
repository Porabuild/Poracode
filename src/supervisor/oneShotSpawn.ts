import { spawn as spawnChild } from "node:child_process";
import type { ProjectLocation } from "../shared/contracts";
import { buildAgentCommand, type CommandSpec } from "./agents/base";

export function buildOneShotSpec(
  location: ProjectLocation,
  command: string,
  args: string[],
): CommandSpec {
  return buildAgentCommand(location, command, args);
}

export function spawnAgent(spec: CommandSpec, input: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawnChild(spec.command, spec.args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      timeout: timeoutMs,
      ...(spec.cwd ? { cwd: spec.cwd } : {}),
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0 && stdout.trim()) {
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
