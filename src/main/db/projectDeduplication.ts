import type Database from "better-sqlite3";
import type { AppView, NotesTodoItem } from "@/shared/contracts";
import { dedupeProjects } from "@/shared/projectIdentity";
import { remapProjectGroupLayouts, remapProjectView } from "@/shared/projectReferences";
import { rowToProject, safeParse, type ProjectRow } from "./rowMappers";
import { rehomeProjectWatches } from "./projectWatchRepair";

type SqliteDatabase = InstanceType<typeof Database>;

/** Upgrade old profiles, including headless hosts, before any snapshot is loaded. */
export function repairDuplicateProjects(sqlite: SqliteDatabase): void {
  const rows = sqlite
    .prepare("SELECT * FROM projects ORDER BY sort_order ASC, rowid ASC")
    .all() as ProjectRow[];
  const { duplicateIds } = dedupeProjects(rows.map(rowToProject), {
    caseInsensitivePosix: process.platform === "darwin",
  });
  rehomeProjectReferences(sqlite, duplicateIds);
  const deleteProject = sqlite.prepare("DELETE FROM projects WHERE id = ?");
  for (const duplicateId of duplicateIds.keys()) deleteProject.run(duplicateId);
}

/** Move dependent data before deleting a duplicate project can cascade its threads. */
export function rehomeProjectReferences(
  sqlite: SqliteDatabase,
  duplicateIds: ReadonlyMap<string, string>,
): Set<string> {
  const rehomedThreadIds = new Set<string>();
  if (duplicateIds.size === 0) return rehomedThreadIds;

  const selectThreads = sqlite.prepare("SELECT id FROM threads WHERE project_id = ?");
  const rehomeThreads = sqlite.prepare("UPDATE threads SET project_id = ? WHERE project_id = ?");
  const rehomeSchedules = sqlite.prepare(
    "UPDATE scheduled_tasks SET project_id = ? WHERE project_id = ?",
  );
  const selectNotes = sqlite.prepare(
    "SELECT doc, todos, updated_at FROM project_notes WHERE project_id = ?",
  );
  const saveNotes = sqlite.prepare(
    "INSERT INTO project_notes (project_id, doc, todos, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(project_id) DO UPDATE SET doc = excluded.doc, todos = excluded.todos, updated_at = excluded.updated_at",
  );
  const deleteNotes = sqlite.prepare("DELETE FROM project_notes WHERE project_id = ?");
  for (const [duplicateId, canonicalId] of duplicateIds) {
    const threads = selectThreads.all(duplicateId) as { id: string }[];
    for (const { id } of threads) rehomedThreadIds.add(id);
    rehomeThreads.run(canonicalId, duplicateId);
    rehomeSchedules.run(canonicalId, duplicateId);
    rehomeProjectWatches(sqlite, duplicateId, canonicalId);
    const duplicateNotes = selectNotes.get(duplicateId) as StoredNotes | undefined;
    if (duplicateNotes) {
      const canonicalNotes = selectNotes.get(canonicalId) as StoredNotes | undefined;
      const notes = canonicalNotes
        ? mergeNotes(canonicalNotes, duplicateNotes, duplicateId)
        : duplicateNotes;
      saveNotes.run(canonicalId, notes.doc, notes.todos, notes.updated_at);
    }
    deleteNotes.run(duplicateId);
  }

  repairState(sqlite, "view", (value) => remapProjectView(value as AppView, duplicateIds));
  repairState(sqlite, "groupLayouts", (value) =>
    remapProjectGroupLayouts(value as Parameters<typeof remapProjectGroupLayouts>[0], duplicateIds),
  );
  repairState(sqlite, "poracode-experiments-v1", (value) => {
    const persisted = value as {
      state?: { experiments?: Record<string, { projectId?: string }> };
    };
    const experiments = persisted.state?.experiments;
    if (!experiments) return value;
    for (const experiment of Object.values(experiments)) {
      const canonicalId = experiment.projectId ? duplicateIds.get(experiment.projectId) : undefined;
      if (canonicalId) experiment.projectId = canonicalId;
    }
    return persisted;
  });
  return rehomedThreadIds;
}

interface StoredNotes {
  doc: string | null;
  todos: string;
  updated_at: string;
}

function mergeNotes(
  canonical: StoredNotes,
  duplicate: StoredNotes,
  duplicateId: string,
): StoredNotes {
  const parseTodos = (raw: string): NotesTodoItem[] => {
    const parsed = safeParse(raw);
    return Array.isArray(parsed) ? (parsed as NotesTodoItem[]) : [];
  };
  const todos = parseTodos(canonical.todos);
  const byId = new Map(todos.map((todo) => [todo.id, todo]));
  for (const todo of parseTodos(duplicate.todos)) {
    const prior = byId.get(todo.id);
    if (prior && JSON.stringify(prior) === JSON.stringify(todo)) continue;
    todos.push(prior ? { ...todo, id: `${duplicateId}:${todo.id}` } : todo);
  }
  return {
    doc: mergeNoteDocuments(canonical.doc, duplicate.doc),
    todos: JSON.stringify(todos),
    updated_at:
      canonical.updated_at > duplicate.updated_at ? canonical.updated_at : duplicate.updated_at,
  };
}

function mergeNoteDocuments(canonical: string | null, duplicate: string | null): string | null {
  if (!canonical) return duplicate;
  if (!duplicate || canonical === duplicate) return canonical;
  const content = (raw: string): unknown[] => {
    const parsed = safeParse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      "content" in parsed &&
      Array.isArray(parsed.content)
    ) {
      return parsed.content;
    }
    // Preserve opaque legacy document data as text instead of discarding it.
    return [{ type: "paragraph", content: [{ type: "text", text: raw }] }];
  };
  return JSON.stringify({ type: "doc", content: [...content(canonical), ...content(duplicate)] });
}

export function remapProjectViewJson(
  viewJson: string,
  duplicateIds: ReadonlyMap<string, string>,
): string {
  if (duplicateIds.size === 0) return viewJson;
  try {
    return JSON.stringify(remapProjectView(JSON.parse(viewJson) as AppView, duplicateIds));
  } catch {
    // Existing readers already ignore malformed view state.
    return viewJson;
  }
}

function repairState(
  sqlite: SqliteDatabase,
  key: string,
  repair: (value: unknown) => unknown,
): void {
  const row = sqlite.prepare("SELECT value FROM app_state WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  if (!row) return;
  try {
    const next = JSON.stringify(repair(JSON.parse(row.value)));
    if (next !== row.value) {
      sqlite.prepare("UPDATE app_state SET value = ? WHERE key = ?").run(next, key);
    }
  } catch {
    // Leave corrupt state to its existing reader's fallback.
  }
}
