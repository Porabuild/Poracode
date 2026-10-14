import { z } from "zod";
import { normalizeWorktreePathForComparison, resolveProjectLocation } from "@/shared/worktree";
import {
  capDiff,
  projectIdProp,
  requireProject,
  resolveLocation,
  resolveWorktreeInfo,
  worktreePathProp,
  type ToolDomain,
} from "./types";

/** Matches a full git object id (SHA-1 or SHA-256), the only value git accepts as an expected commit. */
const FULL_COMMIT_OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;

const projectArgs = {
  projectId: z.string().min(1),
  worktreePath: z.string().min(1).optional(),
};

const statusArgsSchema = z.object(projectArgs);
const diffArgsSchema = z.object({
  ...projectArgs,
  filePath: z.string().min(1).optional(),
  staged: z.boolean().optional(),
});
const stageArgsSchema = z.object({
  ...projectArgs,
  paths: z.array(z.string().min(1)).min(1).optional(),
  all: z.boolean().optional(),
  unstage: z.boolean().optional(),
});
const commitArgsSchema = z.object({
  ...projectArgs,
  message: z.string().min(1),
  addAll: z.boolean().optional(),
});
const discardArgsSchema = z.object({
  ...projectArgs,
  paths: z.array(z.string().min(1)).min(1).optional(),
  all: z.boolean().optional(),
});
const branchArgsSchema = z.object({
  ...projectArgs,
  action: z.enum(["list", "switch", "create"]),
  branch: z.string().min(1).optional(),
  includeRemote: z.boolean().optional(),
});
const syncArgsSchema = z.object({
  ...projectArgs,
  action: z.enum(["fetch", "pull", "pull_rebase", "push"]),
  remote: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
  setUpstream: z.boolean().optional(),
});
const listWorktreesArgsSchema = z.object({ projectId: z.string().min(1) });
const removeWorktreeArgsSchema = z.object({
  projectId: z.string().min(1),
  worktreePath: z.string().min(1),
});
const mergeWorktreeArgsSchema = z.object({
  projectId: z.string().min(1),
  worktreePath: z.string().min(1),
  action: z.enum(["merge", "pull_from_source", "abort", "finish"]),
});

export const gitTools: ToolDomain = {
  specs: [
    {
      name: "git_status",
      description:
        "Read a project's git state: current branch, ahead/behind, staged and unstaged changes, branches, and worktrees. Pass worktreePath to inspect one of the project's worktrees instead of the main checkout. Read-only.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["projectId"],
        properties: {
          projectId: projectIdProp,
          worktreePath: worktreePathProp,
        },
      },
    },
    {
      name: "git_diff",
      description:
        "Show uncommitted changes as a unified diff. Pass filePath for one file (set staged to diff the staged copy), or omit it for every changed file. Output is capped at 80000 characters (truncation is flagged). Read-only.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["projectId"],
        properties: {
          projectId: projectIdProp,
          worktreePath: worktreePathProp,
          filePath: { type: "string", minLength: 1 },
          staged: { type: "boolean" },
        },
      },
    },
    {
      name: "git_stage",
      description:
        "Stage or unstage changes for the next commit. Pass paths for specific files or all: true for every change; set unstage: true to move them out of the index instead. Non-destructive (does not touch file contents).",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["projectId"],
        properties: {
          projectId: projectIdProp,
          worktreePath: worktreePathProp,
          paths: { type: "array", items: { type: "string", minLength: 1 }, minItems: 1 },
          all: { type: "boolean" },
          unstage: { type: "boolean" },
        },
      },
    },
    {
      name: "git_commit",
      description:
        "Create a git commit with the given message. Set addAll: true to stage every change first; otherwise only already-staged changes are committed. Consequential — explain the commit to the user first.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["projectId", "message"],
        properties: {
          projectId: projectIdProp,
          worktreePath: worktreePathProp,
          message: { type: "string", minLength: 1 },
          addAll: { type: "boolean" },
        },
      },
    },
    {
      name: "git_discard",
      description:
        "DESTRUCTIVE: permanently delete uncommitted changes, reverting files to their last committed state. Discarded work cannot be recovered. Confirm with the user before calling. Pass either paths (specific files) or all: true — never both, and never neither.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["projectId"],
        properties: {
          projectId: projectIdProp,
          worktreePath: worktreePathProp,
          paths: { type: "array", items: { type: "string", minLength: 1 }, minItems: 1 },
          all: { type: "boolean" },
        },
      },
    },
    {
      name: "git_branch",
      description:
        "List branches (action: list, includeRemote to include remotes), switch to an existing branch (action: switch), or create and switch to a new branch (action: create). branch is required for switch/create.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["projectId", "action"],
        properties: {
          projectId: projectIdProp,
          worktreePath: worktreePathProp,
          action: { type: "string", enum: ["list", "switch", "create"] },
          branch: { type: "string", minLength: 1 },
          includeRemote: { type: "boolean" },
        },
      },
    },
    {
      name: "git_sync",
      description:
        "Exchange commits with a remote: fetch, pull (merge), pull_rebase, or push. push is consequential — it publishes local commits to the remote. When the user explicitly asked in this thread to push or publish the named fix, that request is authorization; call push after the normal checks without asking for another confirmation. If they only asked to inspect or fix work, do not push. Pass remote/branch/setUpstream as needed (remote defaults to origin).",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["projectId", "action"],
        properties: {
          projectId: projectIdProp,
          worktreePath: worktreePathProp,
          action: { type: "string", enum: ["fetch", "pull", "pull_rebase", "push"] },
          remote: { type: "string", minLength: 1 },
          branch: { type: "string", minLength: 1 },
          setUpstream: { type: "boolean" },
        },
      },
    },
    {
      name: "list_worktrees",
      description:
        "List a project's git worktrees (path, branch, commit, whether it is the main checkout), each enriched with a short change-count status when available. Read-only.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["projectId"],
        properties: { projectId: projectIdProp },
      },
    },
    {
      name: "remove_worktree",
      description:
        "DESTRUCTIVE: delete a worktree directory from disk. Refuses when an open (non-archived) thread still references the worktree — archive or move those threads first. Confirm with the user before calling.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["projectId", "worktreePath"],
        properties: {
          projectId: projectIdProp,
          worktreePath: worktreePathProp,
        },
      },
    },
    {
      name: "merge_worktree",
      description:
        "Drive a worktree's merge flow against its source branch: merge (merge the worktree branch into its source), pull_from_source (bring source changes into the worktree), abort (abandon an in-progress merge), or finish (commit a resolved merge). The source branch and expected commit are resolved automatically. merge/pull_from_source change git history — explain them to the user first.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["projectId", "worktreePath", "action"],
        properties: {
          projectId: projectIdProp,
          worktreePath: worktreePathProp,
          action: { type: "string", enum: ["merge", "pull_from_source", "abort", "finish"] },
        },
      },
    },
  ],
  handlers: {
    git_status: async (args, ctx) => {
      const { projectId, worktreePath } = statusArgsSchema.parse(args);
      const projectLocation = await resolveLocation(ctx, projectId, worktreePath);
      const snapshot = await ctx.supervisor.gitProjectSnapshot({
        projectLocation,
        includeGhCheck: false,
      });
      return { projectId, ...(worktreePath ? { worktreePath } : {}), snapshot };
    },
    git_diff: async (args, ctx) => {
      const { projectId, worktreePath, filePath, staged } = diffArgsSchema.parse(args);
      const projectLocation = await resolveLocation(ctx, projectId, worktreePath);
      if (filePath) {
        const { diff } = await ctx.supervisor.getGitDiff({
          projectLocation,
          filePath,
          staged: staged ?? false,
        });
        return { projectId, filePath, ...capDiff(diff) };
      }
      const batch = await ctx.supervisor.getGitDiffBatch({ projectLocation, untrackedPaths: [] });
      const combined = [
        ...Object.entries(batch.staged).map(([path, diff]) => `# staged: ${path}\n${diff}`),
        ...Object.entries(batch.unstaged).map(([path, diff]) => `# unstaged: ${path}\n${diff}`),
      ].join("\n");
      return {
        projectId,
        stagedFiles: Object.keys(batch.staged),
        unstagedFiles: Object.keys(batch.unstaged),
        ...capDiff(combined),
      };
    },
    git_stage: async (args, ctx) => {
      const { projectId, worktreePath, paths, all, unstage } = stageArgsSchema.parse(args);
      if (!all && (!paths || paths.length === 0)) {
        throw new Error("Pass paths (specific files) or all: true.");
      }
      const projectLocation = await resolveLocation(ctx, projectId, worktreePath);
      if (all) {
        if (unstage) await ctx.supervisor.gitUnstageAll({ projectLocation });
        else await ctx.supervisor.gitStageAll({ projectLocation });
        return { projectId, action: unstage ? "unstage" : "stage", all: true };
      }
      for (const filePath of paths ?? []) {
        if (unstage) await ctx.supervisor.gitUnstage({ projectLocation, filePath });
        else await ctx.supervisor.gitStage({ projectLocation, filePath });
      }
      return { projectId, action: unstage ? "unstage" : "stage", paths };
    },
    git_commit: async (args, ctx) => {
      const { projectId, worktreePath, message, addAll } = commitArgsSchema.parse(args);
      const projectLocation = await resolveLocation(ctx, projectId, worktreePath);
      const result = await ctx.supervisor.gitCommit({
        projectLocation,
        message,
        addAll: addAll ?? false,
      });
      return { projectId, committed: true, ...result };
    },
    git_discard: async (args, ctx) => {
      const { projectId, worktreePath, paths, all } = discardArgsSchema.parse(args);
      const hasPaths = (paths?.length ?? 0) > 0;
      if (hasPaths === Boolean(all)) {
        throw new Error(
          "git_discard permanently deletes uncommitted changes. Pass exactly one of paths or all: true.",
        );
      }
      const projectLocation = await resolveLocation(ctx, projectId, worktreePath);
      if (all) {
        await ctx.supervisor.gitRevertAll({ projectLocation });
        return { projectId, discarded: "all" };
      }
      for (const filePath of paths ?? []) {
        await ctx.supervisor.gitRevert({ projectLocation, filePath });
      }
      return { projectId, discardedPaths: paths };
    },
    git_branch: async (args, ctx) => {
      const { projectId, worktreePath, action, branch, includeRemote } =
        branchArgsSchema.parse(args);
      const projectLocation = await resolveLocation(ctx, projectId, worktreePath);
      if (action === "list") {
        const result = await ctx.supervisor.gitListBranches({
          projectLocation,
          includeRemote: includeRemote ?? true,
        });
        return { projectId, ...result };
      }
      if (!branch) throw new Error(`branch is required for action "${action}".`);
      const result = await ctx.supervisor.gitSwitchBranch({
        projectLocation,
        branch,
        createNew: action === "create",
      });
      return { projectId, switched: true, ...result };
    },
    git_sync: async (args, ctx) => {
      const { projectId, worktreePath, action, remote, branch, setUpstream } =
        syncArgsSchema.parse(args);
      const projectLocation = await resolveLocation(ctx, projectId, worktreePath);
      const remoteArg = remote ? { remote } : {};
      switch (action) {
        case "fetch":
          await ctx.supervisor.gitFetch({
            projectLocation,
            remote: remote ?? "origin",
            prune: false,
          });
          break;
        case "pull":
          await ctx.supervisor.gitPull({ projectLocation, ...remoteArg });
          break;
        case "pull_rebase":
          await ctx.supervisor.gitPullRebase({ projectLocation, ...remoteArg });
          break;
        case "push":
          await ctx.supervisor.gitPush({
            projectLocation,
            ...remoteArg,
            ...(branch ? { branch } : {}),
            ...(setUpstream === undefined ? {} : { setUpstream }),
          });
          break;
      }
      return { projectId, action, done: true };
    },
    list_worktrees: async (args, ctx) => {
      const { projectId } = listWorktreesArgsSchema.parse(args);
      const project = requireProject(ctx, projectId);
      const { worktrees } = await ctx.supervisor.gitListWorktrees({
        projectLocation: project.location,
      });
      const paths = worktrees.map((worktree) => worktree.path);
      let statuses: Record<
        string,
        { branch: string; ahead: number; behind: number; changed: number }
      > = {};
      if (paths.length > 0) {
        try {
          const batch = await ctx.supervisor.gitWorktreeStatusBatch({
            projectLocation: project.location,
            worktreePaths: paths,
          });
          statuses = Object.fromEntries(
            Object.entries(batch.statuses).map(([path, status]) => [
              path,
              {
                branch: status.branch,
                ahead: status.ahead,
                behind: status.behind,
                changed: status.staged.length + status.unstaged.length,
              },
            ]),
          );
        } catch {
          // Status enrichment is best-effort; fall back to the plain worktree list.
        }
      }
      return {
        projectId,
        count: worktrees.length,
        worktrees: worktrees.map((worktree) => ({
          path: worktree.path,
          branch: worktree.branch,
          commit: worktree.commit,
          isMain: worktree.isMain,
          ...(statuses[worktree.path] ? { status: statuses[worktree.path] } : {}),
        })),
      };
    },
    remove_worktree: async (args, ctx) => {
      const { projectId, worktreePath } = removeWorktreeArgsSchema.parse(args);
      const project = requireProject(ctx, projectId);
      const target = normalizeWorktreePathForComparison(worktreePath, false);
      const blocking = ctx
        .getThreads()
        .filter(
          (thread) =>
            !thread.archived &&
            thread.worktreePath &&
            normalizeWorktreePathForComparison(thread.worktreePath, false) === target,
        )
        .map((thread) => thread.id);
      if (blocking.length > 0) {
        throw new Error(
          `Cannot remove this worktree: it is still referenced by open thread(s): ${blocking.join(
            ", ",
          )}. Archive or move them first, then retry.`,
        );
      }
      await ctx.supervisor.gitRemoveWorktree({
        projectLocation: project.location,
        path: worktreePath,
        force: false,
        deleteBranch: false,
      });
      return { projectId, worktreePath, removed: true };
    },
    merge_worktree: async (args, ctx) => {
      const { projectId, worktreePath, action } = mergeWorktreeArgsSchema.parse(args);
      const project = requireProject(ctx, projectId);
      const worktreeLocation = resolveProjectLocation(project.location, worktreePath);
      if (action === "abort") {
        const result = await ctx.supervisor.gitAbortMerge({ worktreeLocation });
        return { projectId, worktreePath, action, ...result };
      }
      if (action === "finish") {
        const result = await ctx.supervisor.gitFinishMerge({ worktreeLocation });
        return { projectId, worktreePath, action, ...result };
      }
      // merge / pull_from_source both need the worktree branch + its source branch.
      const info = await resolveWorktreeInfo(ctx, project.location, worktreePath);
      const { sourceBranch } = await ctx.supervisor.gitGetWorktreeSourceBranch({
        projectLocation: project.location,
        branch: info.branch,
      });
      if (!sourceBranch) {
        throw new Error(
          `Could not determine a source branch for worktree branch "${info.branch}". It may have no upstream/parent to merge with.`,
        );
      }
      if (action === "pull_from_source") {
        const result = await ctx.supervisor.gitPullFromSource({
          worktreeLocation,
          sourceBranch,
          preserveLocalChanges: false,
        });
        return { projectId, worktreePath, action, sourceBranch, ...result };
      }
      const result = await ctx.supervisor.gitMergeToSource({
        projectLocation: project.location,
        worktreeLocation,
        worktreeBranch: info.branch,
        sourceBranch,
        ...(FULL_COMMIT_OID.test(info.commit) ? { expectedWorktreeCommit: info.commit } : {}),
      });
      return { projectId, worktreePath, action, sourceBranch, ...result };
    },
  },
};
