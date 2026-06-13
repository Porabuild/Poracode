/**
 * Compact, human-readable token count shared by every thread surface that shows
 * a token total — the goal dock, context-usage indicator, context-compaction
 * tile, and the sub-agent tiles. Keeping one formatter means a 24.7M-token
 * thread reads the same everywhere ("24.8M") instead of a long "24767k".
 *
 *   formatTokenCount(595)        -> "595"
 *   formatTokenCount(8_400)      -> "8.4K"
 *   formatTokenCount(200_000)    -> "200K"
 *   formatTokenCount(1_000_000)  -> "1M"
 *   formatTokenCount(24_767_000) -> "24.8M"
 */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    return formatTokenUnit(tokens / 1_000_000, "M");
  }
  if (tokens >= 1_000) {
    return formatTokenUnit(tokens / 1_000, "K");
  }
  return String(tokens);
}

function formatTokenUnit(value: number, unit: "K" | "M"): string {
  // Millions always keep one decimal of precision (e.g. "24.8M"), as do small
  // thousands (e.g. "8.4K"); larger thousands round to a whole number once the
  // decimal is just noise (e.g. "200K"). Whole values drop the trailing ".0".
  const rounded = unit === "M" || value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}${unit}`;
}
