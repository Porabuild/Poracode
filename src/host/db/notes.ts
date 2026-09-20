import type { ProjectNotes } from "@/shared/contracts";
import { getSqlite } from "./connection";
import { safeParse } from "./rowMappers";

// ── Per-project notes ───────────────────────────────────────────────

interface ProjectNotesRow {
  project_id: string;
  doc: string | null;
  todos: string | null;
  updated_at: string;
}

export function dbGetProjectNotes(projectId: string): ProjectNotes | null {
  const row = getSqlite()
    .prepare("SELECT project_id, doc, todos, updated_at FROM project_notes WHERE project_id = ?")
    .get(projectId) as ProjectNotesRow | undefined;
  if (!row) return null;
  const parsedTodos = row.todos ? safeParse(row.todos) : [];
  return {
    projectId: row.project_id,
    doc: row.doc ? (safeParse(row.doc) ?? null) : null,
    todos: Array.isArray(parsedTodos) ? (parsedTodos as ProjectNotes["todos"]) : [],
    updatedAt: row.updated_at,
  };
}

export function dbSetProjectNotes(notes: ProjectNotes): void {
  const doc = notes.doc == null ? null : JSON.stringify(notes.doc);
  const todos = JSON.stringify(notes.todos ?? []);
  getSqlite()
    .prepare(
      `INSERT INTO project_notes (project_id, doc, todos, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET
         doc = excluded.doc,
         todos = excluded.todos,
         updated_at = excluded.updated_at`,
    )
    .run(notes.projectId, doc, todos, notes.updatedAt);
}
