import type { ProjectLocation } from "@/shared/contracts";
import type { AgentAdapter } from "./agents/base";
import { prepareOneShot } from "./oneShotSpawn";

const PROMPT =
  "Generate a concise title for a coding conversation based on the user's first message below.\n" +
  "Rules:\n" +
  "- Single line, at most 50 characters\n" +
  "- Focus on the user's intent, not tools or agents mentioned\n" +
  "- Match the language of the user's message\n" +
  "- Preserve technical terms, function names, file names, and libraries exactly\n" +
  "- No quotes, no prefix label, no markdown — just the title text\n" +
  "- Use sentence case (capitalize only the first word)\n" +
  "- Reply with only the title, nothing else\n\n";

const MAX_PROMPT_CHARS = 2000;
const TITLE_GEN_TIMEOUT_MS = 30_000;

function extractJsonResult(raw: string): string | undefined {
  try {
    const parsed = JSON.parse(raw) as { result?: unknown };
    return typeof parsed?.result === "string" ? parsed.result : undefined;
  } catch {
    return undefined;
  }
}

export function cleanTitle(raw: string): string {
  let text = extractJsonResult(raw) ?? raw;

  // Strip <think>…</think> / <antThinking>…</antThinking> blocks
  text = text.replace(/<(think|antThinking)>[\s\S]*?<\/\1>/g, "");

  // Strip markdown code fences
  text = text.replace(/```[a-z]*\n?/g, "");

  // Remove surrounding quotes
  text = text.replace(/^["'`]+|["'`]+$/g, "");

  // Take only the first non-empty line
  const firstLine = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  text = firstLine ?? text.trim();

  // Enforce max length
  if (text.length > 50) {
    text = text.slice(0, 47) + "...";
  }

  return text.trim();
}

function truncatePrompt(prompt: string): string {
  if (prompt.length <= MAX_PROMPT_CHARS) return prompt;
  return prompt.slice(0, MAX_PROMPT_CHARS) + "\n\n[message truncated]";
}

export async function generateTitle(
  location: ProjectLocation,
  adapter: AgentAdapter,
  prompt: string,
  model?: string,
  effort?: string,
): Promise<string> {
  const effectiveModel = model ?? adapter.defaultOneShotModel;
  if (!effectiveModel) {
    throw new Error(`No default one-shot model configured for ${adapter.label}`);
  }

  if (!adapter.runOneShot && !adapter.buildOneShotCommand) {
    throw new Error(`${adapter.label} does not support one-shot generation`);
  }

  const finalPrompt = PROMPT + truncatePrompt(prompt);

  // Prefer the SDK / structured-runtime path: no cold-start cost, no argv
  // length limit. Fall back to spawning the CLI when the adapter only
  // exposes `buildOneShotCommand`.
  const sdkLocation = location.kind === "ssh" ? undefined : location;
  const raw =
    adapter.runOneShot && sdkLocation
      ? await adapter.runOneShot({
          location: sdkLocation,
          model: effectiveModel,
          effort,
          prompt: finalPrompt,
          signal: timeoutSignal(TITLE_GEN_TIMEOUT_MS),
        })
      : await runViaCli(location, adapter, effectiveModel, effort, finalPrompt);

  const title = cleanTitle(raw);
  if (!title) {
    throw new Error("Title generation returned empty result");
  }
  return title;
}

async function runViaCli(
  location: ProjectLocation,
  adapter: AgentAdapter,
  model: string,
  effort: string | undefined,
  prompt: string,
): Promise<string> {
  const cmd = adapter.buildOneShotCommand!(model, effort, prompt);
  if (!cmd) {
    throw new Error(`${adapter.label} does not support one-shot generation`);
  }
  const { spec, spawn } = prepareOneShot(location, cmd);
  return spawn(spec, cmd.stdin ?? prompt, TITLE_GEN_TIMEOUT_MS);
}

function timeoutSignal(timeoutMs: number): AbortSignal | undefined {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (typeof timer.unref === "function") timer.unref();
  controller.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
  return controller.signal;
}
