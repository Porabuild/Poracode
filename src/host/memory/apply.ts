import { randomUUID } from "node:crypto";
import { isHomeProjectId } from "@/shared/homeScope";
import type { MemoryEntry, MemorySettings } from "@/shared/memory";
import type { MemoryObservation } from "./logic";
import {
  dbGetMemoryEntry,
  dbInsertMemoryCandidate,
  dbListPendingCandidates,
  dbListScopedMemoryEntries,
  dbSetCandidateStatus,
  dbUpsertMemoryEntry,
  dbUpsertMemorySuggestion,
  dbFindMemorySuggestionByName,
  type MemoryCandidateRow,
} from "@/host/db/memoryStore";
import { conflictsWith, scoreObservation, skillDraft, statementKey } from "./logic";

export interface AppliedMemory {
  saved: number;
  candidates: number;
  conflicts: number;
}

export function rememberObservations(input: {
  observations: readonly MemoryObservation[];
  threadId: string | null;
  projectId: string | null;
  now: string;
}): AppliedMemory {
  let saved = 0;
  let candidates = 0;
  let conflicts = 0;
  const existing = dbListScopedMemoryEntries(
    input.projectId,
    input.projectId ? isHomeProjectId(input.projectId) : true,
  );
  const handled = new Set(existing.map((entry) => `${entry.scope}:${statementKey(entry.summary)}`));
  for (const observation of input.observations) {
    const wantsProject = observation.scope === "project" || observation.category === "project";
    if (wantsProject && (!input.projectId || isHomeProjectId(input.projectId))) {
      // Never leak project architecture/codebase facts into global memory when no project owns the note.
      continue;
    }
    const scope: MemoryEntry["scope"] = wantsProject ? "project" : "global";
    const projectId = scope === "project" ? input.projectId : null;
    const key = `${scope}:${statementKey(observation.statement)}`;
    if (handled.has(key)) continue;
    handled.add(key);
    const prior = existing.filter(
      (entry) => statementKey(entry.summary) === statementKey(observation.statement),
    ).length;
    const { confidence } = scoreObservation(observation, prior);
    const blocking = existing.find((entry) => conflictsWith(observation, entry));
    if (blocking) {
      conflicts += 1;
      insertCandidate(observation, input, scope, projectId, confidence, "conflict");
      candidates += 1;
      continue;
    }
    if (observation.explicit && confidence >= 0.7) {
      const current = existing.find(
        (entry) =>
          statementKey(entry.summary) === statementKey(observation.statement) &&
          entry.scope === scope,
      );
      const entry = entryFromObservation(
        current,
        observation,
        scope,
        projectId,
        confidence,
        input.now,
      );
      if (!current?.lockedByUser) {
        dbUpsertMemoryEntry(entry);
        if (!current) existing.push(entry);
        saved += 1;
      }
      continue;
    }
    insertCandidate(observation, input, scope, projectId, confidence, "pending");
    candidates += 1;
  }
  return { saved, candidates, conflicts };
}

function insertCandidate(
  observation: MemoryObservation,
  input: { threadId: string | null; now: string },
  scope: MemoryEntry["scope"],
  projectId: string | null,
  confidence: number,
  status: string,
): void {
  const row: MemoryCandidateRow = {
    id: randomUUID(),
    threadId: input.threadId,
    projectId,
    scope,
    category: observation.category,
    statement: observation.statement,
    quote: observation.quote,
    polarity: observation.polarity,
    confidence,
    explicit: observation.explicit,
    status,
    createdAt: input.now,
  };
  dbInsertMemoryCandidate(row);
}

function entryFromObservation(
  current: MemoryEntry | undefined,
  observation: MemoryObservation,
  scope: MemoryEntry["scope"],
  projectId: string | null,
  confidence: number,
  now: string,
): MemoryEntry {
  return {
    id: current?.id ?? randomUUID(),
    scope,
    projectId,
    category: observation.category,
    summary: observation.statement,
    body: observation.quote ?? observation.statement,
    confidence: Math.max(current?.confidence ?? 0, confidence),
    polarity: observation.polarity,
    quote: observation.quote,
    lockedByUser: current?.lockedByUser ?? false,
    pinned: current?.pinned ?? false,
    archived: false,
    usageCount: current?.usageCount ?? 0,
    lastUsedAt: current?.lastUsedAt ?? null,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
    source: "learned",
  };
}

export interface DreamOutcome {
  promoted: number;
  suggested: number;
  report: string;
  /** Entries replaced by this dream, restored on undo. */
  restore: MemoryEntry[];
  /** Entries this dream created, deleted on undo. */
  createdIds: string[];
  /** Suggestions this dream created, removed on undo while still suggested. */
  suggestionIds: string[];
  /** Candidates this dream promoted, returned to pending on undo. */
  candidateIds: string[];
}

/** Rule-based consolidation, optionally enriched by the dream model. Locked entries stay untouched. */
export function dreamMemories(
  settings: MemorySettings,
  now: string,
  consolidated: readonly MemoryObservation[] = [],
): DreamOutcome {
  const pending = dbListPendingCandidates();
  const restore: MemoryEntry[] = [];
  const createdIds: string[] = [];
  const suggestionIds: string[] = [];
  const candidateIds: string[] = [];
  let promoted = 0;
  const knownProjects = new Set(
    pending.map((candidate) => candidate.projectId).filter((id): id is string => Boolean(id)),
  );
  const groups = new Map<string, MemoryCandidateRow[]>();
  for (const candidate of pending) {
    const key = `${candidate.scope}\0${candidate.projectId ?? ""}\0${statementKey(candidate.statement)}`;
    const group = groups.get(key) ?? [];
    group.push(candidate);
    groups.set(key, group);
  }
  const seenConsolidated = new Set<string>();
  for (const observation of consolidated) {
    const wantsProject = observation.scope === "project" || observation.category === "project";
    if (wantsProject && (!observation.projectId || !knownProjects.has(observation.projectId))) {
      continue;
    }
    const scope: MemoryEntry["scope"] = wantsProject ? "project" : "global";
    const projectId = scope === "project" ? (observation.projectId ?? null) : null;
    const key = `${scope}\0${projectId ?? ""}\0${statementKey(observation.statement)}`;
    if (!statementKey(observation.statement) || seenConsolidated.has(key)) continue;
    seenConsolidated.add(key);
    const existingList = dbListScopedMemoryEntries(
      projectId,
      projectId ? isHomeProjectId(projectId) : true,
    );
    if (existingList.some((entry) => conflictsWith(observation, entry))) continue;
    const existing = existingList.find(
      (entry) =>
        entry.scope === scope &&
        statementKey(entry.summary) === statementKey(observation.statement),
    );
    if (existing?.lockedByUser) continue;
    if (existing && !restore.some((item) => item.id === existing.id)) restore.push(existing);
    const entry = entryFromObservation(existing, observation, scope, projectId, 0.85, now);
    entry.source = "dream";
    if (!existing) createdIds.push(entry.id);
    dbUpsertMemoryEntry(entry);
    promoted += 1;
  }
  for (const group of groups.values()) {
    const strongest = group.reduce((best, item) =>
      item.confidence > best.confidence ? item : best,
    );
    const groupKey = `${strongest.scope}\0${strongest.projectId ?? ""}\0${statementKey(strongest.statement)}`;
    const promote = strongest.explicit || strongest.confidence >= 0.7 || group.length >= 2;
    if (seenConsolidated.has(groupKey) || (consolidated.length > 0 && !promote)) {
      for (const item of group) {
        dbSetCandidateStatus(item.id, "promoted");
        candidateIds.push(item.id);
      }
      continue;
    }
    if (!promote) continue;
    const existing = dbListScopedMemoryEntries(
      strongest.projectId,
      strongest.projectId ? isHomeProjectId(strongest.projectId) : true,
    ).find(
      (entry) =>
        entry.scope === strongest.scope &&
        statementKey(entry.summary) === statementKey(strongest.statement),
    );
    if (existing?.lockedByUser) {
      for (const item of group) dbSetCandidateStatus(item.id, "kept");
      continue;
    }
    if (existing && !restore.some((item) => item.id === existing.id)) restore.push(existing);
    const entry = entryFromObservation(
      existing,
      {
        scope: strongest.scope,
        category: strongest.category,
        statement: strongest.statement,
        quote: strongest.quote,
        polarity: strongest.polarity,
        explicit: strongest.explicit,
      },
      strongest.scope,
      strongest.projectId,
      Math.min(0.95, strongest.confidence + Math.max(0, group.length - 1) * 0.05),
      now,
    );
    entry.source = "dream";
    if (!existing && !createdIds.includes(entry.id)) createdIds.push(entry.id);
    dbUpsertMemoryEntry(entry);
    for (const item of group) {
      dbSetCandidateStatus(item.id, "promoted");
      candidateIds.push(item.id);
    }
    promoted += 1;
  }
  let suggested = 0;
  if (settings.suggestSkills) {
    for (const group of groups.values()) {
      if (group.length < settings.skillThreshold) continue;
      const sample = group[0]!;
      const draft = skillDraft(sample.statement, `Seen in ${group.length} captured notes.`);
      const projectId = sample.scope === "project" ? sample.projectId : null;
      if (dbFindMemorySuggestionByName(draft.name, projectId)) continue;
      const suggestionId = randomUUID();
      suggestionIds.push(suggestionId);
      dbUpsertMemorySuggestion({
        id: suggestionId,
        projectId,
        name: draft.name,
        description: draft.description,
        body: draft.body,
        scope: sample.scope,
        availability: "poracode",
        why: `Repeated across ${group.length} notes.`,
        status: "suggested",
        createdAt: now,
        updatedAt: now,
      });
      suggested += 1;
    }
  }
  return {
    promoted,
    suggested,
    report: `Promoted ${promoted}. Suggested ${suggested} skill${suggested === 1 ? "" : "s"}.`,
    restore,
    createdIds,
    suggestionIds,
    candidateIds,
  };
}

export function userMemoryEntry(input: {
  id?: string;
  scope: MemoryEntry["scope"];
  projectId: string | null;
  category: MemoryEntry["category"];
  summary: string;
  body: string;
  polarity: MemoryEntry["polarity"];
  pinned: boolean;
  quote: string | null;
  now: string;
}): MemoryEntry {
  const current = input.id ? dbGetMemoryEntry(input.id) : undefined;
  return {
    id: current?.id ?? input.id ?? randomUUID(),
    scope: input.scope,
    projectId: input.scope === "project" ? input.projectId : null,
    category: input.category,
    summary: input.summary.trim(),
    body: input.body,
    confidence: 1,
    polarity: input.polarity,
    quote: input.quote,
    lockedByUser: true,
    pinned: input.pinned,
    archived: false,
    usageCount: current?.usageCount ?? 0,
    lastUsedAt: current?.lastUsedAt ?? null,
    createdAt: current?.createdAt ?? input.now,
    updatedAt: input.now,
    source: "user",
  };
}
