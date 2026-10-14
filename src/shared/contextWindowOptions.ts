import { parseContextWindowTokens } from "./contextWindow";

export interface ContextWindowOption {
  id: string;
  label: string;
  tokens: number;
}

export function parseContextWindowInput(raw: string): ContextWindowOption | undefined {
  const tokens = parseContextWindowTokens(raw);
  if (tokens === undefined) return undefined;
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

export function parseStoredContextWindowOptions(
  value: unknown,
  defaults: readonly ContextWindowOption[],
  parse: (raw: string) => ContextWindowOption | undefined = parseContextWindowInput,
): ContextWindowOption[] {
  if (typeof value !== "string" || !value.trim()) {
    return [...defaults];
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [...defaults];
    const windows = new Map<number, ContextWindowOption>();
    for (const entry of parsed) {
      const window =
        typeof entry === "string"
          ? parse(entry)
          : typeof entry === "number"
            ? parse(String(entry))
            : undefined;
      if (window) windows.set(window.tokens, window);
    }
    if (windows.size === 0) return [...defaults];
    return [...windows.values()].sort((a, b) => a.tokens - b.tokens);
  } catch {
    return [...defaults];
  }
}

export function serializeContextWindows(windows: readonly ContextWindowOption[]): string {
  return JSON.stringify(windows.map((window) => window.id));
}

/** Keep the preferred preset first without changing the remaining option order. */
export function orderContextWindows(
  windows: readonly ContextWindowOption[],
  preferredId: string,
): ContextWindowOption[] {
  return [...windows].sort(
    (left, right) => Number(right.id === preferredId) - Number(left.id === preferredId),
  );
}

export function contextWindowsEqual(
  left: readonly ContextWindowOption[],
  right: readonly ContextWindowOption[],
): boolean {
  return (
    left.length === right.length && left.every((window, index) => window.id === right[index]?.id)
  );
}
