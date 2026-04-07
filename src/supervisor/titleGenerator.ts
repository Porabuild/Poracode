import type { ProjectLocation } from "../shared/contracts";
import type { AgentAdapter } from "./agents/base";
import { buildOneShotSpec, spawnAgent } from "./oneShotSpawn";

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

  if (!adapter.buildOneShotCommand) {
    throw new Error(`${adapter.label} does not support one-shot generation`);
  }

  const finalPrompt = PROMPT + truncatePrompt(prompt);
  const cmd = adapter.buildOneShotCommand(effectiveModel, effort, finalPrompt);
  if (!cmd) {
    throw new Error(`${adapter.label} does not support one-shot generation`);
  }

  const spawnSpec = buildOneShotSpec(location, cmd.command, cmd.args);
  console.log(`[title-gen] spawning: ${spawnSpec.command} ${spawnSpec.args.join(" ")}`);

  const raw = await spawnAgent(spawnSpec, cmd.stdin ?? finalPrompt, TITLE_GEN_TIMEOUT_MS);
  const title = cleanTitle(raw);
  if (!title) {
    throw new Error("Title generation returned empty result");
  }
  return title;
}
