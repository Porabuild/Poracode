import { z } from "zod";
import type {
  GitBranchListResult,
  GitStatusResult,
  GitWorktreeInfo,
  PrData,
} from "@/shared/contracts";
import {
  gitBranchListResultSchema,
  gitStatusResultSchema,
  gitWorktreeInfoSchema,
} from "@/shared/contracts/gitResults";
import { prDataSchema } from "@/shared/contracts/githubResults";

const schemas = {
  statuses: gitStatusResultSchema,
  worktrees: z.array(gitWorktreeInfoSchema),
  branches: gitBranchListResultSchema,
  ghAvailable: z.boolean(),
  worktreeStatuses: gitStatusResultSchema,
  prData: prDataSchema.nullable(),
  worktreeSourceInfo: z.object({
    sourceBranch: z.string().nullable(),
    commitsAhead: z.number(),
    sourceAhead: z.number(),
  }),
};
type Field = keyof typeof schemas;
export interface GitCacheState {
  statuses: Record<string, GitStatusResult>;
  worktreeStatuses: Record<string, GitStatusResult>;
  worktrees: Record<string, GitWorktreeInfo[]>;
  branches: Record<string, GitBranchListResult>;
  ghAvailable: Record<string, boolean>;
  prData: Record<string, PrData | null>;
  worktreeSourceInfo: Record<
    string,
    { sourceBranch: string | null; commitsAhead: number; sourceAhead: number }
  >;
}

// v3 writes entries independently while preserving v2's whole-cache expiry
// and browser quota. Smaller arbitrary caps drop valid offline data.
const PREFIX = "poracode-git-cache-v3:";
const UPDATED_KEY = `${PREFIX}updated`;
const LEGACY_KEY = "poracode-git-cache-v2";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const fields = Object.keys(schemas) as Field[];

interface CacheEntry {
  field: Field;
  key: string;
  value: unknown;
  ts: number;
}

const entries = new Map<string, CacheEntry>();
const futureKeys = new Set<string>();
let previous: Partial<GitCacheState> = {};
let migrationFailed = false;

function storageKey(field: Field, key: string): string {
  return `${PREFIX}${field}:${key}`;
}

function discardLegacyCache(): void {
  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw) return;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && "v" in parsed && parsed.v !== 2) return;
  } catch {
    // Malformed disposable cache data cannot be hydrated either.
  }
  localStorage.removeItem(LEGACY_KEY);
}

export function loadGitCache(): Partial<GitCacheState> {
  if (typeof localStorage === "undefined") return {};
  const state: Partial<GitCacheState> = {};
  let updatedAt = 0;
  try {
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
    for (const key of keys) {
      if (!key?.startsWith(PREFIX)) continue;
      if (key === UPDATED_KEY) {
        try {
          const record = JSON.parse(localStorage.getItem(key) ?? "null") as {
            v?: unknown;
            ts?: unknown;
          } | null;
          if (typeof record?.v === "number" && record.v > 3) futureKeys.add(key);
          else if (record?.v === 3 && typeof record.ts === "number" && Number.isFinite(record.ts)) {
            updatedAt = record.ts;
          } else localStorage.removeItem(key);
        } catch {
          localStorage.removeItem(key);
        }
        continue;
      }
      const suffix = key.slice(PREFIX.length);
      const separator = suffix.indexOf(":");
      const field = suffix.slice(0, separator) as Field;
      if (separator < 0 || !Object.hasOwn(schemas, field)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const record = JSON.parse(raw) as { v?: unknown; ts?: unknown; value?: unknown };
        if (typeof record?.v === "number" && record.v > 3) {
          futureKeys.add(key);
          continue;
        }
        const value = schemas[field].safeParse(record?.value);
        if (
          record?.v !== 3 ||
          typeof record.ts !== "number" ||
          !Number.isFinite(record.ts) ||
          !value.success
        ) {
          localStorage.removeItem(key);
          continue;
        }
        entries.set(key, {
          field,
          key: suffix.slice(separator + 1),
          value: value.data,
          ts: record.ts,
        });
      } catch {
        localStorage.removeItem(key);
      }
    }
    migrateLegacyCache();
    for (const entry of entries.values()) updatedAt = Math.max(updatedAt, entry.ts);
    if (Date.now() - updatedAt > TTL_MS) {
      clearGitCache();
      return {};
    }
    for (const entry of entries.values()) {
      Object.defineProperty((state[entry.field] ??= {}), entry.key, {
        value: entry.value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
  } catch {
    // Cache availability must not prevent the authoritative host refresh.
  }
  previous = state;
  return state;
}

function migrateLegacyCache(): void {
  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw) return;
  let legacy: { v?: unknown; ts?: unknown } & Partial<Record<Field, unknown>>;
  try {
    legacy = JSON.parse(raw);
  } catch {
    localStorage.removeItem(LEGACY_KEY);
    return;
  }
  if (legacy?.v !== 2) return;
  if (
    typeof legacy.ts !== "number" ||
    !Number.isFinite(legacy.ts) ||
    Date.now() - legacy.ts > TTL_MS
  ) {
    localStorage.removeItem(LEGACY_KEY);
    return;
  }
  const migrated = new Map<string, CacheEntry>();
  for (const field of fields) {
    const values = legacy[field];
    if (typeof values !== "object" || values === null || Array.isArray(values)) continue;
    for (const [key, value] of Object.entries(values)) {
      const name = storageKey(field, key);
      if (entries.has(name) || futureKeys.has(name)) continue;
      const parsed = schemas[field].safeParse(value);
      if (parsed.success) migrated.set(name, { field, key, value: parsed.data, ts: legacy.ts });
    }
  }
  const written: string[] = [];
  try {
    // Two copies may exceed the same quota that held v2. On failure restore
    // the old bytes and keep this session's hydrated data available offline.
    localStorage.removeItem(LEGACY_KEY);
    for (const [name, entry] of migrated) {
      localStorage.setItem(name, JSON.stringify({ v: 3, ts: entry.ts, value: entry.value }));
      written.push(name);
    }
  } catch {
    migrationFailed = true;
    try {
      for (const name of written) localStorage.removeItem(name);
      localStorage.setItem(LEGACY_KEY, raw);
    } catch {
      // Storage itself may be unavailable; the in-memory cache still hydrates.
    }
  }
  for (const [name, entry] of migrated) entries.set(name, entry);
}

export function persistGitCache(state: GitCacheState): void {
  if (typeof localStorage === "undefined" || migrationFailed) return;
  const now = Date.now();
  const changed = new Map<string, CacheEntry>();
  const writes = new Map<string, string>();
  for (const field of fields) {
    if (previous[field] === state[field]) continue;
    for (const [key, value] of Object.entries(state[field])) {
      const name = storageKey(field, key);
      if (futureKeys.has(name)) continue;
      if (previous[field]?.[key] === value) continue;
      const raw = JSON.stringify({ v: 3, ts: now, value });
      changed.set(name, { field, key, value, ts: now });
      writes.set(name, raw);
    }
  }
  try {
    for (const [key, entry] of entries) {
      if (!Object.hasOwn(state[entry.field], entry.key)) {
        localStorage.removeItem(key);
        entries.delete(key);
      }
    }
    for (const [key, entry] of changed) {
      const raw = writes.get(key);
      if (raw !== undefined) localStorage.setItem(key, raw);
      entries.set(key, entry);
    }
    // Changed records already carry the cache timestamp. Deletion-only updates
    // need a small checkpoint to preserve the same expiry without a full write.
    if (
      changed.size === 0 &&
      fields.some((field) => previous[field] !== state[field]) &&
      !futureKeys.has(UPDATED_KEY)
    ) {
      localStorage.setItem(UPDATED_KEY, JSON.stringify({ v: 3, ts: now }));
    }
    previous = Object.fromEntries(fields.map((field) => [field, state[field]]));
  } catch {
    // A failed write is retried on the next update; never block live Git state.
  }
}

export function clearGitCache(): void {
  previous = {};
  migrationFailed = false;
  if (typeof localStorage === "undefined") return;
  try {
    discardLegacyCache();
    if (!futureKeys.has(UPDATED_KEY)) localStorage.removeItem(UPDATED_KEY);
    for (const key of entries.keys()) localStorage.removeItem(key);
    entries.clear();
  } catch {
    // Storage can be unavailable in a sandboxed or private browser session.
  }
}
