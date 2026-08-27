import type { ProjectLocation } from "@/shared/contracts";
import { resolveOneShotEffectiveModel, type AgentAdapter } from "./agents/base";
import { buildDiffPromptContext, getFilesFromDiff } from "./diffPromptContext";
import { GitService } from "./git";
import { runOneShotPromptWithFallback } from "./oneShotPromptRunner";

/**
 * Build the PR-summary instruction prompt. When `language` is set, the title
 * and description prose are written in that language while the literal output
 * markers (`TITLE:` / `DESCRIPTION:`) and ticket IDs stay English — both are
 * parsed by `cleanPrSummary`, so they must not be localized.
 */
function buildPrompt(language?: string): string {
  const languageRule = language
    ? `- Write the title and description in ${language}; keep the literal labels TITLE: and DESCRIPTION: and any ticket IDs in English\n`
    : "";
  return (
    "Generate a pull request title and description for the following changes.\n" +
    "Rules:\n" +
    "- The title should be a single line, at most 72 characters, imperative mood\n" +
    "- The description should be a concise markdown summary (2-5 bullet points)\n" +
    "- Focus on the what and why, not the how\n" +
    "- Use the changed files list as the source of truth for coverage\n" +
    "- Cover every major area; do not focus only on the largest or first diff\n" +
    "- Detect the PR type from the branch name and changes:\n" +
    "  - fix/, bugfix/, hotfix/ prefixes or bug-related changes → Bugfix\n" +
    "  - feat/, feature/ prefixes or new functionality → Feature\n" +
    "  - If the PR covers multiple purposes (e.g. feature + refactor), note them\n" +
    "- Look for Jira/ticket IDs (pattern: 2-5 uppercase letters + dash + digits, e.g. SIT-123, TDNT-456, SN-78)\n" +
    "  in both the branch name AND commit messages. Collect all unique ticket IDs found.\n" +
    "  Include the primary ticket at the start of the title like: SIT-123: <title>\n" +
    "  and list all tickets at the top of the description, e.g. `Tickets: SIT-123, SIT-456`\n" +
    languageRule +
    "- Reply with ONLY the following format, nothing else:\n" +
    "TITLE: <title>\n" +
    "DESCRIPTION:\n" +
    "<description>\n\n"
  );
}

const MAX_DIFF_CONTEXT_CHARS = 24_000;
const MAX_LOG_CHARS = 4000;
const PR_SUMMARY_TIMEOUT_MS = 120_000;

function extractJsonResult(raw: string): string | undefined {
  try {
    const parsed = JSON.parse(raw) as { result?: unknown };
    return typeof parsed?.result === "string" ? parsed.result : undefined;
  } catch {
    return undefined;
  }
}

export function cleanPrSummary(raw: string): { title: string; description: string } {
  let text = extractJsonResult(raw) ?? raw;

  // Strip <think>…</think> / <antThinking>…</antThinking> blocks
  text = text.replace(/<(think|antThinking)>[\s\S]*?<\/\1>/g, "");

  // Strip markdown code fences
  text = text.replace(/```[a-z]*\n?/g, "");

  const titleMatch = text.match(/TITLE:\s*(.+)/);
  const descMatch = text.match(/DESCRIPTION:\s*\n([\s\S]*)/);

  const title = titleMatch?.[1]?.trim().replace(/^["'`]+|["'`]+$/g, "") ?? "";
  const description = descMatch?.[1]?.trim() ?? "";

  return { title, description };
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "\n\n[truncated]";
}

export async function generatePrSummary(
  location: ProjectLocation,
  adapter: AgentAdapter,
  branch: string,
  baseBranch: string,
  model?: string,
  effort?: string,
  language?: string,
): Promise<{ title: string; description: string }> {
  const effectiveModel = resolveOneShotEffectiveModel(adapter, model, () => {
    return new Error(`No default one-shot model configured for ${adapter.label}`);
  });

  if (!adapter.runOneShot && !adapter.buildOneShotCommand) {
    throw new Error(`${adapter.label} does not support one-shot generation`);
  }

  const gitService = new GitService();

  // Get commit log between base and head
  let log = "";
  try {
    log = await gitService.getLogRange(location, baseBranch, branch);
  } catch {
    // fallback: empty log
  }
  if (!log.trim()) {
    throw new Error("No commits found between branches");
  }

  // Get diff between branches
  let diff = "";
  try {
    diff = await gitService.getDiffRange(location, baseBranch, branch);
  } catch {
    // fallback: empty diff
  }

  const branchHeader = `Branch: ${branch} → ${baseBranch}\n\n`;
  const logSection = "Git log:\n" + truncate(log, MAX_LOG_CHARS);
  const sourceLabel = `Branch diff: ${baseBranch}...${branch}`;
  const files = diff.trim() ? getFilesFromDiff(diff) : [];
  const instructions = buildPrompt(language);

  const raw = await runOneShotPromptWithFallback({
    location,
    adapter,
    model: effectiveModel,
    effort,
    timeoutMs: PR_SUMMARY_TIMEOUT_MS,
    logTag: "pr-summary-gen",
    attempts: [
      {
        level: "full",
        buildPrompt: () => {
          let prompt = instructions + branchHeader + logSection;
          if (diff.trim()) {
            prompt +=
              "\n\n" +
              buildDiffPromptContext({
                diff,
                files,
                sourceLabel,
                maxTotalDiffChars: MAX_DIFF_CONTEXT_CHARS,
              });
          }
          return prompt;
        },
      },
      {
        level: "files-only",
        buildPrompt: () => {
          let prompt = instructions + branchHeader + logSection;
          if (files.length > 0) {
            prompt += "\n\n" + buildDiffPromptContext({ diff: "", files, sourceLabel });
          }
          return prompt;
        },
      },
    ],
  });
  const result = cleanPrSummary(raw);
  if (!result.title) {
    throw new Error("PR summary generation returned empty title");
  }
  return result;
}
