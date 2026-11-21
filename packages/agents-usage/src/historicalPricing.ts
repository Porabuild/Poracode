import type { UsageTokens } from "./types";

export interface HistoricalPrice {
  id: string;
  model: string;
  source: string;
  reviewedAt: string;
  effectiveFrom: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cacheWrite1h: number;
  /** Input plus cache reads/writes covered by this reviewed standard rate. */
  maxInputTokens?: number;
  /** Optional long-context pricing tier applied when prompt tokens exceed `thresholdTokens`. */
  longContext?: {
    thresholdTokens: number;
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    cacheWrite1h: number;
  };
}

export interface CategoryCostUsd {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

// Append snapshots rather than editing old rates. Exact IDs only: an unrecognized
// release/alias must not inherit a similarly named model's price. The first dated
// snapshot starts on its review date; it makes no claim about earlier prices.
const REVIEWED = "2026-10-16";
const CLAUDE_SOURCE = "https://platform.claude.com/docs/en/about-claude/pricing";
const OPENAI_SOURCE = "https://developers.openai.com/api/docs/pricing";
const GEMINI_SOURCE = "https://ai.google.dev/gemini-api/docs/pricing";
const XAI_SOURCE = "https://docs.x.ai/docs/models";
const DEEPSEEK_SOURCE = "https://api-docs.deepseek.com/quick_start/pricing";
const MOONSHOT_SOURCE = "https://platform.moonshot.ai/docs/pricing/chat";
const QWEN_SOURCE = "https://www.alibabacloud.com/help/en/model-studio/models";
const ZAI_SOURCE = "https://docs.z.ai/guides/overview/pricing";

type ModelRow = [
  model: string,
  input: number,
  output: number,
  cacheRead: number,
  cacheWrite: number,
  cacheWrite1h: number,
  source: string,
  maxInputTokens?: number | undefined,
  longContext?: HistoricalPrice["longContext"] | undefined,
];

const MODELS: ModelRow[] = [
  ["claude-sonnet-4-20250514", 3, 15, 0.3, 3.75, 6, CLAUDE_SOURCE, 200_000],
  ["claude-sonnet-4-5-20250929", 3, 15, 0.3, 3.75, 6, CLAUDE_SOURCE, 200_000],
  ["claude-sonnet-4-6", 3, 15, 0.3, 3.75, 6, CLAUDE_SOURCE],
  ["claude-opus-4-20250514", 15, 75, 1.5, 18.75, 30, CLAUDE_SOURCE, 200_000],
  ["claude-opus-4-1-20250805", 15, 75, 1.5, 18.75, 30, CLAUDE_SOURCE, 200_000],
  ["claude-opus-4-5-20251101", 5, 25, 0.5, 6.25, 10, CLAUDE_SOURCE, 200_000],
  ["claude-opus-4-6", 5, 25, 0.5, 6.25, 10, CLAUDE_SOURCE],
  ["claude-opus-4-7", 5, 25, 0.5, 6.25, 10, CLAUDE_SOURCE],
  ["claude-haiku-4-5-20251001", 1, 5, 0.1, 1.25, 2, CLAUDE_SOURCE, 200_000],
  ["gpt-5.3-codex", 1.75, 14, 0.175, 0, 0, OPENAI_SOURCE],
];

// Standard-tier list rates (no Fast or data-residency premiums). OpenAI rows use
// the short-context rate without a cap: Codex reports cumulative deltas that can
// span several requests, so a per-request context cap cannot be applied to them.
const REVIEWED_2026_10_28 = "2026-10-28";
const MODELS_2026_10_28: ModelRow[] = [
  ["claude-fable-5-1", 10, 50, 0.25, 12.5, 20, CLAUDE_SOURCE],
  ["claude-fable-5", 10, 50, 1, 12.5, 20, CLAUDE_SOURCE],
  ["claude-opus-5-5", 4, 20, 0.2, 5, 8, CLAUDE_SOURCE],
  ["claude-opus-5", 5, 25, 0.5, 6.25, 10, CLAUDE_SOURCE],
  ["claude-opus-4-8", 5, 25, 0.5, 6.25, 10, CLAUDE_SOURCE],
  ["claude-sonnet-5-5", 2, 10, 0.1, 2.5, 4, CLAUDE_SOURCE],
  ["claude-sonnet-5", 2, 10, 0.2, 2.5, 4, CLAUDE_SOURCE],
  ["gpt-6-astra", 10, 50, 1, 0, 0, OPENAI_SOURCE],
  ["gpt-6.1-sol", 2, 10, 0.1, 0, 0, OPENAI_SOURCE],
  ["gpt-6.1-terra", 1, 5, 0.05, 0, 0, OPENAI_SOURCE],
  ["gpt-6-sol", 2, 10, 0.2, 0, 0, OPENAI_SOURCE],
  ["gpt-6-luna", 0.1, 0.5, 0.01, 0, 0, OPENAI_SOURCE],
  ["gpt-5.6-sol", 4, 20, 0.4, 0, 0, OPENAI_SOURCE],
  ["gpt-5.6-terra", 2, 12, 0.2, 0, 0, OPENAI_SOURCE],
  ["gpt-5.6-luna", 0.2, 1.2, 0.02, 0, 0, OPENAI_SOURCE],
];

// Multi-provider list-rate snapshot expanding coverage across OpenAI, Anthropic,
// Google Gemini/Antigravity, xAI Grok, DeepSeek, Moonshot Kimi, Qwen, and Z.AI.
const REVIEWED_2026_11_21 = "2026-11-21";
const MODELS_2026_11_21: ModelRow[] = [
  // Anthropic unpinned release IDs used by OpenCode, Cursor, Antigravity, and ACP bridges
  ["claude-haiku-4-5", 1, 5, 0.1, 1.25, 2, CLAUDE_SOURCE, 200_000],
  ["claude-sonnet-4-5", 3, 15, 0.3, 3.75, 6, CLAUDE_SOURCE, 200_000],
  ["claude-opus-4-5", 5, 25, 0.5, 6.25, 10, CLAUDE_SOURCE, 200_000],
  ["claude-opus-4-1", 15, 75, 1.5, 18.75, 30, CLAUDE_SOURCE, 200_000],
  ["claude-sonnet-4-0", 3, 15, 0.3, 3.75, 6, CLAUDE_SOURCE, 200_000],
  ["claude-opus-4-0", 15, 75, 1.5, 18.75, 30, CLAUDE_SOURCE, 200_000],

  // OpenAI / Codex models
  ["gpt-5.4", 2.5, 15, 0.25, 0, 0, OPENAI_SOURCE],
  ["gpt-5.4-mini", 0.75, 4.5, 0.075, 0, 0, OPENAI_SOURCE],
  ["gpt-5.4-nano", 0.2, 1.25, 0.02, 0, 0, OPENAI_SOURCE],
  ["gpt-5.4-pro", 30, 180, 3, 0, 0, OPENAI_SOURCE],
  ["gpt-5.2", 1.75, 14, 0.175, 0, 0, OPENAI_SOURCE],
  ["gpt-5.2-codex", 1.75, 14, 0.175, 0, 0, OPENAI_SOURCE],
  ["gpt-5.1", 1.25, 10, 0.125, 0, 0, OPENAI_SOURCE],
  ["gpt-5.1-codex", 1.25, 10, 0.125, 0, 0, OPENAI_SOURCE],
  ["gpt-5.1-codex-max", 1.25, 10, 0.125, 0, 0, OPENAI_SOURCE],
  ["gpt-5.1-codex-mini", 0.25, 2, 0.025, 0, 0, OPENAI_SOURCE],
  ["gpt-5", 1.25, 10, 0.125, 0, 0, OPENAI_SOURCE],
  ["gpt-5-codex", 1.25, 10, 0.125, 0, 0, OPENAI_SOURCE],
  ["gpt-5-mini", 0.25, 2, 0.025, 0, 0, OPENAI_SOURCE],
  ["gpt-5-nano", 0.05, 0.4, 0.005, 0, 0, OPENAI_SOURCE],
  ["gpt-4.1", 2, 8, 0.5, 0, 0, OPENAI_SOURCE],
  ["gpt-4.1-mini", 0.4, 1.6, 0.1, 0, 0, OPENAI_SOURCE],
  ["gpt-4.1-nano", 0.1, 0.4, 0.025, 0, 0, OPENAI_SOURCE],
  ["gpt-4o", 2.5, 10, 1.25, 0, 0, OPENAI_SOURCE],
  ["o3", 2, 8, 0.5, 0, 0, OPENAI_SOURCE],
  ["o4-mini", 1.1, 4.4, 0.275, 0, 0, OPENAI_SOURCE],

  // Google Gemini & Antigravity models (including >200k long-context tiers)
  [
    "gemini-2.5-pro",
    1.25,
    10,
    0.125,
    0,
    0,
    GEMINI_SOURCE,
    undefined,
    {
      thresholdTokens: 200_000,
      input: 2.5,
      output: 15,
      cacheRead: 0.25,
      cacheWrite: 0,
      cacheWrite1h: 0,
    },
  ],
  ["gemini-2.5-flash", 0.3, 2.5, 0.03, 0, 0, GEMINI_SOURCE],
  ["gemini-2.5-flash-lite", 0.1, 0.4, 0.01, 0, 0, GEMINI_SOURCE],
  [
    "gemini-3-pro-preview",
    2,
    12,
    0.2,
    0,
    0,
    GEMINI_SOURCE,
    undefined,
    {
      thresholdTokens: 200_000,
      input: 4,
      output: 18,
      cacheRead: 0.4,
      cacheWrite: 0,
      cacheWrite1h: 0,
    },
  ],
  [
    "gemini-3.1-pro-preview",
    2,
    12,
    0.2,
    0,
    0,
    GEMINI_SOURCE,
    undefined,
    {
      thresholdTokens: 200_000,
      input: 4,
      output: 18,
      cacheRead: 0.4,
      cacheWrite: 0,
      cacheWrite1h: 0,
    },
  ],
  ["gemini-3-flash-preview", 0.5, 3, 0.05, 0, 0, GEMINI_SOURCE],

  // xAI Grok models
  ["grok-4", 3, 15, 0.75, 0, 0, XAI_SOURCE],
  ["grok-4-0709", 3, 15, 0.75, 0, 0, XAI_SOURCE],
  ["grok-4-fast", 0.2, 0.5, 0.05, 0, 0, XAI_SOURCE],
  ["grok-4-fast-reasoning", 0.2, 0.5, 0.05, 0, 0, XAI_SOURCE],
  ["grok-4-fast-non-reasoning", 0.2, 0.5, 0.05, 0, 0, XAI_SOURCE],
  ["grok-4-1-fast-reasoning", 0.2, 0.5, 0.05, 0, 0, XAI_SOURCE],
  ["grok-4-1-fast-non-reasoning", 0.2, 0.5, 0.05, 0, 0, XAI_SOURCE],
  ["grok-4.1-fast", 0.2, 0.5, 0.05, 0, 0, XAI_SOURCE],
  ["grok-code-fast-1", 0.2, 1.5, 0.02, 0, 0, XAI_SOURCE],
  ["grok-3", 3, 15, 0.75, 0, 0, XAI_SOURCE],
  ["grok-3-mini", 0.3, 0.5, 0.075, 0, 0, XAI_SOURCE],

  // DeepSeek models
  ["deepseek-chat", 0.28, 0.42, 0.028, 0, 0, DEEPSEEK_SOURCE],
  ["deepseek-reasoner", 0.28, 0.42, 0.028, 0, 0, DEEPSEEK_SOURCE],
  ["deepseek-v3.2", 0.28, 0.42, 0.028, 0, 0, DEEPSEEK_SOURCE],

  // Moonshot Kimi models
  ["kimi-k2", 0.6, 2.5, 0.15, 0, 0, MOONSHOT_SOURCE],
  ["kimi-k2-0905-preview", 0.6, 2.5, 0.15, 0, 0, MOONSHOT_SOURCE],
  ["kimi-k2-turbo-preview", 1.15, 8, 0.15, 0, 0, MOONSHOT_SOURCE],
  ["kimi-k2-thinking", 0.6, 2.5, 0.15, 0, 0, MOONSHOT_SOURCE],
  ["kimi-k2.5", 0.6, 3, 0.1, 0, 0, MOONSHOT_SOURCE],

  // Alibaba Qwen models
  ["qwen3-coder-plus", 1, 5, 0.2, 0, 0, QWEN_SOURCE],
  ["qwen3-coder-flash", 0.3, 1.5, 0.06, 0, 0, QWEN_SOURCE],
  ["qwen3-max", 1.2, 6, 0.24, 0, 0, QWEN_SOURCE],
  ["qwen3.5-plus", 0.4, 2.4, 0.08, 0, 0, QWEN_SOURCE],

  // Z.AI / GLM models
  ["glm-4.7", 0.6, 2.2, 0.11, 0, 0, ZAI_SOURCE],
  ["glm-4.6", 0.6, 2.2, 0.11, 0, 0, ZAI_SOURCE],
  ["glm-4.5", 0.6, 2.2, 0.11, 0, 0, ZAI_SOURCE],
  ["glm-5", 1, 3.2, 0.2, 0, 0, ZAI_SOURCE],
];

function snapshots(reviewed: string, rows: ModelRow[]): HistoricalPrice[] {
  return rows.map(
    ([
      model,
      input,
      output,
      cacheRead,
      cacheWrite,
      cacheWrite1h,
      source,
      maxInputTokens,
      longContext,
    ]) => ({
      id: `${model}:${reviewed}`,
      model,
      input,
      output,
      cacheRead,
      cacheWrite,
      cacheWrite1h,
      source,
      reviewedAt: reviewed,
      effectiveFrom: reviewed,
      ...(maxInputTokens !== undefined ? { maxInputTokens } : {}),
      ...(longContext !== undefined ? { longContext } : {}),
    }),
  );
}

export const HISTORICAL_PRICES: readonly HistoricalPrice[] = [
  ...snapshots(REVIEWED, MODELS),
  ...snapshots(REVIEWED_2026_10_28, MODELS_2026_10_28),
  ...snapshots(REVIEWED_2026_11_21, MODELS_2026_11_21),
];

/** Pre-indexed default price snapshots grouped by model, sorted newest-first. */
const DEFAULT_PRICES_BY_MODEL: ReadonlyMap<string, readonly HistoricalPrice[]> = (() => {
  const byModel = new Map<string, HistoricalPrice[]>();
  for (const price of HISTORICAL_PRICES) {
    let list = byModel.get(price.model);
    if (!list) {
      list = [];
      byModel.set(price.model, list);
    }
    list.push(price);
  }
  for (const list of byModel.values()) {
    list.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  }
  return byModel;
})();

// Synthetic messages are unbilled; bare family names are generation-ambiguous and remain unpriced.
const UNPRICEABLE_MODELS = new Set([
  "<synthetic>",
  "synthetic",
  "opus",
  "sonnet",
  "haiku",
  "fable",
  "default",
  "auto",
]);

// Known first-party and routing provider prefixes that wrap an exact model ID.
const KNOWN_PROVIDER_PREFIXES = [
  "openrouter/anthropic/",
  "openrouter/openai/",
  "openrouter/google/",
  "openrouter/x-ai/",
  "openrouter/deepseek/",
  "openrouter/moonshotai/",
  "openrouter/qwen/",
  "openrouter/z-ai/",
  "anthropic/",
  "openai/",
  "google/",
  "gemini/",
  "xai/",
  "x-ai/",
  "deepseek/",
  "moonshot/",
  "moonshotai/",
  "qwen/",
  "dashscope/",
  "z-ai/",
  "zai/",
  "opencode/",
  "opencode-go/",
  "anthropic.",
  "cursor-",
] as const;

const CURSOR_VARIANT_SUFFIX_RE =
  /(?:-thinking)?(?:-(?:none|minimal|low|medium|high|xhigh|max))?(?:-fast)?$/;

function stripBracketVariant(model: string): string {
  const bracket = model.indexOf("[");
  return bracket === -1 ? model : model.slice(0, bracket);
}

/**
 * Candidate exact model IDs in preference order: exact normalized ID first,
 * then stripped of known provider prefix / bracket variant / Cursor effort
 * suffix. Bare family names and synthetic markers always return `[]`.
 */
export function candidateHistoricalModelIds(model: string | undefined): string[] {
  if (!model) return [];
  const trimmed = stripBracketVariant(model.trim().toLowerCase());
  if (!trimmed || UNPRICEABLE_MODELS.has(trimmed)) return [];

  const candidates: string[] = [];
  const push = (id: string) => {
    if (!id || UNPRICEABLE_MODELS.has(id) || candidates.includes(id)) return;
    candidates.push(id);
  };

  push(trimmed);

  let unwrapped = trimmed;
  for (const prefix of KNOWN_PROVIDER_PREFIXES) {
    if (unwrapped.startsWith(prefix)) {
      unwrapped = unwrapped.slice(prefix.length);
      push(unwrapped);
      break;
    }
  }

  // Also strip Cursor-style effort/thinking suffixes (e.g. "claude-opus-4-6-thinking-high").
  const strippedVariant = unwrapped.replace(CURSOR_VARIANT_SUFFIX_RE, "");
  if (strippedVariant && strippedVariant !== unwrapped) {
    push(strippedVariant);
  }

  return candidates;
}

/** Compute per-category USD costs for a priced token sample. */
export function estimateCategoryCosts(
  pricing: Pick<HistoricalPrice, "input" | "output" | "cacheRead" | "cacheWrite" | "cacheWrite1h">,
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    cacheWrite1h?: number | undefined;
  },
): CategoryCostUsd {
  const oneHour = Math.min(tokens.cacheWrite1h ?? 0, tokens.cacheWrite);
  return {
    input: (tokens.input * pricing.input) / 1_000_000,
    output: (tokens.output * pricing.output) / 1_000_000,
    cacheRead: (tokens.cacheRead * pricing.cacheRead) / 1_000_000,
    cacheWrite:
      ((tokens.cacheWrite - oneHour) * pricing.cacheWrite + oneHour * pricing.cacheWrite1h) /
      1_000_000,
  };
}

/** Compute USD saved by prompt cache reads relative to uncached input pricing. */
export function estimateCacheSavingsUsd(
  pricing: Pick<HistoricalPrice, "input" | "cacheRead">,
  tokens: { cacheRead: number },
): number {
  if (tokens.cacheRead <= 0 || pricing.input <= pricing.cacheRead) return 0;
  return (tokens.cacheRead * (pricing.input - pricing.cacheRead)) / 1_000_000;
}

export function historicalTokenEstimate(
  model: string | undefined,
  tokens: UsageTokens & { cacheWrite1h?: number | undefined },
  occurredAt: number,
  prices: readonly HistoricalPrice[] = HISTORICAL_PRICES,
): { amount: number; pricing: HistoricalPrice } | undefined {
  const candidates = candidateHistoricalModelIds(model);
  if (candidates.length === 0) return undefined;

  const day = new Date(occurredAt).toISOString().slice(0, 10);
  let snapshot: HistoricalPrice | undefined;
  const useDefaultIndex = prices === HISTORICAL_PRICES;
  for (const candidate of candidates) {
    if (useDefaultIndex) {
      const list = DEFAULT_PRICES_BY_MODEL.get(candidate);
      if (!list) continue;
      // Stop once the exact candidate model is known in the table so a distinct
      // suffixed model (e.g. grok-4-fast) never falls back to an older base rate.
      snapshot = list.find((price) => price.effectiveFrom <= day);
      break;
    }
    let hasModel = false;
    let best: HistoricalPrice | undefined;
    for (const price of prices) {
      if (price.model !== candidate) continue;
      hasModel = true;
      if (price.effectiveFrom <= day && (!best || price.effectiveFrom > best.effectiveFrom)) {
        best = price;
      }
    }
    if (hasModel) {
      snapshot = best;
      break;
    }
  }
  if (
    !snapshot ||
    tokens.input === undefined ||
    tokens.output === undefined ||
    tokens.cacheRead === undefined ||
    tokens.cacheWrite === undefined
  )
    return undefined;

  const { maxInputTokens, longContext, ...basePricing } = snapshot;
  const promptTotal = tokens.input + tokens.cacheRead + tokens.cacheWrite;

  // Do not extrapolate a flat rate into an unqualified context tier. Output and
  // the one-hour subset are not additional prompt tokens.
  if (maxInputTokens !== undefined && promptTotal > maxInputTokens) return undefined;

  const pricing: HistoricalPrice =
    longContext && promptTotal > longContext.thresholdTokens
      ? {
          ...basePricing,
          id: `${basePricing.id}:long-context`,
          input: longContext.input,
          output: longContext.output,
          cacheRead: longContext.cacheRead,
          cacheWrite: longContext.cacheWrite,
          cacheWrite1h: longContext.cacheWrite1h,
        }
      : basePricing;

  // No cache-write product exists in this snapshot; don't assume it is free.
  if (tokens.cacheWrite > 0 && pricing.cacheWrite === 0) return undefined;
  // When 1h and 5m cache writes have distinct prices, an unknown TTL cannot
  // silently become a 5m write.
  if (
    tokens.cacheWrite > 0 &&
    pricing.cacheWrite1h !== pricing.cacheWrite &&
    tokens.cacheWrite1h === undefined
  ) {
    return undefined;
  }
  if ((tokens.cacheWrite1h ?? 0) > tokens.cacheWrite) return undefined;

  const oneHour = Math.min(tokens.cacheWrite1h ?? 0, tokens.cacheWrite);
  const amount =
    (tokens.input * pricing.input +
      tokens.output * pricing.output +
      tokens.cacheRead * pricing.cacheRead +
      (tokens.cacheWrite - oneHour) * pricing.cacheWrite +
      oneHour * pricing.cacheWrite1h) /
    1_000_000;
  return { amount, pricing };
}
