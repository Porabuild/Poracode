import { priceTokens } from "./pricing";
import type { UsageCost, UsageTokens } from "./types";

/**
 * Estimated spend + token totals reconstructed from local CLI session logs at
 * public API list rates. For subscription/OAuth users this is NOT the real
 * bill — surface it as "estimated". Pure: the caller supplies file contents;
 * disk I/O lives in the host.
 */
export interface CostEstimate {
  cost: UsageCost;
  tokens: UsageTokens;
  /** Model id with the largest cost contribution. */
  topModel?: string;
}

interface ClaudeAssistantLine {
  type?: string;
  requestId?: string;
  timestamp?: string;
  message?: {
    id?: string;
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
}

interface ModelTokens {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

function pos(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Aggregate Claude Code session JSONL into an estimated 30-day cost + token
 * totals. Dedups streamed chunks by `messageId:requestId` (later cumulative
 * chunks overwrite earlier ones, matching CodexBar), filters to [sinceMs, nowMs],
 * sums tokens per model and prices each at list rates. Returns undefined when
 * no priced usage is found.
 */
export function aggregateClaudeCost(
  contents: readonly string[],
  opts: { sinceMs: number; nowMs: number },
): CostEstimate | undefined {
  const perModel = new Map<string, ModelTokens>();
  const seen = new Set<string>();
  let any = false;

  for (const content of contents) {
    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (line.length === 0 || line[0] !== "{") continue;
      let parsed: ClaudeAssistantLine;
      try {
        parsed = JSON.parse(line) as ClaudeAssistantLine;
      } catch {
        continue;
      }
      if (parsed.type !== "assistant") continue;
      const usage = parsed.message?.usage;
      if (!usage) continue;

      if (parsed.timestamp) {
        const ts = Date.parse(parsed.timestamp);
        if (Number.isFinite(ts) && (ts < opts.sinceMs || ts > opts.nowMs)) continue;
      }

      const messageId = parsed.message?.id ?? "";
      const requestId = parsed.requestId ?? "";
      if (messageId || requestId) {
        const key = `${messageId}:${requestId}`;
        if (seen.has(key)) continue;
        seen.add(key);
      }

      const model = parsed.message?.model ?? "unknown";
      const entry = perModel.get(model) ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
      entry.input += pos(usage.input_tokens);
      entry.output += pos(usage.output_tokens);
      entry.cacheWrite += pos(usage.cache_creation_input_tokens);
      entry.cacheRead += pos(usage.cache_read_input_tokens);
      perModel.set(model, entry);
      any = true;
    }
  }

  if (!any) return undefined;

  let amount = 0;
  const totals: ModelTokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let topModel: string | undefined;
  let topCost = -1;
  for (const [model, t] of perModel) {
    const modelCost = priceTokens(model, t);
    amount += modelCost;
    totals.input += t.input;
    totals.output += t.output;
    totals.cacheRead += t.cacheRead;
    totals.cacheWrite += t.cacheWrite;
    if (modelCost > topCost) {
      topCost = modelCost;
      topModel = model;
    }
  }

  const total = totals.input + totals.output + totals.cacheRead + totals.cacheWrite;

  return {
    cost: {
      currency: "USD",
      amount: Math.round(amount * 100) / 100,
      period: "30d",
      estimated: true,
    } satisfies UsageCost,
    tokens: {
      total,
      input: totals.input,
      output: totals.output,
      cacheRead: totals.cacheRead,
      cacheWrite: totals.cacheWrite,
      period: "30d",
    } satisfies UsageTokens,
    ...(topModel ? { topModel } : {}),
  };
}
