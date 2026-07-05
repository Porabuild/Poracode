import { bumpProfileDataGeneration, getProfileDataGeneration, getSqlite } from "./connection";

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
}

export function dbAppendUsageEvents(events: readonly UsageEventInput[]): void {
  const sqlite = getSqlite();
  if (events.length === 0) return;
  const stmt = sqlite.prepare(
    "INSERT INTO usage_events (ts, kind, provider, model, mode, fast, effort, name, value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  sqlite.transaction((rows: readonly UsageEventInput[]) => {
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
      );
    }
  })(events);
  bumpProfileDataGeneration();
}

// Cache the full-table read keyed on the profile generation so the two readers
// of a single profile open (coreStats + tokenStats) share one scan, and
// repeat opens between writes don't rescan at all. Invalidated implicitly: any
// usage write bumps the generation, so a stale generation never matches.
let _usageEventsCache: { generation: number; rows: UsageEventRow[] } | undefined;

export function dbGetAllUsageEvents(): UsageEventRow[] {
  const sqlite = getSqlite();
  if (_usageEventsCache && _usageEventsCache.generation === getProfileDataGeneration()) {
    return _usageEventsCache.rows;
  }
  const rows = sqlite
    .prepare("SELECT ts, kind, provider, model, mode, fast, effort, name, value FROM usage_events")
    .all() as Array<{
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
  const mapped: UsageEventRow[] = rows.map((r) => ({
    ts: r.ts,
    kind: r.kind,
    provider: r.provider,
    model: r.model,
    mode: r.mode,
    fast: r.fast === 1,
    effort: r.effort,
    name: r.name,
    value: r.value,
  }));
  _usageEventsCache = { generation: getProfileDataGeneration(), rows: mapped };
  return mapped;
}
