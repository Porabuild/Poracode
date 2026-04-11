import type { ProjectLocation } from "../shared/contracts";
import type { AgentAdapter } from "./agents/base";
import { GitService } from "./git";
import { buildOneShotSpec, spawnAgent } from "./oneShotSpawn";

const PROMPT =
  "Generate a pull request title and description for the following changes.\n" +
  "Rules:\n" +
  "- The title should be a single line, at most 72 characters, imperative mood\n" +
  "- The description should be a concise markdown summary (2-5 bullet points)\n" +
  "- Focus on the what and why, not the how\n" +
  "- Detect the PR type from the branch name and changes:\n" +
  "  - fix/, bugfix/, hotfix/ prefixes or bug-related changes → Bugfix\n" +
  "  - feat/, feature/ prefixes or new functionality → Feature\n" +
  "  - If the PR covers multiple purposes (e.g. feature + refactor), note them\n" +
  "- Look for Jira/ticket IDs (pattern: 2-5 uppercase letters + dash + digits, e.g. SIT-123, TDNT-456, SN-78)\n" +
  "  in both the branch name AND commit messages. Collect all unique ticket IDs found.\n" +
  "  Include the primary ticket at the start of the title like: SIT-123: <title>\n" +
  "  and list all tickets at the top of the description, e.g. `Tickets: SIT-123, SIT-456`\n" +
  "- Reply with ONLY the following format, nothing else:\n" +
  "TITLE: <title>\n" +
  "DESCRIPTION:\n" +
  "<description>\n\n";

const MAX_DIFF_CHARS = 8000;
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
): Promise<{ title: string; description: string }> {
  const effectiveModel = model ?? adapter.defaultOneShotModel;
  if (!effectiveModel) {
    throw new Error(`No default one-shot model configured for ${adapter.label}`);
  }

  if (!adapter.buildOneShotCommand) {
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

  let prompt = PROMPT;
  prompt += `Branch: ${branch} → ${baseBranch}\n\n`;
  prompt += "Git log:\n" + truncate(log, MAX_LOG_CHARS);
  if (diff.trim()) {
    prompt += "\n\nDiff:\n" + truncate(diff, MAX_DIFF_CHARS);
  }

  const cmd = adapter.buildOneShotCommand(effectiveModel, effort, prompt);
  if (!cmd) {
    throw new Error(`${adapter.label} does not support one-shot generation`);
  }

  const spawnSpec = buildOneShotSpec(location, cmd.command, cmd.args);
  console.log(`[pr-summary-gen] spawning: ${spawnSpec.command} ${spawnSpec.args.join(" ")}`);

  const raw = await spawnAgent(spawnSpec, cmd.stdin ?? prompt, PR_SUMMARY_TIMEOUT_MS);
  const result = cleanPrSummary(raw);
  if (!result.title) {
    throw new Error("PR summary generation returned empty title");
  }
  return result;
}
