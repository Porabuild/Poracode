import type { AgentCapability, LabeledOption } from "@/shared/contracts";
import {
  parseContextWindowInput,
  parseStoredContextWindowOptions,
  type ContextWindowOption,
} from "@/shared/contextWindowOptions";
export {
  parseContextWindowInput,
  contextWindowIdFromTokens,
  contextWindowLabelFromId,
  serializeContextWindows,
  contextWindowsEqual,
} from "@/shared/contextWindowOptions";

/** Agent-settings key storing the user's Codex context-window list as JSON. */
export const CODEX_CONTEXT_WINDOWS_SETTING_KEY = "contextWindows";

/** Poracode's default Codex context window. Codex's own CLI default is 272k. */
export const DEFAULT_CODEX_CONTEXT_SIZE = "400k";

const AUTO_COMPACT_RATIO = 0.95;

export type CodexContextWindow = ContextWindowOption;

export const DEFAULT_CODEX_CONTEXT_WINDOWS: readonly CodexContextWindow[] = [
  parseContextWindowInput("272k")!,
  parseContextWindowInput("400k")!,
  parseContextWindowInput("1m")!,
];

export function parseStoredContextWindows(value: unknown): CodexContextWindow[] {
  return parseStoredContextWindowOptions(value, DEFAULT_CODEX_CONTEXT_WINDOWS);
}

export function resolveCodexContextWindows(
  agentSettings?: Record<string, boolean | string>,
): CodexContextWindow[] {
  return parseStoredContextWindows(agentSettings?.[CODEX_CONTEXT_WINDOWS_SETTING_KEY]);
}

export function resolveDefaultCodexContextSize(windows: readonly CodexContextWindow[]): string {
  if (windows.some((window) => window.id === DEFAULT_CODEX_CONTEXT_SIZE)) {
    return DEFAULT_CODEX_CONTEXT_SIZE;
  }
  return windows[0]?.id ?? DEFAULT_CODEX_CONTEXT_SIZE;
}

/**
 * Compaction starts below the window so Codex has headroom to summarize.
 * Codex reserves the final 5% of the selected window for compaction.
 */
export function autoCompactTokenLimit(windowTokens: number): number {
  if (windowTokens <= 1) return 1;
  return Math.max(1, Math.min(Math.floor(windowTokens * AUTO_COMPACT_RATIO), windowTokens - 1));
}

export function resolveCodexContextWindowTokens(contextSize?: string): number {
  return (
    parseContextWindowInput(contextSize ?? "")?.tokens ??
    parseContextWindowInput(DEFAULT_CODEX_CONTEXT_SIZE)!.tokens
  );
}

export function codexContextWindowOverrides(contextSize?: string): {
  model_context_window: number;
  model_auto_compact_token_limit: number;
} {
  const tokens = resolveCodexContextWindowTokens(contextSize);
  return {
    model_context_window: tokens,
    model_auto_compact_token_limit: autoCompactTokenLimit(tokens),
  };
}

export function buildCodexContextSizeCapabilities(
  modelIds: readonly string[],
  windows: readonly CodexContextWindow[],
): Pick<AgentCapability, "contextSizes" | "modelContextSizes" | "defaultContextSize"> {
  const defaultId = resolveDefaultCodexContextSize(windows);
  const defaultFirst = [
    defaultId,
    ...windows.map((window) => window.id).filter((id) => id !== defaultId),
  ];
  const contextSizes: LabeledOption[] = windows.map((window) => ({
    id: window.id,
    label: window.label,
  }));
  return {
    contextSizes,
    defaultContextSize: defaultId,
    ...(modelIds.length > 0
      ? { modelContextSizes: Object.fromEntries(modelIds.map((id) => [id, defaultFirst])) }
      : {}),
  };
}
