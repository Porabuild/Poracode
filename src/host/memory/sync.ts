import { dbGetProjects } from "@/host/db/projectsThreads";
import {
  dbDeleteMemoryEntry,
  dbGetMemoryEntry,
  dbListAllMemoryEntriesForSync,
  dbListMemoryTombstones,
  dbUpsertMemoryEntry,
  dbUpsertMemoryTombstone,
} from "@/host/db/memoryStore";
import type { MemoryEntry, MemorySyncState, MemoryTombstone } from "@/shared/memory";
import { statementKey } from "./logic";
import { readMemoryRepoKey } from "./repoKeyReader";

function resolveRepoKey(
  projectId: string | null | undefined,
  projectRepoKeys?: Readonly<Record<string, string>>,
): string | null {
  if (!projectId) return null;
  const provided = projectRepoKeys?.[projectId]?.trim();
  if (provided) return provided;
  return readMemoryRepoKey(projectId);
}

/**
 * Snapshot local memories that are safe to sync across environments: global
 * entries plus project entries bound to a verified repository key.
 */
export function exportMemorySyncState(
  projectRepoKeys?: Readonly<Record<string, string>>,
): MemorySyncState {
  const entries: MemoryEntry[] = [];
  for (const entry of dbListAllMemoryEntriesForSync()) {
    if (entry.scope === "global") {
      entries.push({ ...entry, projectId: null, repoKey: null });
      continue;
    }
    const repoKey = entry.repoKey ?? resolveRepoKey(entry.projectId, projectRepoKeys);
    if (!repoKey) continue;
    if (entry.repoKey !== repoKey) {
      dbUpsertMemoryEntry({ ...entry, repoKey });
    }
    entries.push({ ...entry, repoKey });
  }
  const tombstones: MemoryTombstone[] = [];
  for (const tombstone of dbListMemoryTombstones()) {
    if (tombstone.scope === "global") {
      tombstones.push({ ...tombstone, projectId: null, repoKey: null });
      continue;
    }
    const repoKey = tombstone.repoKey ?? resolveRepoKey(tombstone.projectId, projectRepoKeys);
    if (!repoKey) continue;
    tombstones.push({ ...tombstone, repoKey });
  }
  return { entries, tombstones };
}

function incomingWins(incoming: MemoryEntry, existing: MemoryEntry): boolean {
  if (existing.lockedByUser && !incoming.lockedByUser && existing.updatedAt >= incoming.updatedAt) {
    return false;
  }
  if (incoming.updatedAt !== existing.updatedAt) {
    return incoming.updatedAt > existing.updatedAt;
  }
  return incoming.lockedByUser && !existing.lockedByUser;
}

export function mergeMemorySyncState(
  incoming: MemorySyncState,
  projectRepoKeys?: Readonly<Record<string, string>>,
): { changed: boolean; state: MemorySyncState } {
  let changed = false;
  const localProjectByRepoKey = new Map<string, string>();
  for (const project of dbGetProjects()) {
    const repoKey = resolveRepoKey(project.id, projectRepoKeys);
    if (repoKey && !localProjectByRepoKey.has(repoKey)) {
      localProjectByRepoKey.set(repoKey, project.id);
    }
  }

  for (const tombstone of incoming.tombstones) {
    if (tombstone.scope === "project" && !tombstone.repoKey) continue;
    const local = dbGetMemoryEntry(tombstone.id);
    if (local) {
      if (tombstone.deletedAt >= local.updatedAt) {
        dbDeleteMemoryEntry(tombstone.id, tombstone.deletedAt, true);
        changed = true;
      }
      continue;
    }
    dbUpsertMemoryTombstone(tombstone);
  }

  const localTombstones = new Map(dbListMemoryTombstones().map((item) => [item.id, item]));
  const localEntries = dbListAllMemoryEntriesForSync();
  const bySemanticKey = new Map<string, MemoryEntry>();
  for (const local of localEntries) {
    const repoKey =
      local.scope === "project"
        ? (local.repoKey ?? resolveRepoKey(local.projectId, projectRepoKeys))
        : null;
    if (local.scope === "project" && !repoKey) continue;
    bySemanticKey.set(`${local.scope}\0${repoKey ?? ""}\0${statementKey(local.summary)}`, local);
  }

  for (const entry of incoming.entries) {
    if (entry.scope === "project" && !entry.repoKey) continue;
    const tombstone = localTombstones.get(entry.id);
    if (tombstone && tombstone.deletedAt >= entry.updatedAt) continue;

    const semanticKey = `${entry.scope}\0${entry.scope === "project" ? (entry.repoKey ?? "") : ""}\0${statementKey(entry.summary)}`;
    const existing = dbGetMemoryEntry(entry.id) ?? bySemanticKey.get(semanticKey);
    const projectId =
      entry.scope === "project" && entry.repoKey
        ? (localProjectByRepoKey.get(entry.repoKey) ?? existing?.projectId ?? null)
        : null;
    const normalized: MemoryEntry = {
      ...entry,
      projectId,
      repoKey: entry.scope === "project" ? (entry.repoKey ?? null) : null,
    };

    if (!existing) {
      dbUpsertMemoryEntry(normalized);
      bySemanticKey.set(semanticKey, normalized);
      changed = true;
      continue;
    }

    if (incomingWins(normalized, existing)) {
      const merged = { ...normalized, id: existing.id };
      dbUpsertMemoryEntry(merged);
      bySemanticKey.set(semanticKey, merged);
      changed = true;
    }
  }

  return { changed, state: exportMemorySyncState(projectRepoKeys) };
}
