import { z } from "zod";
import { handleMemoryCommand, memorySearch } from "@/host/memory/runtime";
import { runMemoryCatalogCommand } from "@/host/memory/catalog";
import {
  dbGetMemorySuggestion,
  dbGetMemoryThreadState,
  dbLatestMemoryDream,
} from "@/host/db/memoryStore";
import { readMemorySettings } from "@/host/memory/settingsReader";
import {
  memoryDreamCommandSchema,
  memorySkillSuggestionSchema,
  memoryStatusSchema,
  memorySuggestionCommandSchema,
  memorySuggestionsCommandSchema,
  memoryThreadModeCommandSchema,
  memoryUndoCommandSchema,
  remoteMemoryCatalogCommandSchema,
} from "@/shared/memory";
import { appControlToolDomain, defineAppControlTool } from "../defineTools";
import { catalogPageFields, pageCatalog } from "./catalogPage";
import { requireThread } from "./types";

const searchMemoryTool = defineAppControlTool({
  name: "search_memory",
  description:
    "Search global memory and the calling thread's project memories across providers. Pass a short query. Returns at most eight matching summaries.",
  input: z.strictObject({
    query: z.string().trim().min(1),
    projectId: z.string().min(1).optional(),
  }),
  run: async ({ query, projectId }, ctx) => {
    const threadId = ctx.identity.threadId;
    const thread = threadId ? ctx.getThread(threadId) : null;
    if (projectId && projectId !== thread?.projectId) {
      throw new Error("Memory search is limited to the calling thread's project.");
    }
    if (thread) {
      if (!ctx.deviceWorkspace)
        throw new Error("Memory search could not verify the calling thread.");
      ctx.deviceWorkspace.authorizeAgent(thread.id, ctx.identity.deviceProof);
      if (dbGetMemoryThreadState(thread.id).mode === "incognito") return { entries: [] };
    }
    return {
      entries: memorySearch(query, thread?.projectId).map((entry) => ({
        id: entry.id,
        scope: entry.scope,
        category: entry.category,
        summary: entry.summary,
        confidence: entry.confidence,
      })),
    };
  },
});

const [status, list, save, remove] = remoteMemoryCatalogCommandSchema.options;
const memoryPageFields = {
  ...catalogPageFields,
  limit: catalogPageFields.limit.unwrap().default(30),
  includeBody: z.boolean().default(false),
};
const manageMemoryTool = defineAppControlTool({
  name: "manage_memory",
  description:
    "Read or manage Poracode memory for a verified calling thread. status shows settings, thread mode and the latest Dream run ID. list and suggestions return global and current-project entries (30 per page, nextOffset continues; includeBody adds full text). save creates or edits an entry. delete uses the exact saved ID. thread-mode applies to the caller. dream consolidates memories across this host; undo takes the latest runId. suggestion approves or dismisses an exact pending ID. sync runs the desktop's Sync now across online paired hosts. Make changes only at the user's request and have them review a skill before approval.",
  input: z.discriminatedUnion("action", [
    status,
    list.extend(memoryPageFields),
    save,
    remove,
    memoryThreadModeCommandSchema.partial({ threadId: true }).strict(),
    memoryDreamCommandSchema.strict(),
    memoryUndoCommandSchema.strict(),
    memorySuggestionsCommandSchema.extend(memoryPageFields).strict(),
    memorySuggestionCommandSchema.strict(),
    z.strictObject({ action: z.literal("sync") }),
  ]),
  run: async (args, ctx) => {
    if (!ctx.identity.threadId || !ctx.deviceWorkspace) {
      throw new Error("Memory management requires a verified calling thread.");
    }
    const thread = requireThread(ctx, ctx.identity.threadId);
    ctx.deviceWorkspace.authorizeAgent(thread.id, ctx.identity.deviceProof);
    if (dbGetMemoryThreadState(thread.id).mode === "incognito") {
      throw new Error("Memory management is unavailable in incognito threads.");
    }
    const requestedProjectId =
      args.action === "save"
        ? args.entry.projectId
        : "projectId" in args
          ? args.projectId
          : undefined;
    const { projectId } = thread;
    if (requestedProjectId && requestedProjectId !== projectId) {
      throw new Error("Memory management is limited to the calling thread's project.");
    }
    switch (args.action) {
      case "status":
        return {
          action: args.action,
          result: memoryStatusSchema.parse(
            await handleMemoryCommand({ action: args.action, threadId: thread.id, projectId }),
          ),
        };
      case "list": {
        const result = await runMemoryCatalogCommand({ action: "list", projectId });
        if (result.action !== "list") throw new Error("Expected a memory list.");
        const { rows, ...page } = pageCatalog(result.result, args.offset, args.limit);
        return {
          action: args.action,
          ...page,
          entries: args.includeBody
            ? rows
            : rows.map(
                ({
                  id,
                  projectId: entryProjectId,
                  scope,
                  category,
                  summary,
                  polarity,
                  pinned,
                }) => ({
                  id,
                  projectId: entryProjectId,
                  scope,
                  category,
                  summary,
                  polarity,
                  pinned,
                }),
              ),
        };
      }
      case "save":
        return runMemoryCatalogCommand({
          action: args.action,
          entry: args.entry.scope === "project" ? { ...args.entry, projectId } : args.entry,
        });
      case "delete":
        return runMemoryCatalogCommand({ action: args.action, id: args.id, projectId });
      case "thread-mode": {
        if (args.threadId && args.threadId !== thread.id) {
          throw new Error("Memory mode can only be changed for the calling thread.");
        }
        const result = await handleMemoryCommand({
          action: args.action,
          threadId: thread.id,
          mode: args.mode,
        });
        return { action: args.action, result };
      }
      case "dream":
        if (!readMemorySettings().enabled) throw new Error("Poracode memory is disabled.");
        return { action: args.action, result: await handleMemoryCommand(args) };
      case "undo":
        if (args.runId !== dbLatestMemoryDream().id) {
          throw new Error("Pass the latest Dream run ID from manage_memory status.");
        }
        return { action: args.action, result: await handleMemoryCommand(args) };
      case "sync": {
        if (!ctx.syncMemory) throw new Error("Memory sync requires the owning desktop client.");
        const { enabled, syncEnabled } = readMemorySettings();
        if (!enabled || !syncEnabled) throw new Error("Cross-host memory sync is disabled.");
        return { action: args.action, result: await ctx.syncMemory() };
      }
      case "suggestions": {
        const suggestions = z
          .array(memorySkillSuggestionSchema)
          .parse(await handleMemoryCommand({ action: args.action, projectId }));
        const { rows, ...page } = pageCatalog(suggestions, args.offset, args.limit);
        return {
          action: args.action,
          ...page,
          entries: args.includeBody ? rows : rows.map(({ body: _body, ...summary }) => summary),
        };
      }
      case "suggestion": {
        const suggestion = dbGetMemorySuggestion(args.id);
        if (
          !suggestion ||
          suggestion.status !== "suggested" ||
          (suggestion.projectId && suggestion.projectId !== projectId)
        ) {
          throw new Error("Pending skill suggestion not found in this memory scope.");
        }
        const scope = args.scope ?? suggestion.scope;
        const result = await handleMemoryCommand({
          ...args,
          scope,
          projectId: scope === "project" ? projectId : null,
        });
        return { action: args.action, result };
      }
    }
  },
});

export const memoryTools = appControlToolDomain(searchMemoryTool, manageMemoryTool);
