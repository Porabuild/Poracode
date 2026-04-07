import type { ProjectLocation } from "../shared/contracts";
import type { AgentAdapter } from "./agents/base";
import { GitService } from "./git";
import { buildOneShotSpec, spawnAgent } from "./oneShotSpawn";

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

function extractJsonResult(raw: string): string | undefined {
  try {
    const parsed = JSON.parse(raw) as { result?: unknown };
    return typeof parsed?.result === "string" ? parsed.result : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Strip LLM artifacts from raw output: thinking tags, code fences,
 * preamble commentary ("Here's the commit message:"), and trailing prose.
 */
export function cleanCommitMessage(raw: string): string {
  let text = extractJsonResult(raw) ?? raw;

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

  const gitService = new GitService();

  let diff = await gitService.getStagedDiff(location);
  if (!diff.trim()) {
    diff = await gitService.getAllDiff(location);
  }
  if (!diff.trim()) {
    throw new Error("No changes to describe");
  }

  const prompt = PROMPT + truncateDiff(diff);
  const cmd = adapter.buildOneShotCommand(effectiveModel, effort, prompt);
  if (!cmd) {
    throw new Error(`${adapter.label} does not support one-shot generation`);
  }

  const spawnSpec = buildOneShotSpec(location, cmd.command, cmd.args);
  console.log(`[commit-gen] spawning: ${spawnSpec.command} ${spawnSpec.args.join(" ")}`);

  const raw = await spawnAgent(spawnSpec, cmd.stdin ?? prompt, COMMIT_MESSAGE_TIMEOUT_MS);
  return cleanCommitMessage(raw);
}
