import { z } from "zod";
import {
  capDiff,
  projectIdProp,
  requireProject,
  resolveLocation,
  worktreePathProp,
  type ToolDomain,
} from "./types";
import { gitCommitTool, gitSyncTool, mergeWorktreeTool } from "./gitSync";
import { removeWorktreeTool } from "./worktreeRemoval";
import { createWorktreeTool, gitBranchTool, gitRepositoryTool } from "./gitRepository";

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
const discardArgsSchema = z.object({
  ...projectArgs,
  paths: z.array(z.string().min(1)).min(1).optional(),
  all: z.boolean().optional(),
});
const listWorktreesArgsSchema = z.object({ projectId: z.string().min(1) });
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
    gitCommitTool.spec,
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
    gitRepositoryTool.spec,
    gitBranchTool.spec,
    gitSyncTool.spec,
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
    createWorktreeTool.spec,
    removeWorktreeTool.spec,
    mergeWorktreeTool.spec,
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
    [gitCommitTool.spec.name]: gitCommitTool.handler,
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
    [gitRepositoryTool.spec.name]: gitRepositoryTool.handler,
    [gitBranchTool.spec.name]: gitBranchTool.handler,
    [gitSyncTool.spec.name]: gitSyncTool.handler,
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
    [createWorktreeTool.spec.name]: createWorktreeTool.handler,
    [removeWorktreeTool.spec.name]: removeWorktreeTool.handler,
    [mergeWorktreeTool.spec.name]: mergeWorktreeTool.handler,
  },
};
