import type { AgentCapability, LabeledOption } from "@/shared/contracts";

/** Agent-settings key storing the user's Codex context-window list as JSON. */
export const CODEX_CONTEXT_WINDOWS_SETTING_KEY = "contextWindows";

/** Poracode's default Codex context window. Codex's own CLI default is 272k. */
export const DEFAULT_CODEX_CONTEXT_SIZE = "400k";

const MIN_CONTEXT_WINDOW_TOKENS = 1_000;
const MAX_CONTEXT_WINDOW_TOKENS = 10_000_000;
const AUTO_COMPACT_RATIO = 0.95;

export interface CodexContextWindow {
  id: string;
  label: string;
  tokens: number;
}

const CONTEXT_WINDOW_INPUT = /^(\d+(?:\.\d+)?)\s*([kKmM])?$/;

export function parseContextWindowInput(raw: string): CodexContextWindow | undefined {
  const trimmed = raw.trim().replaceAll(",", "");
  if (!trimmed) return undefined;
  const match = CONTEXT_WINDOW_INPUT.exec(trimmed);
  if (!match) return undefined;
  const amount = Number.parseFloat(match[1]!);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  const suffix = match[2]?.toLowerCase();
  const tokens =
    suffix === "m"
      ? Math.round(amount * 1_000_000)
      : suffix === "k"
        ? Math.round(amount * 1_000)
        : Math.round(amount);
  if (tokens < MIN_CONTEXT_WINDOW_TOKENS || tokens > MAX_CONTEXT_WINDOW_TOKENS) {
    return undefined;
  }
  const id = contextWindowIdFromTokens(tokens);
  return { id, label: contextWindowLabelFromId(id), tokens };
}

export function contextWindowIdFromTokens(tokens: number): string {
  if (tokens >= 1_000_000 && tokens % 10_000 === 0) {
    const millions = tokens / 1_000_000;
    const text = Number.isInteger(millions)
      ? String(millions)
      : String(Math.round(millions * 100) / 100);
    return `${text}m`;
  }
  if (tokens % 1_000 === 0) return `${tokens / 1_000}k`;
  return String(tokens);
}

export function contextWindowLabelFromId(id: string): string {
  return id.endsWith("m") ? `${id.slice(0, -1)}M` : id;
}

export const DEFAULT_CODEX_CONTEXT_WINDOWS: readonly CodexContextWindow[] = [
  parseContextWindowInput("272k")!,
  parseContextWindowInput("400k")!,
  parseContextWindowInput("1m")!,
];

export function parseStoredContextWindows(value: unknown): CodexContextWindow[] {
  if (typeof value !== "string" || !value.trim()) {
    return [...DEFAULT_CODEX_CONTEXT_WINDOWS];
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [...DEFAULT_CODEX_CONTEXT_WINDOWS];
    const windows = new Map<number, CodexContextWindow>();
    for (const entry of parsed) {
      const window =
        typeof entry === "string"
          ? parseContextWindowInput(entry)
          : typeof entry === "number"
            ? parseContextWindowInput(String(entry))
            : undefined;
      if (window) windows.set(window.tokens, window);
    }
    if (windows.size === 0) return [...DEFAULT_CODEX_CONTEXT_WINDOWS];
    return [...windows.values()].sort((a, b) => a.tokens - b.tokens);
  } catch {
    return [...DEFAULT_CODEX_CONTEXT_WINDOWS];
  }
}

export function serializeContextWindows(windows: readonly CodexContextWindow[]): string {
  return JSON.stringify(windows.map((window) => window.id));
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

export function contextWindowsEqual(
  left: readonly CodexContextWindow[],
  right: readonly CodexContextWindow[],
): boolean {
  return (
    left.length === right.length && left.every((window, index) => window.id === right[index]?.id)
  );
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
