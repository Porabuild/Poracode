import { eq } from "drizzle-orm";
import type { ProjectNotes } from "@/shared/contracts";
import * as schema from "../db.schema";
import { getDb } from "./connection";
import { safeParse } from "./rowMappers";

// ── Per-project notes ───────────────────────────────────────────────

export function dbGetProjectNotes(projectId: string): ProjectNotes | null {
  const db = getDb();
  const row = db
    .select()
    .from(schema.projectNotes)
    .where(eq(schema.projectNotes.projectId, projectId))
    .get();
  if (!row) return null;
  const parsedTodos = row.todos ? safeParse(row.todos) : [];
  return {
    projectId: row.projectId,
    doc: row.doc ? (safeParse(row.doc) ?? null) : null,
    todos: Array.isArray(parsedTodos) ? (parsedTodos as ProjectNotes["todos"]) : [],
    updatedAt: row.updatedAt,
  };
}

export function dbSetProjectNotes(notes: ProjectNotes): void {
  const db = getDb();
  const doc = notes.doc == null ? null : JSON.stringify(notes.doc);
  const todos = JSON.stringify(notes.todos ?? []);
  db.insert(schema.projectNotes)
    .values({ projectId: notes.projectId, doc, todos, updatedAt: notes.updatedAt })
    .onConflictDoUpdate({
      target: schema.projectNotes.projectId,
      set: { doc, todos, updatedAt: notes.updatedAt },
    })
    .run();
}
