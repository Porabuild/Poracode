const MIN_CONTEXT_WINDOW_TOKENS = 1_000;
const MAX_CONTEXT_WINDOW_TOKENS = 10_000_000;

const CONTEXT_WINDOW_INPUT = /^(\d+(?:\.\d+)?)\s*([kKmM])?$/;

/** Parse a numeric context size in tokens, with optional k/m suffix (1k–10m). */
export function parseContextWindowTokens(raw: string): number | undefined {
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
  return tokens;
}
