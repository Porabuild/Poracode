import type { AgentCapability, LabeledOption } from "@/shared/contracts";
import { parseContextWindowTokens } from "@/shared/contextWindow";
import {
  orderContextWindows,
  parseContextWindowInput,
  parseStoredContextWindowOptions,
} from "@/shared/contextWindowOptions";

export const CLAUDE_CONTEXT_SIZES: LabeledOption[] = [
  { id: "1m", label: "1M" },
  { id: "400k", label: "400k" },
  { id: "200k", label: "200k" },
];

/**
 * 400k is the default: every call re-reads the whole context, so a 1M
 * auto-compact window multiplies usage on long threads. 1M stays selectable.
 */
export const CLAUDE_DEFAULT_CONTEXT_SIZE = "400k";
export const CLAUDE_LONG_CONTEXT_SIZES = [CLAUDE_DEFAULT_CONTEXT_SIZE, "1m"];

export const CLAUDE_CONTEXT_WINDOWS_SETTING_KEY = "contextWindows";

/** User windows apply only to models already declaring configurable long context. */
export function claudeContextSizeCapabilities(
  capabilities: Pick<AgentCapability, "modelContextSizes" | "contextSizes">,
  agentSettings?: Record<string, boolean | string>,
): Pick<AgentCapability, "contextSizes" | "modelContextSizes"> {
  const defaults = CLAUDE_LONG_CONTEXT_SIZES.map((id) => parseContextWindowInput(id)!);
  const windows = parseStoredContextWindowOptions(
    agentSettings?.[CLAUDE_CONTEXT_WINDOWS_SETTING_KEY],
    defaults,
    (raw) =>
      resolveClaudeContextWindowTokens(raw) === undefined
        ? undefined
        : parseContextWindowInput(raw),
  );
  const orderedWindows = orderContextWindows(windows, CLAUDE_DEFAULT_CONTEXT_SIZE);
  const ids = orderedWindows.map((window) => window.id);
  const labels = new Map(
    orderedWindows.map((window) => [window.id, { id: window.id, label: window.label }]),
  );
  labels.set("200k", { id: "200k", label: "200k" });
  const modelContextSizes = Object.fromEntries(
    Object.entries(capabilities.modelContextSizes ?? {}).map(([id, sizes]) => {
      if (sizes.includes("1m") && sizes.includes("400k")) return [id, ids];
      for (const size of sizes) {
        const option = (capabilities.contextSizes ?? CLAUDE_CONTEXT_SIZES).find(
          (entry) => entry.id === size,
        );
        if (option) labels.set(size, option);
      }
      return [id, sizes];
    }),
  );
  return {
    contextSizes: [...labels.values()],
    modelContextSizes,
  };
}

/** Native model suffixes select variants; custom provider suffixes are real IDs. */
export function claudeContextManagedModelId(model: string): string | undefined {
  const base = model.replace(/\[[0-9]+[mk]\]$/i, "");
  return base === "sonnet" || /^claude-/i.test(base) ? base : undefined;
}

/** Claude's auto-compact window accepts 100k–1M tokens, without changing the API model. */
export function resolveClaudeContextWindowTokens(contextSize?: string): number | undefined {
  if (!contextSize) return undefined;
  const tokens = parseContextWindowTokens(contextSize);
  return tokens !== undefined && tokens >= 100_000 && tokens <= 1_000_000 ? tokens : undefined;
}

/** Launch-only override supported before the newer --autocompact CLI flag. */
export function claudeContextWindowEnv(
  contextSize: string | undefined,
  baseEnv?: Record<string, string>,
): Record<string, string> | undefined {
  const tokens = resolveClaudeContextWindowTokens(contextSize);
  return tokens === undefined
    ? baseEnv
    : { ...baseEnv, CLAUDE_CODE_AUTO_COMPACT_WINDOW: String(tokens) };
}
