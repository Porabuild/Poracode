/**
 * Cross-provider model-id → display-label formatting shared by the renderer
 * (ProviderModelMenu, sub-agent progress chips) and the supervisor (Cursor ACP
 * model-picker capabilities). Cursor ACP encodes parameters in bracket ids
 * ("gpt-5.5[context=272k,reasoning=medium]"); Codex-family ids follow the
 * "gpt-<v>-codex[-variant]" scheme. This is the single implementation — do not
 * re-grow per-surface copies. (`packages/agents-usage` keeps a private copy of
 * the Codex-family regex because the package must stay self-contained.)
 */

export function capitalizeSegment(segment: string): string {
  return segment.length <= 1 ? segment : segment[0]!.toUpperCase() + segment.slice(1);
}

export function formatReasoningLabel(value: string): string {
  return value === "xhigh" || value === "xHigh" ? "Extra High" : capitalizeSegment(value);
}

/** Drop Cursor ACP bracket parameter groups: "a[b=c]" → "a". */
export function stripBracketParams(modelId: string): string {
  return modelId.replace(/\[[^\]]*\]/g, "");
}

/** Parse Cursor ACP bracket parameters: "a[b=c,d=e]" → { b: "c", d: "e" }. */
export function parseBracketParams(modelId: string): Record<string, string> {
  const match = /\[([^\]]*)\]/.exec(modelId);
  const raw = match?.[1]?.trim();
  if (!raw) return {};

  const params: Record<string, string> = {};
  for (const part of raw.split(",")) {
    const [rawKey, rawValue] = part.split("=");
    const key = rawKey?.trim();
    const value = rawValue?.trim();
    if (key && value) params[key] = value;
  }
  return params;
}

/** Human hints for bracket params: "[context=272k,reasoning=medium]" → "272K · Medium". */
export function formatBracketParamHints(modelId: string): string | undefined {
  const params = parseBracketParams(modelId);
  const hints: string[] = [];
  if (params.context) hints.push(params.context.toUpperCase());
  const effort = params.reasoning ?? params.effort;
  if (effort) {
    hints.push(formatReasoningLabel(effort));
  }
  if (params.fast === "true") hints.push("Fast");
  return hints.length > 0 ? hints.join(" · ") : undefined;
}

/** Render a Codex-family model id ("gpt-5.3-codex-spark") as "Codex 5.3 Spark". */
export function formatCodexFamilyModelLabel(baseId: string): string | undefined {
  const codex = /^gpt-(\d+(?:\.\d+)?)-codex(?:-(spark|max|mini))?$/i.exec(baseId);
  if (codex) {
    const suffix = codex[2] ? ` ${capitalizeSegment(codex[2])}` : "";
    return `Codex ${codex[1]}${suffix}`;
  }
  return undefined;
}

/**
 * Friendly label for a Cursor base model id (brackets already stripped):
 * "default" → "Auto", "composer-2.5" → "Composer 2.5", Codex/GPT/Claude
 * families get their canonical names, everything else is humanized from
 * `fallbackLabel` (when the provider supplied one) or the id itself.
 */
export function formatCursorBaseModelLabel(baseId: string, fallbackLabel?: string): string {
  if (baseId === "default") return "Auto";
  const composer = /^composer-(\d+(?:\.\d+)?)$/i.exec(baseId);
  if (composer) return `Composer ${composer[1]}`;

  const codex = formatCodexFamilyModelLabel(baseId);
  if (codex) return codex;

  const gpt = /^gpt-(\d+(?:\.\d+)?)(?:-([a-z]+))?$/i.exec(baseId);
  if (gpt) {
    const suffix = gpt[2] ? ` ${capitalizeSegment(gpt[2])}` : "";
    return `GPT-${gpt[1]}${suffix}`;
  }

  // Accepts an optional 8-digit snapshot date: "claude-sonnet-4-5-20250929".
  const claude = /^claude-(opus|sonnet|haiku)-(\d+)(?:-(\d{1,2}))?(?:-(\d{8}))?$/i.exec(baseId);
  if (claude) {
    const version = claude[3] ? `${claude[2]}.${claude[3]}` : claude[2]!;
    const snapshot = claude[4] ? ` (${claude[4]})` : "";
    return `${capitalizeSegment(claude[1]!)} ${version}${snapshot}`;
  }

  const family = /^(gemini|grok|kimi)-(.+)$/i.exec(baseId);
  const labelSource = family ? baseId : fallbackLabel || baseId;
  return stripBracketParams(labelSource)
    .split(/[-_/]/g)
    .filter(Boolean)
    .map((part) => capitalizeSegment(part))
    .join(" ");
}
