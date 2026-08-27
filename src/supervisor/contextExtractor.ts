import type { ExtractContextResult, ProjectLocation, SessionRef } from "@/shared/contracts";
import {
  resolveOneShotEffectiveModel,
  withCommandBaseSpawnEnv,
  type AgentAdapter,
} from "./agents/base";
import { runOneShotPromptWithFallback } from "./oneShotPromptRunner";
import { buildOneShotSpec, spawnAgent } from "./oneShotSpawn";

const EXTRACTION_PROMPT = [
  "Summarize the task context from this conversation for handoff to a different AI assistant.",
  "The other assistant has full access to the codebase, git, and project docs (CLAUDE.md, AGENTS.md) — do NOT repeat project-level information it can read itself.",
  "",
  "Include:",
  "- The task goal (what the user asked to do)",
  "- Key decisions and user preferences (chosen approaches, rejected alternatives)",
  "- What was completed (list modified/created files)",
  "- What remains to be done",
  "- Known issues, bugs, or failing tests introduced by the work so far",
  "- Open questions or blockers that need user input",
  "",
  "Do NOT include:",
  "- General project architecture, conventions, or setup (the other agent reads project docs)",
  "- Full code snippets or file contents (the other agent can read files)",
  "- Tool call details or internal reasoning steps",
  "",
  "Format: concise task briefing, under 1000 words, plain text only.",
  "Reply with only the summary, nothing else.",
].join("\n");

const EXTRACTION_TIMEOUT_MS = 60_000;
const MAX_CONTEXT_CHARS = 50_000;

function cleanExtraction(raw: string): string {
  let text = raw;

  // Strip <think>…</think> / <antThinking>…</antThinking> blocks
  text = text.replace(/<(think|antThinking)>[\s\S]*?<\/\1>/g, "");

  // Strip markdown code fences
  text = text.replace(/```[a-z]*\n?/g, "");

  // Take first non-empty content
  text = text.trim();

  // Enforce max length
  if (text.length > MAX_CONTEXT_CHARS) {
    text = text.slice(0, MAX_CONTEXT_CHARS) + "\n\n[context truncated]";
  }

  return text;
}

export async function extractContext(
  location: ProjectLocation,
  adapter: AgentAdapter,
  sessionRef: SessionRef,
  worktreePath?: string,
  model?: string,
  effort?: string,
  signal?: AbortSignal,
): Promise<ExtractContextResult> {
  // Primary path: adapter-specific extraction via --resume + print mode
  if (adapter.buildContextExtractionCommand) {
    const cmd = adapter.buildContextExtractionCommand(sessionRef, location, model);
    if (cmd) {
      const extractionCommand = withCommandBaseSpawnEnv(cmd, adapter.baseSpawnEnv);
      const spawnSpec = buildOneShotSpec(
        location,
        extractionCommand.command,
        extractionCommand.args,
        {
          ...(extractionCommand.env ? { env: extractionCommand.env } : {}),
        },
      );
      console.log(`[context-extract] spawning: ${spawnSpec.command} ${spawnSpec.args.join(" ")}`);

      const raw = await spawnAgent(
        spawnSpec,
        cmd.stdin ?? EXTRACTION_PROMPT,
        EXTRACTION_TIMEOUT_MS,
        signal,
      );
      const summary = cleanExtraction(raw);
      if (summary) {
        return {
          summary,
          sourceProvider: adapter.kind,
          sourceSessionId: sessionRef.providerSessionId,
          ...(worktreePath ? { worktreePath } : {}),
          extractedAt: new Date().toISOString(),
        };
      }
    }
  }

  throw new Error(`${adapter.label} does not support context extraction for this session`);
}

/**
 * Fallback extraction using raw terminal scrollback text.
 * Summarizes the scrollback through any available provider's one-shot command.
 */
export async function extractContextFromScrollback(
  location: ProjectLocation,
  adapter: AgentAdapter,
  scrollbackText: string,
  sourceProvider: string,
  sourceSessionId: string,
  worktreePath?: string,
  model?: string,
  effort?: string,
  signal?: AbortSignal,
): Promise<ExtractContextResult> {
  if (!adapter.runOneShot && !adapter.buildOneShotCommand) {
    throw new Error(
      `${adapter.label} does not support one-shot commands for scrollback extraction`,
    );
  }

  const effectiveModel = resolveOneShotEffectiveModel(adapter, model, () => {
    return new Error(`No default one-shot model configured for ${adapter.label}`);
  });

  const buildPromptForCap = (maxChars: number): string => {
    const trimmed =
      scrollbackText.length > maxChars
        ? scrollbackText.slice(-maxChars) + "\n\n[earlier output truncated]"
        : scrollbackText;
    return `${EXTRACTION_PROMPT}\n\n--- Terminal Output ---\n${trimmed}\n--- End Terminal Output ---`;
  };

  const raw = await runOneShotPromptWithFallback({
    location,
    adapter,
    model: effectiveModel,
    effort,
    timeoutMs: EXTRACTION_TIMEOUT_MS,
    ...(signal ? { signal } : {}),
    logTag: "context-extract-scrollback",
    attempts: [
      { level: "100k", buildPrompt: () => buildPromptForCap(100_000) },
      { level: "30k", buildPrompt: () => buildPromptForCap(30_000) },
      { level: "10k", buildPrompt: () => buildPromptForCap(10_000) },
    ],
  });
  const summary = cleanExtraction(raw);
  if (!summary) {
    throw new Error("Context extraction from scrollback returned empty result");
  }

  return {
    summary,
    sourceProvider,
    sourceSessionId,
    ...(worktreePath ? { worktreePath } : {}),
    extractedAt: new Date().toISOString(),
  };
}

/** The extraction prompt constant, exported for adapters that embed it in args. */
export { EXTRACTION_PROMPT };
