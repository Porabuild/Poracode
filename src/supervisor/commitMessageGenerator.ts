import { spawn as spawnChild } from "node:child_process";
import type { ProjectLocation } from "../shared/contracts";
import {
  resolveExecutablePathAsync,
  wrapWslCommand,
  type AgentAdapter,
  type CommandSpec,
} from "./agents/base";
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

/**
 * Strip LLM artifacts from raw output: thinking tags, code fences,
 * preamble commentary ("Here's the commit message:"), and trailing prose.
 */
export function cleanCommitMessage(raw: string): string {
  let text = raw;

  // Strip <think>…</think> / <antThinking>…</antThinking> blocks
  text = text.replace(/<(think|antThinking)>[\s\S]*?<\/\1>/g, "");

  // Strip markdown code fences (``` optionally with language tag)
  text = text.replace(/```[a-z]*\n?/g, "");

  // Drop lines that look like preamble/commentary before the real message
  const lines = text.split("\n");
  const commitStart = lines.findIndex((l) =>
    /^(feat|fix|docs|refactor|perf|test|build|ci|chore|revert)(\(.+?\))?!?:/.test(l.trim()),
  );
  if (commitStart > 0) {
    text = lines.slice(commitStart).join("\n");
  }

  return text.trim();
}

function truncateDiff(diff: string): string {
  if (diff.length <= MAX_DIFF_CHARS) return diff;
  return diff.slice(0, MAX_DIFF_CHARS) + "\n\n[diff truncated]";
}

function buildSpawnSpec(
  location: ProjectLocation,
  command: string,
  args: string[],
  resolvedPath?: string,
): CommandSpec {
  if (location.kind === "wsl") {
    return wrapWslCommand(location, command, args);
  }

  if (!resolvedPath) {
    throw new Error(`Resolved path missing for ${command}`);
  }

  return {
    command: resolvedPath,
    args,
    cwd: location.path,
  };
}

function spawnAgent(spec: CommandSpec, input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawnChild(spec.command, spec.args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      timeout: COMMIT_MESSAGE_TIMEOUT_MS,
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

  const resolvedPath =
    location.kind === "wsl" ? undefined : await resolveExecutablePathAsync(cmd.command);
  if (location.kind !== "wsl" && !resolvedPath) {
    throw new Error(`${adapter.label} CLI not found: ${cmd.command}`);
  }

  const spawnSpec = buildSpawnSpec(location, cmd.command, cmd.args, resolvedPath);
  console.log(`[commit-gen] spawning: ${spawnSpec.command} ${spawnSpec.args.join(" ")}`);

  const gitService = new GitService();

  let diff = await gitService.getStagedDiff(location);
  if (!diff.trim()) {
    diff = await gitService.getAllDiff(location);
  }
  if (!diff.trim()) {
    throw new Error("No changes to describe");
  }

  const raw = await spawnAgent(spawnSpec, PROMPT + truncateDiff(diff));
  return cleanCommitMessage(raw);
}
