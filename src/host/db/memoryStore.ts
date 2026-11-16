import { randomUUID } from "node:crypto";
import type {
  MemoryCategory,
  MemoryEntry,
  MemoryPolarity,
  MemoryScope,
  MemorySkillSuggestion,
  MemoryThreadMode,
} from "@/shared/memory";
import { getSqlite } from "@/host/db/connection";
import type { TranscriptItem } from "@/host/memory/logic";

interface EntryRow {
  id: string;
  scope: MemoryScope;
  project_id: string | null;
  category: MemoryCategory;
  summary: string;
  body: string;
  confidence: number;
  polarity: MemoryPolarity;
  quote: string | null;
  locked_by_user: number;
  pinned: number;
  archived: number;
  usage_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
  source: MemoryEntry["source"];
}

function mapEntry(row: EntryRow): MemoryEntry {
  return {
    id: row.id,
    scope: row.scope,
    projectId: row.project_id,
    category: row.category,
    summary: row.summary,
    body: row.body,
    confidence: row.confidence,
    polarity: row.polarity,
    quote: row.quote,
    lockedByUser: row.locked_by_user === 1,
    pinned: row.pinned === 1,
    archived: row.archived === 1,
    usageCount: row.usage_count,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    source: row.source,
  };
}

export function dbListMemoryEntries(projectId?: string): MemoryEntry[] {
  const rows = (
    projectId
      ? getSqlite()
          .prepare(
            `SELECT * FROM memory_entries
             WHERE archived = 0 AND (scope = 'global' OR project_id = ?)
             ORDER BY pinned DESC, confidence DESC, updated_at DESC`,
          )
          .all(projectId)
      : getSqlite()
          .prepare(
            `SELECT * FROM memory_entries WHERE archived = 0
             ORDER BY pinned DESC, confidence DESC, updated_at DESC`,
          )
          .all()
  ) as EntryRow[];
  return rows.map(mapEntry);
}

export function dbGetMemoryEntry(id: string): MemoryEntry | undefined {
  const row = getSqlite().prepare("SELECT * FROM memory_entries WHERE id = ?").get(id) as
    | EntryRow
    | undefined;
  return row ? mapEntry(row) : undefined;
}

export function dbUpsertMemoryEntry(entry: MemoryEntry): void {
  getSqlite()
    .prepare(
      `INSERT INTO memory_entries (
         id, scope, project_id, category, summary, body, confidence, polarity, quote,
         locked_by_user, pinned, archived, usage_count, last_used_at, created_at, updated_at, source
       ) VALUES (
         @id, @scope, @projectId, @category, @summary, @body, @confidence, @polarity, @quote,
         @lockedByUser, @pinned, @archived, @usageCount, @lastUsedAt, @createdAt, @updatedAt, @source
       )
       ON CONFLICT(id) DO UPDATE SET
         scope = excluded.scope,
         project_id = excluded.project_id,
         category = excluded.category,
         summary = excluded.summary,
         body = excluded.body,
         confidence = excluded.confidence,
         polarity = excluded.polarity,
         quote = excluded.quote,
         locked_by_user = excluded.locked_by_user,
         pinned = excluded.pinned,
         archived = excluded.archived,
         usage_count = excluded.usage_count,
         last_used_at = excluded.last_used_at,
         updated_at = excluded.updated_at,
         source = excluded.source`,
    )
    .run({
      ...entry,
      lockedByUser: entry.lockedByUser ? 1 : 0,
      pinned: entry.pinned ? 1 : 0,
      archived: entry.archived ? 1 : 0,
    });
}

export function dbDeleteMemoryEntry(id: string): void {
  getSqlite().prepare("DELETE FROM memory_entries WHERE id = ?").run(id);
}

export function dbTouchMemoryUsage(id: string, at: string): void {
  getSqlite()
    .prepare(
      "UPDATE memory_entries SET usage_count = usage_count + 1, last_used_at = ? WHERE id = ?",
    )
    .run(at, id);
}

export function dbCountMemoryEntries(): number {
  const row = getSqlite()
    .prepare("SELECT COUNT(*) AS count FROM memory_entries WHERE archived = 0")
    .get() as { count: number };
  return row.count;
}

export interface MemoryCandidateRow {
  id: string;
  threadId: string | null;
  projectId: string | null;
  scope: MemoryScope;
  category: MemoryCategory;
  statement: string;
  quote: string | null;
  polarity: MemoryPolarity;
  confidence: number;
  explicit: boolean;
  status: string;
  createdAt: string;
}

export function dbInsertMemoryCandidate(candidate: MemoryCandidateRow): void {
  getSqlite()
    .prepare(
      `INSERT INTO memory_candidates (
         id, thread_id, project_id, scope, category, statement, quote, polarity,
         confidence, explicit, status, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      candidate.id,
      candidate.threadId,
      candidate.projectId,
      candidate.scope,
      candidate.category,
      candidate.statement,
      candidate.quote,
      candidate.polarity,
      candidate.confidence,
      candidate.explicit ? 1 : 0,
      candidate.status,
      candidate.createdAt,
    );
}

export function dbListPendingCandidates(): MemoryCandidateRow[] {
  const rows = getSqlite()
    .prepare(
      `SELECT id, thread_id, project_id, scope, category, statement, quote, polarity,
              confidence, explicit, status, created_at
       FROM memory_candidates WHERE status = 'pending' ORDER BY created_at ASC`,
    )
    .all() as Array<{
    id: string;
    thread_id: string | null;
    project_id: string | null;
    scope: MemoryScope;
    category: MemoryCategory;
    statement: string;
    quote: string | null;
    polarity: MemoryPolarity;
    confidence: number;
    explicit: number;
    status: string;
    created_at: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    threadId: row.thread_id,
    projectId: row.project_id,
    scope: row.scope,
    category: row.category,
    statement: row.statement,
    quote: row.quote,
    polarity: row.polarity,
    confidence: row.confidence,
    explicit: row.explicit === 1,
    status: row.status,
    createdAt: row.created_at,
  }));
}

export function dbCountPendingCandidates(): number {
  const row = getSqlite()
    .prepare("SELECT COUNT(*) AS count FROM memory_candidates WHERE status = 'pending'")
    .get() as { count: number };
  return row.count;
}

export function dbSetCandidateStatus(id: string, status: string): void {
  getSqlite().prepare("UPDATE memory_candidates SET status = ? WHERE id = ?").run(status, id);
}

export function dbSpoolMemoryCapture(input: {
  threadId: string;
  projectId: string | null;
  text: string;
  createdAt: string;
}): void {
  getSqlite()
    .prepare(
      `INSERT INTO memory_capture_spool (id, thread_id, project_id, text, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(randomUUID(), input.threadId, input.projectId, input.text, input.createdAt);
}

export function dbListMemorySpool(): Array<{
  id: string;
  threadId: string;
  projectId: string | null;
  text: string;
}> {
  const rows = getSqlite()
    .prepare(
      "SELECT id, thread_id, project_id, text FROM memory_capture_spool ORDER BY created_at ASC",
    )
    .all() as Array<{ id: string; thread_id: string; project_id: string | null; text: string }>;
  return rows.map((row) => ({
    id: row.id,
    threadId: row.thread_id,
    projectId: row.project_id,
    text: row.text,
  }));
}

export function dbDeleteMemorySpool(id: string): void {
  getSqlite().prepare("DELETE FROM memory_capture_spool WHERE id = ?").run(id);
}

export function dbGetMemoryThreadState(threadId: string): {
  mode: MemoryThreadMode;
  cursor: number;
  nextAttemptAt: string | null;
} {
  const row = getSqlite()
    .prepare("SELECT mode, cursor, next_attempt_at FROM memory_thread_state WHERE thread_id = ?")
    .get(threadId) as
    | { mode: MemoryThreadMode; cursor: number; next_attempt_at: string | null }
    | undefined;
  return row
    ? { mode: row.mode, cursor: row.cursor, nextAttemptAt: row.next_attempt_at }
    : { mode: "learn", cursor: -1, nextAttemptAt: null };
}

export function dbSetMemoryThreadState(input: {
  threadId: string;
  mode?: MemoryThreadMode;
  cursor?: number;
  nextAttemptAt?: string | null;
  updatedAt: string;
}): void {
  const current = dbGetMemoryThreadState(input.threadId);
  getSqlite()
    .prepare(
      `INSERT INTO memory_thread_state (thread_id, mode, cursor, next_attempt_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(thread_id) DO UPDATE SET
         mode = excluded.mode,
         cursor = excluded.cursor,
         next_attempt_at = excluded.next_attempt_at,
         updated_at = excluded.updated_at`,
    )
    .run(
      input.threadId,
      input.mode ?? current.mode,
      input.cursor ?? current.cursor,
      input.nextAttemptAt === undefined ? current.nextAttemptAt : input.nextAttemptAt,
      input.updatedAt,
    );
}

export function dbReadMemoryTranscript(threadId: string, afterPosition: number): TranscriptItem[] {
  return getSqlite()
    .prepare(
      `SELECT position, type, payload FROM thread_runtime_items
       WHERE thread_id = ? AND position > ?
       ORDER BY position ASC`,
    )
    .all(threadId, afterPosition) as TranscriptItem[];
}

export function dbMemoryMeta(key: string): string | null {
  const row = getSqlite().prepare("SELECT value FROM memory_meta WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function dbSetMemoryMeta(key: string, value: string): void {
  getSqlite()
    .prepare(
      `INSERT INTO memory_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value);
}

export interface MemoryDreamRun {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  report: string;
  undo: string | null;
  undone: boolean;
}

export function dbInsertMemoryDreamRun(run: MemoryDreamRun): void {
  getSqlite()
    .prepare(
      `INSERT INTO memory_dream_runs (id, scope_key, started_at, finished_at, report_json, undo_json, undone)
       VALUES (?, 'all', ?, ?, ?, ?, ?)`,
    )
    .run(run.id, run.startedAt, run.finishedAt, run.report, run.undo, run.undone ? 1 : 0);
}

export function dbLatestMemoryDream(): { finishedAt: string | null; report: string | null } {
  const row = getSqlite()
    .prepare(
      `SELECT finished_at, report_json FROM memory_dream_runs
       WHERE undone = 0 ORDER BY started_at DESC LIMIT 1`,
    )
    .get() as { finished_at: string | null; report_json: string } | undefined;
  return { finishedAt: row?.finished_at ?? null, report: row?.report_json ?? null };
}

export function dbGetMemoryDreamRun(id: string): MemoryDreamRun | undefined {
  const row = getSqlite()
    .prepare(
      `SELECT id, started_at, finished_at, report_json, undo_json, undone
       FROM memory_dream_runs WHERE id = ?`,
    )
    .get(id) as
    | {
        id: string;
        started_at: string;
        finished_at: string | null;
        report_json: string;
        undo_json: string | null;
        undone: number;
      }
    | undefined;
  if (!row) return undefined;
  return {
    id: row.id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    report: row.report_json,
    undo: row.undo_json,
    undone: row.undone === 1,
  };
}

export function dbMarkMemoryDreamUndone(id: string): void {
  getSqlite().prepare("UPDATE memory_dream_runs SET undone = 1 WHERE id = ?").run(id);
}

export function dbListMemorySuggestions(projectId?: string): MemorySkillSuggestion[] {
  const rows = (
    projectId
      ? getSqlite()
          .prepare(
            `SELECT * FROM memory_skill_suggestions
             WHERE status = 'suggested' AND (project_id IS NULL OR project_id = ?)
             ORDER BY created_at DESC`,
          )
          .all(projectId)
      : getSqlite()
          .prepare(
            `SELECT * FROM memory_skill_suggestions WHERE status = 'suggested' ORDER BY created_at DESC`,
          )
          .all()
  ) as SuggestionRow[];
  return rows.map(mapSuggestion);
}

export function dbGetMemorySuggestion(id: string): MemorySkillSuggestion | undefined {
  const row = getSqlite().prepare("SELECT * FROM memory_skill_suggestions WHERE id = ?").get(id) as
    | SuggestionRow
    | undefined;
  return row ? mapSuggestion(row) : undefined;
}

export function dbFindMemorySuggestionByName(name: string, projectId: string | null): boolean {
  const row = getSqlite()
    .prepare(
      `SELECT id FROM memory_skill_suggestions
       WHERE name = ? AND (project_id IS ? OR (project_id IS NULL AND ? IS NULL))
       LIMIT 1`,
    )
    .get(name, projectId, projectId) as { id: string } | undefined;
  return row !== undefined;
}

export function dbUpsertMemorySuggestion(suggestion: MemorySkillSuggestion): void {
  getSqlite()
    .prepare(
      `INSERT INTO memory_skill_suggestions (
         id, project_id, name, description, body, scope, availability, why, status, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         description = excluded.description,
         body = excluded.body,
         scope = excluded.scope,
         availability = excluded.availability,
         status = excluded.status,
         updated_at = excluded.updated_at`,
    )
    .run(
      suggestion.id,
      suggestion.projectId,
      suggestion.name,
      suggestion.description,
      suggestion.body,
      suggestion.scope,
      suggestion.availability,
      suggestion.why,
      suggestion.status,
      suggestion.createdAt,
      suggestion.updatedAt,
    );
}

export function dbCountOpenSuggestions(): number {
  const row = getSqlite()
    .prepare("SELECT COUNT(*) AS count FROM memory_skill_suggestions WHERE status = 'suggested'")
    .get() as { count: number };
  return row.count;
}

interface SuggestionRow {
  id: string;
  project_id: string | null;
  name: string;
  description: string;
  body: string;
  scope: MemoryScope;
  availability: "shared" | "poracode";
  why: string;
  status: MemorySkillSuggestion["status"];
  created_at: string;
  updated_at: string;
}

function mapSuggestion(row: SuggestionRow): MemorySkillSuggestion {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description,
    body: row.body,
    scope: row.scope,
    availability: row.availability,
    why: row.why,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
