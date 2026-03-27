import { spawn as spawnChild } from "node:child_process";
import type { ProjectLocation } from "../shared/contracts";
import type { AgentAdapter } from "./agents/base";
import { GitService } from "./git";

const PROMPT =
  "Generate a concise git commit message for the following diff. " +
  "Use imperative mood. Subject line only, no body, no prefix like 'feat:'. " +
  "Keep it under 72 characters. Reply with only the commit message, nothing else.\n\n";

const MAX_DIFF_CHARS = 8000;

function truncateDiff(diff: string): string {
  if (diff.length <= MAX_DIFF_CHARS) return diff;
  return diff.slice(0, MAX_DIFF_CHARS) + "\n\n[diff truncated]";
}

function spawnAgent(command: string, args: string[], input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawnChild(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      timeout: 30_000,
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
      } else {
        reject(new Error(stderr.trim() || `Agent exited with code ${code}`));
      }
    });

    child.stdin.write(input);
    child.stdin.end();
  });
}

export async function generateCommitMessage(
  location: ProjectLocation,
  adapter: AgentAdapter,
  model?: string,
): Promise<string> {
  const effectiveModel = model ?? adapter.defaultOneShotModel;
  if (!effectiveModel) {
    throw new Error(`No default one-shot model configured for ${adapter.label}`);
  }

  if (!adapter.buildOneShotCommand) {
    throw new Error(`${adapter.label} does not support one-shot generation`);
  }

  const cmd = adapter.buildOneShotCommand(effectiveModel);
  if (!cmd) {
    throw new Error(`${adapter.label} CLI not found`);
  }

  const gitService = new GitService();

  let diff = await gitService.getStagedDiff(location);
  if (!diff.trim()) {
    diff = await gitService.getAllDiff(location);
  }
  if (!diff.trim()) {
    throw new Error("No changes to describe");
  }

  return spawnAgent(cmd.command, cmd.args, PROMPT + truncateDiff(diff));
}
