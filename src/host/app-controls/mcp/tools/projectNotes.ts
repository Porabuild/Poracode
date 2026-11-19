import { z } from "zod";
import { projectNotesGuardedWriteSchema } from "@/shared/contracts";
import { appControlToolDomain, defineAppControlTool } from "../defineTools";
import { requireProject } from "./types";

export const projectNotesTools = appControlToolDomain(
  defineAppControlTool({
    name: "get_project_notes",
    description:
      "Read the owning project's Notes document and to-do list. Keep its revision for update_project_notes.",
    input: z.strictObject({ projectId: z.string().min(1) }),
    run: ({ projectId }, ctx) => {
      requireProject(ctx, projectId);
      return { notes: ctx.getProjectNotes(projectId) };
    },
  }),
  defineAppControlTool({
    name: "update_project_notes",
    description:
      "Save the project's Notes document and ordered to-do list using the revision from get_project_notes. Pass baseRevision:null only when the project had no notes. Replacement contains the full TipTap document, or null for an empty document, and the full to-do list. Preserve unrelated notes and to-dos. A conflict returns the latest notes without applying the edit. Reconcile the user's changes before submitting again.",
    input: projectNotesGuardedWriteSchema,
    run: (input, ctx) => {
      requireProject(ctx, input.projectId);
      if (!ctx.compareAndSetProjectNotes) throw new Error("This host cannot update Project Notes.");
      return ctx.compareAndSetProjectNotes(input);
    },
  }),
);
