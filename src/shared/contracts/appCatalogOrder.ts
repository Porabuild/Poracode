import { z } from "zod";
import { reorderProjectThreadsCommandSchema } from "./thread";
import {
  reorderProjectCommandSchema,
  setProjectDraftConfigCommandSchema,
} from "../remote/protocol/resources";
import { projectDraftConfigSchema } from "./config";
import type { RemoteThreadCommand } from "./thread";
import type { RemoteProjectCommand } from "../remote/protocol/resources";

export type ThreadCatalogReorderCommand = Extract<
  RemoteThreadCommand,
  { kind: "reorder" | "reorder-flat" }
>;
export type AppCatalogReorderCommand =
  | ThreadCatalogReorderCommand
  | Extract<RemoteProjectCommand, { kind: "reorder" }>;
export type AppCatalogEditCommand =
  | AppCatalogReorderCommand
  | Extract<RemoteProjectCommand, { kind: "set-draft-config" }>;

const operationKey = z.string().min(8).max(128);
export const publicProjectDraftConfigSchema = projectDraftConfigSchema
  .omit({ importedFrom: true })
  .strict();

export const setAppProjectDraftConfigInputSchema = setProjectDraftConfigCommandSchema
  .omit({ kind: true })
  .extend({ lastDraftConfig: publicProjectDraftConfigSchema.nullable(), operationKey })
  .strict();

export const reorderAppProjectInputSchema = reorderProjectCommandSchema
  .omit({ kind: true })
  .extend({ operationKey })
  .strict();

export const reorderAppThreadInputSchema = reorderProjectThreadsCommandSchema
  .omit({ kind: true })
  .partial({ threadIds: true })
  .extend({ scope: z.enum(["project", "catalog"]).default("project"), operationKey })
  .strict()
  .refine((input) => input.scope !== "catalog" || input.threadIds === undefined, {
    path: ["threadIds"],
    message: "Flat catalog order moves a single thread. Omit threadIds.",
  });

export const appCatalogEditResultSchema = z.strictObject({
  changed: z.boolean(),
  publicationWarning: z.string().optional(),
});
export type AppCatalogEditResult = z.infer<typeof appCatalogEditResultSchema>;
