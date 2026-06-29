import type {
  JudgeExperimentCandidate,
  JudgeExperimentResult,
  ProjectLocation,
} from "@/shared/contracts";
import type { AgentAdapter } from "./agents/base";
import { runOneShotPromptWithFallback } from "./oneShotPromptRunner";

const JUDGE_TIMEOUT_MS = 120_000;
// Per-candidate diff budget for each fallback attempt (largest first).
const DIFF_BUDGETS = [20_000, 6_000, 1_500] as const;

const SYSTEM_PROMPT =
  "You are an expert code reviewer judging several candidate solutions to the SAME task.\n" +
  "Each candidate is one agent's git diff. Pick the single best diff: the one that most " +
  "correctly and completely solves the task with the cleanest, safest change.\n" +
  "Weigh correctness and completeness first, then code quality, then minimalism.\n" +
  'Reply with ONLY a JSON object: {"winner": <candidate number>, "rationale": "<one concise sentence>"}.\n' +
  "Do not add any other text.\n\n";

function truncate(diff: string, limit: number): string {
  if (diff.length <= limit) return diff;
  return `${diff.slice(0, limit)}\n… (diff truncated)`;
}

function buildJudgePrompt(
  taskPrompt: string,
  candidates: readonly JudgeExperimentCandidate[],
  perCandidateLimit: number,
): string {
  const parts: string[] = [SYSTEM_PROMPT, `Task:\n${taskPrompt}\n`];
  candidates.forEach((candidate, idx) => {
    const diff = candidate.diff.trim() || "(no changes)";
    parts.push(
      `\n===== Candidate ${idx + 1}: ${candidate.label} =====\n` +
        truncate(diff, perCandidateLimit),
    );
  });
  parts.push(
    `\n\nThere are ${candidates.length} candidates (1-${candidates.length}). ` +
      'Respond with only {"winner": <number>, "rationale": "<one sentence>"}.',
  );
  return parts.join("\n");
}

interface ParsedJudgement {
  winnerIndex: number;
  rationale: string;
}

/** Pull `{ winner, rationale }` out of a possibly-noisy LLM response. */
export function parseJudgeResponse(raw: string, candidateCount: number): ParsedJudgement {
  const cleaned = raw
    .replace(/<(think|antThinking)>[\s\S]*?<\/\1>/g, "")
    .replace(/```[a-z]*\n?/gi, "")
    .trim();

  const tryObject = (text: string): ParsedJudgement | undefined => {
    try {
      const parsed = JSON.parse(text) as { winner?: unknown; rationale?: unknown };
      const winner = Number(parsed.winner);
      if (Number.isInteger(winner) && winner >= 1 && winner <= candidateCount) {
        return {
          winnerIndex: winner - 1,
          rationale: typeof parsed.rationale === "string" ? parsed.rationale.trim() : "",
        };
      }
    } catch {
      // not valid JSON
    }
    return undefined;
  };

  const direct = tryObject(cleaned);
  if (direct) return direct;

  const objectMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    const fromObject = tryObject(objectMatch[0]);
    if (fromObject) return fromObject;
  }

  // Last-ditch: find the first standalone candidate number + a rationale line.
  const winnerMatch = cleaned.match(/winner["']?\s*[:=]\s*(\d+)/i) ?? cleaned.match(/\b([1-9])\b/);
  const winner = winnerMatch ? Number(winnerMatch[1]) : 1;
  const winnerIndex = winner >= 1 && winner <= candidateCount ? winner - 1 : 0;
  const rationaleMatch = cleaned.match(/rationale["']?\s*[:=]\s*["']?([^"'\n}]+)/i);
  return {
    winnerIndex,
    rationale: rationaleMatch?.[1]?.trim() ?? "Selected by the AI judge.",
  };
}

/**
 * Ask a model to rank candidate diffs and return the winning thread id plus a
 * one-line rationale. Reuses the one-shot runner (shared auth/config, argv
 * fallback). Throws only if the adapter can't do one-shot generation; a noisy
 * or unparseable response degrades to candidate 1 rather than failing.
 */
export async function judgeExperiment(
  location: ProjectLocation,
  adapter: AgentAdapter,
  prompt: string,
  candidates: readonly JudgeExperimentCandidate[],
  model?: string,
  effort?: string,
): Promise<JudgeExperimentResult> {
  if (candidates.length < 2) {
    throw new Error("Need at least two candidates to judge");
  }
  const effectiveModel = model ?? adapter.defaultOneShotModel;
  if (!effectiveModel) {
    throw new Error(`No default one-shot model configured for ${adapter.label}`);
  }
  if (!adapter.runOneShot && !adapter.buildOneShotCommand) {
    throw new Error(`${adapter.label} does not support one-shot generation`);
  }

  const raw = await runOneShotPromptWithFallback({
    location,
    adapter,
    model: effectiveModel,
    effort,
    timeoutMs: JUDGE_TIMEOUT_MS,
    logTag: "experiment-judge",
    attempts: DIFF_BUDGETS.map((budget, idx) => ({
      level: idx === 0 ? "full" : `diff-${budget}`,
      buildPrompt: () => buildJudgePrompt(prompt, candidates, budget),
    })),
  });

  const parsed = parseJudgeResponse(raw, candidates.length);
  const winner = candidates[parsed.winnerIndex] ?? candidates[0]!;
  return {
    winnerThreadId: winner.threadId,
    rationale: parsed.rationale || "Selected by the AI judge.",
  };
}
