import { z } from "zod";
import {
  createProjectEntryPayloadSchema,
  deleteProjectEntryPayloadSchema,
  moveProjectEntryPayloadSchema,
  renameProjectEntryPayloadSchema,
  writeProjectFilePayloadSchema,
} from "@/shared/contracts";
import { appControlToolDomain, defineAppControlTool } from "../defineTools";
import { requireAppRuntime, resolveLocation } from "./types";

const target = {
  projectId: z.string().min(1),
  worktreePath: z.string().min(1).optional(),
};

export const projectFileActionTools = appControlToolDomain(
  defineAppControlTool({
    name: "manage_project_file",
    description:
      "Create, write, rename, move, or delete a file or directory within a Poracode project or registered worktree. Paths are relative to the selected checkout. Write requires baseModifiedAtMs from read_project_file so a concurrent editor change is protected. Delete requires the user's explicit authorization.",
    input: z.discriminatedUnion("action", [
      writeProjectFilePayloadSchema
        .omit({ projectLocation: true })
        .extend({ ...target, action: z.literal("write") })
        .strict(),
      createProjectEntryPayloadSchema
        .omit({ projectLocation: true })
        .extend({ ...target, action: z.literal("create") })
        .strict(),
      renameProjectEntryPayloadSchema
        .omit({ projectLocation: true })
        .extend({ ...target, action: z.literal("rename") })
        .strict(),
      moveProjectEntryPayloadSchema
        .omit({ projectLocation: true })
        .extend({ ...target, action: z.literal("move") })
        .strict(),
      deleteProjectEntryPayloadSchema
        .omit({ projectLocation: true })
        .extend({ ...target, action: z.literal("delete") })
        .strict(),
    ]),
    run: async (args, ctx) => {
      const { projectId, worktreePath, path } = args;
      const projectLocation = await resolveLocation(ctx, projectId, worktreePath);
      const owner = requireAppRuntime(ctx);
      const entry = { projectLocation, path };
      switch (args.action) {
        case "write":
          return owner.call("writeProjectFile", {
            ...entry,
            content: args.content,
            baseModifiedAtMs: args.baseModifiedAtMs,
          });
        case "create":
          await owner.call("createProjectEntry", { ...entry, type: args.type });
          return { projectId, path, type: args.type, created: true };
        case "rename":
          await owner.call("renameProjectEntry", { ...entry, nextName: args.nextName });
          return { projectId, path, nextName: args.nextName, renamed: true };
        case "move":
          await owner.call("moveProjectEntry", { ...entry, nextParentPath: args.nextParentPath });
          return { projectId, path, nextParentPath: args.nextParentPath, moved: true };
        case "delete":
          await owner.call("deleteProjectEntry", entry);
          return { projectId, path, deleted: true };
      }
    },
  }),
);
