import { z } from "zod";
import {
  gitAbortMergePayloadSchema,
  gitCommitPayloadSchema,
  gitFetchPayloadSchema,
  gitMergeToSourcePayloadSchema,
  gitPullFromSourcePayloadSchema,
  gitPullPayloadSchema,
  gitPushPayloadSchema,
} from "@/shared/contracts";
import { resolveProjectLocation } from "@/shared/worktree";
import { defineAppControlTool } from "../defineTools";
import { requireProject, resolveLocation, resolveWorktreeInfo } from "./types";

const projectTarget = z.strictObject({
  projectId: z.string().min(1),
  worktreePath: z.string().min(1).optional(),
});
const remoteTarget = projectTarget.extend({ remote: z.string().min(1).regex(/^[^-]/u).optional() });
const pushOptions = {
  branch: z.string().min(1).optional(),
  setUpstream: gitPushPayloadSchema.shape.setUpstream.removeDefault(),
};
// Older callers can reuse these push fields on fetch or pull. Only push uses them.
const legacyRemoteTarget = remoteTarget.extend(pushOptions);

export const gitCommitTool = defineAppControlTool({
  name: "git_commit",
  description:
    "Create a Git commit with the supplied message. Set addAll:true to stage all changes first. When committing a resolved pull-from-source merge, pass its stashCommit as reapplyStashCommit to restore local edits after the commit. Explain the commit to the user before applying it.",
  input: gitCommitPayloadSchema
    .omit({ projectLocation: true })
    .extend(projectTarget.shape)
    .strict(),
  run: async ({ projectId, worktreePath, message, addAll, reapplyStashCommit }, ctx) => {
    const projectLocation = await resolveLocation(ctx, projectId, worktreePath);
    const result = await ctx.supervisor.gitCommit({
      projectLocation,
      message,
      addAll,
      ...(reapplyStashCommit === undefined ? {} : { reapplyStashCommit }),
    });
    return { projectId, committed: true, ...result };
  },
});

export const gitSyncTool = defineAppControlTool({
  name: "git_sync",
  description:
    "Exchange commits in a project or registered worktree. Use fetch (with optional prune), pull or pull_rebase (with optional preserveLocalChanges), or push (with optional branch and setUpstream). The app's sync and sync_rebase actions fetch, pull when behind, and push when ahead. The result reports which steps ran. The default remote is origin. Push and both sync actions may publish commits. An explicit user request to push or publish the named work authorizes that publication after its normal checks. Obtain authorization before publishing other work.",
  input: z.discriminatedUnion("action", [
    legacyRemoteTarget.extend({
      action: z.literal("fetch"),
      prune: gitFetchPayloadSchema.shape.prune,
    }),
    legacyRemoteTarget.extend({
      action: z.enum(["pull", "pull_rebase"]),
      preserveLocalChanges: gitPullPayloadSchema.shape.preserveLocalChanges,
    }),
    legacyRemoteTarget.extend({ action: z.literal("push") }),
    remoteTarget.extend({ action: z.enum(["sync", "sync_rebase"]) }),
  ]),
  run: async (input, ctx) => {
    const { projectId, worktreePath, action, remote } = input;
    const projectLocation = await resolveLocation(ctx, projectId, worktreePath);
    const target = { projectLocation, ...(remote === undefined ? {} : { remote }) };
    const result = { projectId, action, done: true };
    switch (action) {
      case "fetch":
        await ctx.supervisor.gitFetch({
          projectLocation,
          remote: remote ?? "origin",
          prune: input.prune,
        });
        break;
      case "pull":
        await ctx.supervisor.gitPull({
          ...target,
          preserveLocalChanges: input.preserveLocalChanges,
        });
        break;
      case "pull_rebase":
        await ctx.supervisor.gitPullRebase({
          ...target,
          preserveLocalChanges: input.preserveLocalChanges,
        });
        break;
      case "push":
        await ctx.supervisor.gitPush({
          ...target,
          ...(input.branch === undefined ? {} : { branch: input.branch }),
          ...(input.setUpstream === undefined ? {} : { setUpstream: input.setUpstream }),
        });
        break;
      case "sync":
        return { ...result, ...(await ctx.supervisor.gitSync(target)) };
      case "sync_rebase":
        return { ...result, ...(await ctx.supervisor.gitSyncRebase(target)) };
    }
    return result;
  },
});

const worktreeTarget = projectTarget.required({ worktreePath: true });
const sourceBranchSchema = gitMergeToSourcePayloadSchema.shape.sourceBranch
  .regex(/^[^-]/u)
  .optional();
const expectedWorktreeCommit = gitMergeToSourcePayloadSchema.shape.expectedWorktreeCommit;
const mergeRecoveryTarget = worktreeTarget.extend({
  reapplyStashCommit: gitAbortMergePayloadSchema.shape.reapplyStashCommit,
});

export const mergeWorktreeTool = defineAppControlTool({
  name: "merge_worktree",
  description:
    "Merge a registered worktree into its source branch, pull_from_source into it, or abort or finish an in-progress merge. The source branch is inferred unless you pass sourceBranch. Merge can require expectedWorktreeCommit to match. For pull_from_source, choose preserveLocalChanges to stash and restore local edits. When a pull returns stashCommit after a conflict, pass it as reapplyStashCommit when you finish or abort the merge. Explain the Git changes to the user before applying them.",
  input: z.discriminatedUnion("action", [
    worktreeTarget.extend({
      action: z.literal("merge"),
      sourceBranch: sourceBranchSchema,
      expectedWorktreeCommit,
    }),
    worktreeTarget.extend({
      action: z.literal("pull_from_source"),
      sourceBranch: sourceBranchSchema,
      preserveLocalChanges: gitPullFromSourcePayloadSchema.shape.preserveLocalChanges,
    }),
    mergeRecoveryTarget.extend({ action: z.literal("abort") }),
    mergeRecoveryTarget.extend({ action: z.literal("finish") }),
  ]),
  run: async (input, ctx) => {
    const { projectId, worktreePath, action } = input;
    const { location: projectLocation } = requireProject(ctx, projectId);
    const info = await resolveWorktreeInfo(ctx, projectLocation, worktreePath);
    const worktreeLocation = resolveProjectLocation(projectLocation, info.path);
    const scope = { projectId, worktreePath, action };
    if (action === "abort" || action === "finish") {
      const target = {
        worktreeLocation,
        ...(input.reapplyStashCommit === undefined
          ? {}
          : { reapplyStashCommit: input.reapplyStashCommit }),
      };
      const result =
        action === "abort"
          ? await ctx.supervisor.gitAbortMerge(target)
          : await ctx.supervisor.gitFinishMerge(target);
      return { ...scope, ...result };
    }
    const sourceBranch =
      input.sourceBranch ??
      (
        await ctx.supervisor.gitGetWorktreeSourceBranch({
          projectLocation,
          branch: info.branch,
        })
      ).sourceBranch;
    if (!sourceBranch)
      throw new Error(`Could not determine a source branch for worktree branch "${info.branch}".`);
    if (action === "pull_from_source") {
      const result = await ctx.supervisor.gitPullFromSource({
        worktreeLocation,
        sourceBranch,
        preserveLocalChanges: input.preserveLocalChanges,
      });
      return { ...scope, sourceBranch, ...result };
    }
    const expectedCommit =
      input.expectedWorktreeCommit ?? expectedWorktreeCommit.safeParse(info.commit).data;
    const result = await ctx.supervisor.gitMergeToSource({
      projectLocation,
      worktreeLocation,
      worktreeBranch: info.branch,
      sourceBranch,
      ...(expectedCommit === undefined ? {} : { expectedWorktreeCommit: expectedCommit }),
    });
    return { ...scope, sourceBranch, ...result };
  },
});
