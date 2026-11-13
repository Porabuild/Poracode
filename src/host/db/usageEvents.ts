import { bumpProfileDataGeneration, getSqlite } from "./connection";
import {
  usagePricingSchema,
  type ProfileCostStats,
  type UsageCostRecord,
  type UsageTokenCategories,
} from "@/shared/contracts/costHistory";

// ── Durable usage-events log (decoupled from thread lifecycle) ──────
//
// Append-only, NO foreign key to threads — so usage stats survive thread delete
// and archive. Provider/model/mode are denormalized at write time (captured at
// the canonical-event layer in the renderer), so aggregation never needs to join
// back to a thread that may no longer exist.

export interface UsageEventInput {
  ts: number;
  kind: string;
  provider?: string | null | undefined;
  model?: string | null | undefined;
  mode?: string | null | undefined;
  fast?: boolean | undefined;
  effort?: string | null | undefined;
  name?: string | null | undefined;
  value?: number | undefined;
  costDetails?: UsageCostRecord | undefined;
}

export interface UsageEventRow {
  ts: number;
  kind: string;
  provider: string | null;
  model: string | null;
  mode: string | null;
  fast: boolean;
  effort: string | null;
  name: string | null;
  value: number;
  costDetails?: UsageCostRecord;
}

export interface UsageAccountCountRow {
  provider: string;
  count: number;
}

export interface CoreUsageEventRow {
  ts: number;
  kind: string;
  provider: string | null;
  model: string | null;
  mode: string | null;
  fast: boolean;
  effort: string | null;
  name: string | null;
  value: number;
}

export interface TokenUsageScanRow {
  ts: number;
  kind: string;
  provider: string | null;
  model: string | null;
  value: number;
  cost_details: string | null;
}

export const CORE_USAGE_EVENT_KINDS = [
  "thread_started",
  "turn",
  "message",
  "goal",
  "skill",
  "workflow",
  "subagent",
  "mcp",
  "ai_commit",
  "ai_pr",
  "ai_conflict",
] as const;

const CORE_USAGE_EVENT_KINDS_SQL = CORE_USAGE_EVENT_KINDS.map((kind) => `'${kind}'`).join(", ");
const CURRENCY_CODE_RE = /^[A-Z]{3}$/;
const MAX_CACHED_PRICING_ENTRIES = 256;

type ValidatedPricing = ProfileCostStats["pricing"][number];
const validatedPricingCache = new Map<string, ValidatedPricing>();

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeSafeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function parseValidatedPricing(raw: unknown): ValidatedPricing | undefined {
  if (!isPlainRecord(raw)) return undefined;
  const {
    id,
    model,
    source,
    reviewedAt,
    effectiveFrom,
    input,
    output,
    cacheRead,
    cacheWrite,
    cacheWrite1h,
  } = raw;
  if (
    typeof id !== "string" ||
    typeof model !== "string" ||
    typeof source !== "string" ||
    typeof reviewedAt !== "string" ||
    typeof effectiveFrom !== "string" ||
    !isFiniteNonNegativeNumber(input) ||
    !isFiniteNonNegativeNumber(output) ||
    !isFiniteNonNegativeNumber(cacheRead) ||
    !isFiniteNonNegativeNumber(cacheWrite) ||
    !isFiniteNonNegativeNumber(cacheWrite1h)
  ) {
    return undefined;
  }
  const cacheKey = `${id}\0${model}\0${source}\0${reviewedAt}\0${effectiveFrom}\0${input}\0${output}\0${cacheRead}\0${cacheWrite}\0${cacheWrite1h}`;
  const cached = validatedPricingCache.get(cacheKey);
  if (cached) return cached;
  const parsed = usagePricingSchema.safeParse(raw);
  if (!parsed.success) return undefined;
  if (validatedPricingCache.size >= MAX_CACHED_PRICING_ENTRIES) {
    validatedPricingCache.clear();
  }
  validatedPricingCache.set(cacheKey, parsed.data);
  return parsed.data;
}

/**
 * Validates persisted `cost_details` JSON with exact `usageCostRecordSchema`
 * parity while deduplicating repeated `pricing` objects across rows and
 * avoiding per-row Zod object allocation across 300k+ token rows.
 * Future record versions (`version !== 1`) stay unknown on downgrade.
 */
export function parseUsageCostRecord(rawJson: string | null): UsageCostRecord | undefined {
  if (!rawJson) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return undefined;
  }
  if (!isPlainRecord(parsed) || parsed.version !== 1) return undefined;

  let model: string | undefined;
  if (parsed.model !== undefined) {
    if (typeof parsed.model !== "string") return undefined;
    model = parsed.model;
  }

  let tokens: UsageTokenCategories | undefined;
  if (parsed.tokens !== undefined) {
    if (!isPlainRecord(parsed.tokens)) return undefined;
    const { input, output, cacheRead, cacheWrite, cacheWrite1h } = parsed.tokens;
    if (
      !isNonNegativeSafeInt(input) ||
      !isNonNegativeSafeInt(output) ||
      !isNonNegativeSafeInt(cacheRead) ||
      !isNonNegativeSafeInt(cacheWrite) ||
      (cacheWrite1h !== undefined && !isNonNegativeSafeInt(cacheWrite1h))
    ) {
      return undefined;
    }
    tokens = {
      input,
      output,
      cacheRead,
      cacheWrite,
      ...(cacheWrite1h !== undefined ? { cacheWrite1h } : {}),
    };
  }

  let observed: UsageCostRecord["observed"];
  if (parsed.observed !== undefined) {
    if (!isPlainRecord(parsed.observed)) return undefined;
    const { amount, currency } = parsed.observed;
    if (
      !isFiniteNonNegativeNumber(amount) ||
      typeof currency !== "string" ||
      !CURRENCY_CODE_RE.test(currency)
    ) {
      return undefined;
    }
    observed = { amount, currency };
  }

  let estimate: UsageCostRecord["estimate"];
  if (parsed.estimate !== undefined) {
    if (!isPlainRecord(parsed.estimate) || !isFiniteNonNegativeNumber(parsed.estimate.amount)) {
      return undefined;
    }
    const pricing = parseValidatedPricing(parsed.estimate.pricing);
    if (!pricing) return undefined;
    estimate = { amount: parsed.estimate.amount, pricing };
  }

  return {
    version: 1,
    ...(model !== undefined ? { model } : {}),
    ...(tokens !== undefined ? { tokens } : {}),
    ...(observed !== undefined ? { observed } : {}),
    ...(estimate !== undefined ? { estimate } : {}),
  };
}

export function dbAppendUsageEvents(events: readonly UsageEventInput[]): void {
  const sqlite = getSqlite();
  if (events.length === 0) return;
  const stmt = sqlite.prepare(
    "INSERT INTO usage_events (ts, kind, provider, model, mode, fast, effort, name, value, cost_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  sqlite
    .transaction((rows: readonly UsageEventInput[]) => {
      for (const e of rows) {
        stmt.run(
          e.ts,
          e.kind,
          e.provider ?? null,
          e.model ?? null,
          e.mode ?? null,
          e.fast ? 1 : 0,
          e.effort ?? null,
          e.name ?? null,
          e.value ?? 1,
          e.costDetails ? JSON.stringify(e.costDetails) : null,
        );
      }
    })
    .immediate(events);
  bumpProfileDataGeneration();
}

/**
 * Distinct non-empty account/provider values ordered by descending event count
 * (breaking ties by first-seen row id) without decoding `cost_details` or
 * materializing rows in JavaScript.
 */
export function dbQueryUsageAccountCounts(): UsageAccountCountRow[] {
  const sqlite = getSqlite();
  return sqlite
    .prepare(
      "SELECT provider, COUNT(*) AS count FROM usage_events WHERE provider IS NOT NULL AND provider != '' GROUP BY provider ORDER BY count DESC, MIN(id) ASC",
    )
    .all() as UsageAccountCountRow[];
}

/**
 * Streams only non-token profile activity rows via `idx_usage_events_kind`,
 * skipping `tokens`/`tokens_v2` rows and never reading `cost_details`.
 */
export function* dbIterateCoreUsageEvents(provider?: string): IterableIterator<CoreUsageEventRow> {
  const sqlite = getSqlite();
  const stmt = provider
    ? sqlite.prepare(
        `SELECT ts, kind, provider, model, mode, fast, effort, name, value FROM usage_events WHERE kind IN (${CORE_USAGE_EVENT_KINDS_SQL}) AND provider = ?`,
      )
    : sqlite.prepare(
        `SELECT ts, kind, provider, model, mode, fast, effort, name, value FROM usage_events WHERE kind IN (${CORE_USAGE_EVENT_KINDS_SQL})`,
      );
  const iter = (provider ? stmt.iterate(provider) : stmt.iterate()) as IterableIterator<{
    ts: number;
    kind: string;
    provider: string | null;
    model: string | null;
    mode: string | null;
    fast: number;
    effort: string | null;
    name: string | null;
    value: number;
  }>;
  for (const r of iter) {
    yield {
      ts: r.ts,
      kind: r.kind,
      provider: r.provider,
      model: r.model,
      mode: r.mode,
      fast: r.fast === 1,
      effort: r.effort,
      name: r.name,
      value: r.value,
    };
  }
}

/**
 * Streams the minimal column projection needed for token/cost rollups and
 * exact-telemetry coverage checks without allocating a full-table JS array.
 */
export function dbIterateTokenUsageScanRows(): IterableIterator<TokenUsageScanRow> {
  const sqlite = getSqlite();
  return sqlite
    .prepare("SELECT ts, kind, provider, model, value, cost_details FROM usage_events")
    .iterate() as IterableIterator<TokenUsageScanRow>;
}

/**
 * Direct full-row reader retained for unit tests and mock barrels. Never caches
 * full-table `UsageEventRow[]` in module memory; production profile stats use
 * `dbQueryUsageAccountCounts`, `dbIterateCoreUsageEvents`, and
 * `dbIterateTokenUsageScanRows`.
 */
export function dbGetAllUsageEvents(): UsageEventRow[] {
  const sqlite = getSqlite();
  const iter = sqlite
    .prepare(
      "SELECT ts, kind, provider, model, mode, fast, effort, name, value, cost_details FROM usage_events",
    )
    .iterate() as IterableIterator<{
    ts: number;
    kind: string;
    provider: string | null;
    model: string | null;
    mode: string | null;
    fast: number;
    effort: string | null;
    name: string | null;
    value: number;
    cost_details: string | null;
  }>;
  const mapped: UsageEventRow[] = [];
  for (const r of iter) {
    const details = parseUsageCostRecord(r.cost_details);
    mapped.push({
      ts: r.ts,
      kind: r.kind,
      provider: r.provider,
      model: r.model,
      mode: r.mode,
      fast: r.fast === 1,
      effort: r.effort,
      name: r.name,
      value: r.value,
      ...(details ? { costDetails: details } : {}),
    });
  }
  return mapped;
}
