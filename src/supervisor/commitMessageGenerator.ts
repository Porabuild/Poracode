import { spawn as spawnChild } from "node:child_process";
import type { ProjectLocation } from "../shared/contracts";
import { resolveExecutablePathAsync, type AgentAdapter } from "./agents/base";
import { GitService } from "./git";

const PROMPT =
  "Generate a git commit message for the following diff using the Conventional Commits format.\n" +
  "Rules:\n" +
  "- Format: <type>(<scope>): <description>\n" +
  "- Types: feat, fix, docs, refactor, perf, test, build, ci, chore, revert\n" +
  "- Scope is optional, infer from the changed files/modules if clear\n" +
  "- Use imperative mood for the description\n" +
  "- Keep the subject line under 72 characters\n" +
  "- If the change is complex, add a blank line then a brief body (1-3 lines)\n" +
  "- If there are breaking changes, add a BREAKING CHANGE footer or use ! after the type\n" +
  "- Reply with only the commit message, nothing else\n\n";

const MAX_DIFF_CHARS = 8000;
const COMMIT_MESSAGE_TIMEOUT_MS = 120_000;

function truncateDiff(diff: string): string {
  if (diff.length <= MAX_DIFF_CHARS) return diff;
  return diff.slice(0, MAX_DIFF_CHARS) + "\n\n[diff truncated]";
}

function getCommandCwd(location: ProjectLocation): string | undefined {
  if (location.kind === "windows" || location.kind === "posix") {
    return location.path;
  }
  return undefined;
}

function spawnAgent(
  command: string,
  args: string[],
  input: string,
  cwd?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawnChild(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      timeout: COMMIT_MESSAGE_TIMEOUT_MS,
      ...(cwd ? { cwd } : {}),
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
        reject(new Error("Agent timed out while generating commit message"));
      } else {
        reject(new Error(stderr.trim() || `Agent exited with code ${code}`));
      }
    });

    child.stdin.end(input);
  });
}

export async function generateCommitMessage(
  location: ProjectLocation,
  adapter: AgentAdapter,
  model?: string,
  effort?: string,
): Promise<string> {
  const effectiveModel = model ?? adapter.defaultOneShotModel;
  if (!effectiveModel) {
    throw new Error(`No default one-shot model configured for ${adapter.label}`);
  }

  if (!adapter.buildOneShotCommand) {
    throw new Error(`${adapter.label} does not support one-shot generation`);
  }

  const cmd = adapter.buildOneShotCommand(effectiveModel, effort);
  if (!cmd) {
    throw new Error(`${adapter.label} does not support one-shot generation`);
  }

  // Verify the CLI is reachable before spawning.
  const resolvedPath = await resolveExecutablePathAsync(cmd.command);
  if (!resolvedPath) {
    throw new Error(`${adapter.label} CLI not found: ${cmd.command}`);
  }
  console.log(`[commit-gen] spawning: ${cmd.command} ${cmd.args.join(" ")}`);

  const gitService = new GitService();

  let diff = await gitService.getStagedDiff(location);
  if (!diff.trim()) {
    diff = await gitService.getAllDiff(location);
  }
  if (!diff.trim()) {
    throw new Error("No changes to describe");
  }

  return spawnAgent(
    cmd.command,
    cmd.args,
    PROMPT + truncateDiff(diff),
    getCommandCwd(location),
  );
}
