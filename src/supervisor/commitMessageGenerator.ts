import type { GitFileChange, ProjectLocation } from "@/shared/contracts";
import type { AgentAdapter } from "./agents/base";
import { buildDiffPromptContext } from "./diffPromptContext";
import { GitService } from "./git";
import { runOneShotPromptWithFallback } from "./oneShotPromptRunner";

const PROMPT_RULES =
  "Generate a git commit message for the following diff using the Conventional Commits format.\n" +
  "Rules:\n" +
  "- Format: <type>(<scope>): <description>\n" +
  "- Types: feat, fix, docs, refactor, perf, test, build, ci, chore, revert\n" +
  "- Scope is optional, infer from the changed files/modules if clear\n" +
  "- Use imperative mood for the description\n" +
  "- Keep the subject line under 72 characters\n" +
  "- Use the changed files list as the source of truth for coverage\n" +
  "- If multiple major areas changed, add a blank line then concise body bullets\n" +
  "- Cover every major area; do not focus only on the largest or first diff\n" +
  "- If there are breaking changes, add a BREAKING CHANGE footer or use ! after the type\n";

/**
 * Build the commit-message instruction prompt. When `language` is set, the
 * subject and body are written in that language while the Conventional Commits
 * type prefix stays English (so `cleanCommitMessage`'s `feat|fix|…` detection
 * and the convention itself are preserved).
 */
function buildPrompt(language?: string): string {
  const languageRule = language
    ? `- Write the commit message subject and body in ${language}; keep the Conventional Commits type prefix (feat, fix, …) in English\n`
    : "";
  return PROMPT_RULES + languageRule + "- Reply with only the commit message, nothing else\n\n";
}

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

async function appendUntrackedDiffs(
  gitService: GitService,
  location: ProjectLocation,
  diff: string,
  files: GitFileChange[],
): Promise<string> {
  const untracked = files.filter((file) => file.status === "?");
  if (untracked.length === 0) {
    return diff;
  }

  const untrackedDiffs = await Promise.all(
    untracked.map(async (file) => {
      try {
        return (await gitService.getDiff(location, file.path, false)).diff;
      } catch {
        return "";
      }
    }),
  );

  return [diff, ...untrackedDiffs].filter((entry) => entry.trim()).join("\n\n");
}

export async function generateCommitMessage(
  location: ProjectLocation,
  adapter: AgentAdapter,
  model?: string,
  effort?: string,
  language?: string,
  fast?: boolean,
): Promise<string> {
  const effectiveModel = model ?? adapter.defaultOneShotModel;
  if (!effectiveModel) {
    throw new Error(`No default one-shot model configured for ${adapter.label}`);
  }

  if (!adapter.runOneShot && !adapter.buildOneShotCommand) {
    throw new Error(`${adapter.label} does not support one-shot generation`);
  }

  const gitService = new GitService();

  const status = await gitService.getStatus(location);
  let source: "staged" | "unstaged" = "staged";
  let files = status.staged;
  let diff = await gitService.getStagedDiff(location);
  if (!diff.trim() && files.length === 0) {
    source = "unstaged";
    files = status.unstaged;
    diff = await appendUntrackedDiffs(
      gitService,
      location,
      await gitService.getAllDiff(location),
      files,
    );
  }
  if (!diff.trim() && files.length === 0) {
    throw new Error("No changes to describe");
  }

  const sourceLabel = `Change source: ${source}`;
  const prompt = buildPrompt(language);
  const raw = await runOneShotPromptWithFallback({
    location,
    adapter,
    model: effectiveModel,
    effort,
    fast,
    timeoutMs: COMMIT_MESSAGE_TIMEOUT_MS,
    logTag: "commit-gen",
    attempts: [
      {
        level: "full",
        buildPrompt: () => prompt + buildDiffPromptContext({ diff, files, sourceLabel }),
      },
      {
        level: "files-only",
        buildPrompt: () => prompt + buildDiffPromptContext({ diff: "", files, sourceLabel }),
      },
    ],
  });
  return cleanCommitMessage(raw);
}
