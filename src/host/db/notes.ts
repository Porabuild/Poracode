import { createHash, randomUUID } from "node:crypto";
import {
  PROJECT_NOTES_CONFLICT,
  type ProjectNotes,
  type ProjectNotesGuardedWrite,
  type ProjectNotesSaveResult,
} from "@/shared/contracts";
import { getSqlite } from "./connection";
import { safeParse } from "./rowMappers";

export class ProjectNotesConflictError extends Error {
  readonly code = PROJECT_NOTES_CONFLICT;

  constructor() {
    super("Project Notes changed. Reload the saved notes before editing again.");
    this.name = "ProjectNotesConflictError";
  }
}

interface ProjectNotesRow {
  project_id: string;
  doc: string | null;
  todos: string | null;
  updated_at: string;
  revision: string | null;
}

function readRow(projectId: string): ProjectNotesRow | undefined {
  return getSqlite()
    .prepare(
      "SELECT project_id, doc, todos, updated_at, revision FROM project_notes WHERE project_id = ?",
    )
    .get(projectId) as ProjectNotesRow | undefined;
}

/** Include the bytes so replacing or merging a prior row also changes its revision. */
function rowRevision(row: ProjectNotesRow): string {
  return createHash("sha256")
    .update(JSON.stringify([row.revision, row.updated_at, row.doc, row.todos]))
    .digest("hex");
}

export function dbGetProjectNotes(projectId: string): ProjectNotes | null {
  const row = readRow(projectId);
  if (!row) return null;
  const parsedTodos = row.todos ? safeParse(row.todos) : [];
  return {
    projectId: row.project_id,
    doc: row.doc ? (safeParse(row.doc) ?? null) : null,
    todos: Array.isArray(parsedTodos) ? (parsedTodos as ProjectNotes["todos"]) : [],
    updatedAt: row.updated_at,
    revision: rowRevision(row),
  };
}

function writeRow(notes: ProjectNotes): void {
  getSqlite()
    .prepare(
      `INSERT INTO project_notes (project_id, doc, todos, updated_at, revision)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET
         doc = excluded.doc, todos = excluded.todos,
         updated_at = excluded.updated_at, revision = excluded.revision`,
    )
    .run(
      notes.projectId,
      notes.doc == null ? null : JSON.stringify(notes.doc),
      JSON.stringify(notes.todos ?? []),
      notes.updatedAt,
      notes.revision ?? null,
    );
}

export function dbSetProjectNotes(notes: ProjectNotes): void {
  getSqlite()
    .transaction(() => {
      const previous = readRow(notes.projectId);
      if (previous?.revision != null) {
        // An older clean flush may still arrive. Acknowledge identical content
        // without changing the timestamp, revision or protected state.
        if (
          previous.doc === (notes.doc == null ? null : JSON.stringify(notes.doc)) &&
          previous.todos === JSON.stringify(notes.todos ?? [])
        )
          return;
        throw new ProjectNotesConflictError();
      }
      writeRow({ ...notes, revision: undefined });
    })
    .immediate();
}

export function dbCompareAndSetProjectNotes(
  input: ProjectNotesGuardedWrite,
): ProjectNotesSaveResult {
  return getSqlite()
    .transaction((): ProjectNotesSaveResult => {
      const exists = getSqlite()
        .prepare("SELECT 1 FROM projects WHERE id = ?")
        .get(input.projectId);
      if (!exists) throw new Error("Project not found.");
      const previous = readRow(input.projectId);
      if ((previous ? rowRevision(previous) : null) !== input.baseRevision) {
        return { status: "conflict", notes: dbGetProjectNotes(input.projectId) };
      }
      const saved = {
        projectId: input.projectId,
        ...input.replacement,
        updatedAt: new Date().toISOString(),
        revision: randomUUID(),
      };
      writeRow(saved);
      return { status: "saved", notes: dbGetProjectNotes(input.projectId)! };
    })
    .immediate();
}
