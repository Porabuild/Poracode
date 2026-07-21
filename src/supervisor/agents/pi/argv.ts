import type { ThreadConfig } from "@/shared/contracts";

export const PI_THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export type PiThinkingLevel = (typeof PI_THINKING_LEVELS)[number];

export function splitPiModelId(
  model: string | undefined,
): { provider: string; modelId: string } | undefined {
  const normalized = model?.trim();
  if (!normalized) return undefined;
  const slash = normalized.indexOf("/");
  if (slash <= 0 || slash === normalized.length - 1) return undefined;
  return { provider: normalized.slice(0, slash), modelId: normalized.slice(slash + 1) };
}

export function buildPiArgs(config: ThreadConfig, prompt: string, sessionId?: string): string[] {
  const args = ["--approve"];
  if (sessionId) args.push("--session", sessionId);
  if (config.model) args.push("--model", config.model);
  if (config.effort && PI_THINKING_LEVELS.includes(config.effort as PiThinkingLevel)) {
    args.push("--thinking", config.effort);
  }
  if (prompt.trim()) args.push(prompt);
  return args;
}

export function buildPiOneShotArgs(
  config: Pick<ThreadConfig, "model" | "effort">,
  prompt: string,
  options: { textOnly?: boolean } = {},
) {
  return [
    ...buildPiArgs(config as ThreadConfig, ""),
    "--no-session",
    ...(options.textOnly
      ? [
          "--no-tools",
          "--no-extensions",
          "--no-skills",
          "--no-prompt-templates",
          "--no-context-files",
        ]
      : []),
    "-p",
    prompt,
  ];
}
