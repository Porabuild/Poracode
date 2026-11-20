import { z } from "zod";
import {
  appExperimentEditSchema,
  appExperimentWorkflowSchema,
} from "@/shared/contracts/appExperiment";
import { experimentSchema } from "@/shared/contracts/experiment";
import { appControlToolDomain, defineAppControlTool } from "../defineTools";
import { catalogPageFields, pageCatalog } from "./catalogPage";
import { requireAppRuntime, requireProject, resolveLocation } from "./types";

const target = { experimentId: experimentSchema.shape.id };

const manageExperiment = defineAppControlTool({
  name: "manage_experiment",
  description:
    "Manage experiments on their owning desktop. list discovers experiments and get returns the revision, candidates and crown. Set includePrompt for the original prompt. candidate_stats compares a candidate worktree with its base commit. launch takes the composer prompt, base branch and candidate configurations. judge, merge_winner, create_pr, retry_cleanup and discard use the current revision and a fresh operationKey. Reuse the key for a retry and check current state before retrying a failed workflow. Use cancel_judge to stop judging. select_winner records a manual crown. Request user authorization before publishing, merging or discarding.",
  input: z.discriminatedUnion("action", [
    ...appExperimentEditSchema.options,
    ...appExperimentWorkflowSchema.options,
    z.strictObject({ action: z.literal("cancel_judge"), ...target }),
    z.strictObject({
      action: z.literal("list"),
      projectId: experimentSchema.shape.projectId.optional(),
      ...catalogPageFields,
      limit: catalogPageFields.limit.unwrap().default(30),
    }),
    z.strictObject({
      action: z.literal("get"),
      ...target,
      includePrompt: z.boolean().default(false),
    }),
    z.strictObject({
      action: z.literal("candidate_stats"),
      ...target,
      threadId: z.string().min(1),
    }),
  ]),
  run: async (args, ctx) => {
    if (!ctx.experiments) throw new Error("Experiments require the owning desktop host.");
    if (args.action === "rename" || args.action === "select_winner") {
      return ctx.experiments.edit(args);
    }
    if ("operationKey" in args) {
      if (!ctx.experiments.run)
        throw new Error("Experiment workflows require the owning desktop client.");
      return ctx.experiments.run(args, ctx.identity.threadId);
    }
    const { revision, experiments } = ctx.experiments.read();
    if (args.action === "list") {
      if (args.projectId) requireProject(ctx, args.projectId);
      const matches = Object.values(experiments)
        .filter(({ projectId }) => !args.projectId || projectId === args.projectId)
        .sort(
          (left, right) =>
            right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id),
        );
      const { rows, ...page } = pageCatalog(matches, args.offset, args.limit);
      return {
        revision,
        ...page,
        experiments: rows.map(({ id, projectId, title, status, candidates, winnerThreadId }) => ({
          id,
          projectId,
          title,
          status,
          candidateCount: candidates.length,
          winnerThreadId,
        })),
      };
    }
    const record = Object.hasOwn(experiments, args.experimentId)
      ? experiments[args.experimentId]
      : undefined;
    if (!record) throw new Error("Experiment not found.");
    if (args.action === "cancel_judge") {
      await requireAppRuntime(ctx).call("cancelJudgeExperiment", { experimentId: record.id });
      return { experimentId: record.id, cancellationRequested: true };
    }
    if (args.action === "candidate_stats") {
      const candidate = record.candidates.find(({ threadId }) => threadId === args.threadId);
      if (candidate?.worktreeState !== "owned" || !candidate.worktreePath) {
        throw new Error("This candidate has no owned worktree to compare.");
      }
      const projectLocation = await resolveLocation(ctx, record.projectId, candidate.worktreePath);
      const stats = await requireAppRuntime(ctx).call("getExperimentCandidateStats", {
        projectLocation,
        baseRef: record.baseCommit,
      });
      return {
        experimentId: record.id,
        threadId: candidate.threadId,
        baseCommit: record.baseCommit,
        stats,
      };
    }
    const { prompt, segments, candidates, ...summary } = record;
    return {
      revision,
      experiment: {
        ...summary,
        ...(args.includePrompt ? { prompt, segments } : {}),
        candidates: candidates.map(({ worktreeOwnerToken: _owner, ...candidate }) => candidate),
      },
    };
  },
});

export const experimentTools = appControlToolDomain(manageExperiment);
