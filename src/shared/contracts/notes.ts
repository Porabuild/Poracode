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
});
export type ProjectNotes = z.infer<typeof projectNotesSchema>;
