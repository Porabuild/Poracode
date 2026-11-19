import { z } from "zod";
import {
  forgePrWatchInputSchema,
  prWatchAgentSyncSchema,
  prWatchInputSchema,
  prWatchKeySchema,
} from "@/shared/contracts";
import { appControlToolDomain, defineAppControlTool } from "../defineTools";
import { requireProject, resolveLocation } from "./types";

const key = prWatchKeySchema;
const input = prWatchInputSchema
  .extend({
    action: z.literal("save"),
    reviewScope: forgePrWatchInputSchema.shape.reviewScope.optional(),
  })
  .strict();

export const prWatchTools = appControlToolDomain(
  defineAppControlTool({
    name: "pr_watch",
    description:
      "List, read, check, configure, or delete PR Watch entries and refresh their helper-agent configuration. Use the repository and account from review_repository to set reviewScope for a new watch. Enabling automated fixes or merging requires the user's explicit authorization.",
    input: z.discriminatedUnion("action", [
      z.strictObject({ action: z.literal("list"), projectId: key.shape.projectId.optional() }),
      key.extend({ action: z.literal("get") }).strict(),
      key.extend({ action: z.literal("check") }).strict(),
      input,
      key.extend({ action: z.literal("delete") }).strict(),
      prWatchAgentSyncSchema.extend({ action: z.literal("sync_agent") }).strict(),
    ]),
    run: async (args, ctx) => {
      const owner = ctx.prWatches;
      if (!owner) throw new Error("This host cannot manage PR watches.");
      if (args.projectId !== undefined) requireProject(ctx, args.projectId);
      switch (args.action) {
        case "list":
          return {
            watches: owner
              .list()
              .filter(
                (watch) => args.projectId === undefined || watch.projectId === args.projectId,
              ),
          };
        case "get":
          return { watch: owner.get(args.projectId, args.prNumber) };
        case "check":
          if (!owner.get(args.projectId, args.prNumber)) throw new Error("PR watch not found.");
          owner.requestCheck(args.projectId, args.prNumber);
          break;
        case "save": {
          const { action: _action, reviewScope, ...watch } = args;
          if (watch.worktreePath) await resolveLocation(ctx, watch.projectId, watch.worktreePath);
          return {
            watch: reviewScope
              ? await owner.upsertScoped({ ...watch, reviewScope })
              : owner.upsert(watch),
          };
        }
        case "delete":
          owner.delete(args.projectId, args.prNumber);
          break;
        case "sync_agent": {
          const { action: _action, ...agent } = args;
          owner.syncAgent(agent);
          break;
        }
      }
      return { action: args.action, ok: true };
    },
  }),
);
