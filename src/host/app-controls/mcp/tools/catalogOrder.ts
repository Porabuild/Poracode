import {
  reorderAppProjectInputSchema,
  reorderAppThreadInputSchema,
  setAppProjectDraftConfigInputSchema,
} from "@/shared/contracts/appCatalogOrder";
import type { AppControlsToolContext } from "./types";
import { appControlToolDomain, defineAppControlTool } from "../defineTools";

function requireCatalogEditor(ctx: AppControlsToolContext) {
  if (!ctx.editCatalog) throw new Error("The owning host is not ready to edit its catalog.");
  return ctx.editCatalog;
}

export const catalogEditTools = appControlToolDomain(
  defineAppControlTool({
    name: "reorder_project",
    description:
      "Move a project before or after another project in this host's manual sidebar order. Both project IDs must belong to this host. Use a unique operationKey per intended move and reuse the same key if the response is lost.",
    input: reorderAppProjectInputSchema,
    run: ({ operationKey, ...input }, ctx) =>
      requireCatalogEditor(ctx)({ kind: "reorder", ...input }, operationKey),
  }),
  defineAppControlTool({
    name: "reorder_thread",
    description:
      "Move a thread before or after another thread in this host's manual sidebar order. Pass the source projectId. Default scope:project keeps the move within that project. To drag a group or worktree block, provide its threadIds with threadId as the first entry; the host preserves their existing order. Scope:catalog moves a single thread across the flat list without changing its project. Use a unique operationKey for each intended move and reuse it after a lost response.",
    input: reorderAppThreadInputSchema,
    run: ({ operationKey, scope, threadIds, ...input }, ctx) =>
      requireCatalogEditor(ctx)(
        scope === "catalog"
          ? { kind: "reorder-flat", ...input }
          : { kind: "reorder", ...input, threadIds: threadIds ?? [input.threadId] },
        operationKey,
      ),
  }),
  defineAppControlTool({
    name: "set_project_draft_config",
    description:
      "Save or clear the project’s remembered New Thread composer choices. Read lastDraftConfig from get_project first. Pass the full replacement in lastDraftConfig, or null to clear it. This updates only the saved draft. Choose a unique operationKey for each edit and reuse it if the reply is lost.",
    input: setAppProjectDraftConfigInputSchema,
    run: ({ operationKey, ...input }, ctx) =>
      requireCatalogEditor(ctx)({ kind: "set-draft-config", ...input }, operationKey),
  }),
);
