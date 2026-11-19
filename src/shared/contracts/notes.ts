import { z } from "zod";

/** A single structured to-do item in a project's notes panel. */
export const notesTodoItemSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  done: z.boolean(),
  createdAt: z.string().min(1),
});
export type NotesTodoItem = z.infer<typeof notesTodoItemSchema>;

/**
 * Per-project notes payload. `doc` is the TipTap (ProseMirror) JSON document for
 * the free-form notes editor, stored opaquely; `null` when the editor is empty.
 * `todos` is the structured to-do list rendered beneath the editor.
 */
export const projectNotesSchema = z.object({
  projectId: z.string().min(1),
  doc: z.unknown().nullable(),
  todos: z.array(notesTodoItemSchema),
  updatedAt: z.string().min(1),
  /** Opaque revision of the stored document and to-do list. */
  revision: z.string().min(1).optional(),
});
export type ProjectNotes = z.infer<typeof projectNotesSchema>;

export const projectNotesLegacyWriteSchema = projectNotesSchema.omit({ revision: true });
export const projectNotesReplacementSchema = projectNotesSchema
  .pick({ doc: true, todos: true })
  .strict();

export const projectNotesGuardedWriteSchema = z.strictObject({
  projectId: projectNotesSchema.shape.projectId,
  /** Null means the project had no saved notes when the editor loaded. */
  baseRevision: z.string().min(1).max(128).nullable(),
  replacement: projectNotesReplacementSchema,
});
export type ProjectNotesGuardedWrite = z.infer<typeof projectNotesGuardedWriteSchema>;
export const projectNotesWriteSchema = z.union([
  projectNotesLegacyWriteSchema,
  projectNotesGuardedWriteSchema,
]);
export type ProjectNotesWrite = z.infer<typeof projectNotesWriteSchema>;

export const PROJECT_NOTES_CONFLICT = "project_notes_conflict";

export const projectNotesSaveResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("saved"), notes: projectNotesSchema }),
  z.object({ status: z.literal("conflict"), notes: projectNotesSchema.nullable() }),
]);
export type ProjectNotesSaveResult = z.infer<typeof projectNotesSaveResultSchema>;
