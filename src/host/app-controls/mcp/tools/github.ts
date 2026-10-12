import { z } from "zod";
import type { ProjectLocation } from "@/shared/contracts";
import { branchNameFromRemoteRef } from "@/shared/gitUtils";
import {
  capDiff,
  projectIdProp,
  requireProject,
  resolveLocation,
  worktreePathProp,
  type AppControlsToolContext,
  type ToolDomain,
} from "./types";

const listPrsArgsSchema = z.object({ projectId: z.string().min(1) });
const getPrArgsSchema = z.object({
  projectId: z.string().min(1),
  prNumber: z.number().int().min(1),
  include: z.array(z.enum(["details", "checks", "files", "diff"])).optional(),
});
const createPrArgsSchema = z.object({
  projectId: z.string().min(1),
  worktreePath: z.string().min(1).optional(),
  branch: z.string().min(1),
  baseBranch: z.string().min(1).optional(),
  title: z.string().min(1),
  body: z.string(),
  draft: z.boolean().optional(),
});
const commentArgsSchema = z.object({
  projectId: z.string().min(1),
  prNumber: z.number().int().min(1),
  body: z.string().min(1),
});
const mergePrArgsSchema = z.object({
  projectId: z.string().min(1),
  prNumber: z.number().int().min(1),
  method: z.enum(["merge", "squash", "rebase"]).optional(),
});
const updatePrArgsSchema = z.object({
  projectId: z.string().min(1),
  prNumber: z.number().int().min(1),
  action: z.enum(["close", "reopen", "ready", "update_branch"]),
  rebase: z.boolean().optional(),
});

export const githubTools: ToolDomain = {
  specs: [
    {
      name: "gh_list_prs",
      description:
        "List the project's GitHub pull requests (with author, additions/deletions, review status, and the viewer's login) via the `gh` CLI. Read-only.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["projectId"],
        properties: { projectId: projectIdProp },
      },
    },
    {
      name: "gh_get_pr",
      description:
        "Read one pull request. Returns its details by default; pass include to add checks, files, and/or the unified diff (diff is capped at 80000 characters). Read-only.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["projectId", "prNumber"],
        properties: {
          projectId: projectIdProp,
          prNumber: { type: "integer", minimum: 1 },
          include: {
            type: "array",
            items: { type: "string", enum: ["details", "checks", "files", "diff"] },
          },
        },
      },
    },
    {
      name: "gh_create_pr",
      description:
        "Create a GitHub pull request from branch into baseBranch (defaults to the repo default). Consequential — this publishes a pull request others can see; explain it to the user first. Pass worktreePath to run from one of the project's worktrees.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["projectId", "branch", "title", "body"],
        properties: {
          projectId: projectIdProp,
          worktreePath: worktreePathProp,
          branch: { type: "string", minLength: 1 },
          baseBranch: { type: "string", minLength: 1 },
          title: { type: "string", minLength: 1 },
          body: { type: "string" },
          draft: { type: "boolean" },
        },
      },
    },
    {
      name: "gh_pr_comment",
      description:
        "Post a comment on a pull request. Consequential — the comment is publicly visible; explain it to the user first.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["projectId", "prNumber", "body"],
        properties: {
          projectId: projectIdProp,
          prNumber: { type: "integer", minimum: 1 },
          body: { type: "string", minLength: 1 },
        },
      },
    },
    {
      name: "gh_merge_pr",
      description:
        "HIGHLY CONSEQUENTIAL: merge a pull request into its base branch (method: merge, squash, or rebase; default merge). This changes the shared repository and usually cannot be undone. Require explicit user confirmation before calling.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["projectId", "prNumber"],
        properties: {
          projectId: projectIdProp,
          prNumber: { type: "integer", minimum: 1 },
          method: { type: "string", enum: ["merge", "squash", "rebase"] },
        },
      },
    },
    {
      name: "gh_update_pr",
      description:
        "Change a pull request's state: close, reopen, ready (mark a draft ready for review), or update_branch (merge/rebase the base into the PR branch; set rebase: true to rebase). Consequential — explain it to the user first.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["projectId", "prNumber", "action"],
        properties: {
          projectId: projectIdProp,
          prNumber: { type: "integer", minimum: 1 },
          action: { type: "string", enum: ["close", "reopen", "ready", "update_branch"] },
          rebase: { type: "boolean" },
        },
      },
    },
  ],
  handlers: {
    gh_list_prs: async (args, ctx) => {
      const { projectId } = listPrsArgsSchema.parse(args);
      const projectLocation = requireProject(ctx, projectId).location;
      await requireGh(ctx, projectLocation);
      const result = await ctx.supervisor.ghListPullRequests({ projectLocation });
      return { projectId, count: result.pullRequests.length, ...result };
    },
    gh_get_pr: async (args, ctx) => {
      const { projectId, prNumber, include } = getPrArgsSchema.parse(args);
      const projectLocation = requireProject(ctx, projectId).location;
      await requireGh(ctx, projectLocation);
      const want = new Set(include ?? ["details"]);
      const { details } = await ctx.supervisor.ghGetPrDetails({ projectLocation, prNumber });
      const out: Record<string, unknown> = { projectId, prNumber, details };
      // Details land the head branch checks need; the rest run concurrently.
      const [checks, files, diff] = await Promise.all([
        want.has("checks")
          ? ctx.supervisor.ghGetPrChecks({ projectLocation, branch: details.headBranch })
          : undefined,
        want.has("files") ? ctx.supervisor.ghGetPrFiles({ projectLocation, prNumber }) : undefined,
        want.has("diff") ? ctx.supervisor.ghGetPrDiff({ projectLocation, prNumber }) : undefined,
      ]);
      if (checks) out.checks = checks.checks;
      if (files) out.files = files.files;
      if (diff) {
        const capped = capDiff(diff.diff);
        out.diff = capped.diff;
        if (capped.truncated) {
          out.diffTruncated = true;
          out.diffNote = capped.note;
        }
      }
      return out;
    },
    gh_create_pr: async (args, ctx) => {
      const { projectId, worktreePath, branch, baseBranch, title, body, draft } =
        createPrArgsSchema.parse(args);
      const project = requireProject(ctx, projectId);
      // Validates worktreePath against the project's worktree set before use.
      const projectLocation = await resolveLocation(ctx, projectId, worktreePath);
      await requireGh(ctx, projectLocation);
      // The gh RPC needs a concrete base branch. When the caller omits it and the
      // PR is from a worktree, infer it from the worktree's source branch.
      let resolvedBase = baseBranch;
      if (!resolvedBase && worktreePath) {
        const [{ sourceBranch }, branches] = await Promise.all([
          ctx.supervisor.gitGetWorktreeSourceBranch({
            projectLocation: project.location,
            branch,
          }),
          ctx.supervisor.gitListBranches({
            projectLocation: project.location,
            includeRemote: true,
          }),
        ]);
        resolvedBase = sourceBranch
          ? branchNameFromRemoteRef(sourceBranch, branches.branches)
          : undefined;
      }
      if (!resolvedBase) {
        throw new Error(
          "baseBranch is required: could not infer the base branch to open the PR against. Pass baseBranch explicitly.",
        );
      }
      const pr = await ctx.supervisor.ghCreatePr({
        projectLocation,
        branch,
        baseBranch: resolvedBase,
        title,
        body,
        isDraft: draft ?? false,
      });
      return { projectId, created: true, pr };
    },
    gh_pr_comment: async (args, ctx) => {
      const { projectId, prNumber, body } = commentArgsSchema.parse(args);
      const projectLocation = requireProject(ctx, projectId).location;
      await requireGh(ctx, projectLocation);
      const comment = await ctx.supervisor.ghPostPrComment({ projectLocation, prNumber, body });
      return { projectId, prNumber, posted: true, comment };
    },
    gh_merge_pr: async (args, ctx) => {
      const { projectId, prNumber, method } = mergePrArgsSchema.parse(args);
      const projectLocation = requireProject(ctx, projectId).location;
      await requireGh(ctx, projectLocation);
      await ctx.supervisor.ghMergePr({
        projectLocation,
        prNumber,
        method: method ?? "merge",
        admin: false,
      });
      return { projectId, prNumber, merged: true, method: method ?? "merge" };
    },
    gh_update_pr: async (args, ctx) => {
      const { projectId, prNumber, action, rebase } = updatePrArgsSchema.parse(args);
      const projectLocation = requireProject(ctx, projectId).location;
      await requireGh(ctx, projectLocation);
      switch (action) {
        case "close":
          await ctx.supervisor.ghClosePr({ projectLocation, prNumber });
          break;
        case "reopen":
          await ctx.supervisor.ghReopenPr({ projectLocation, prNumber });
          break;
        case "ready":
          await ctx.supervisor.ghMarkPrReady({ projectLocation, prNumber });
          break;
        case "update_branch":
          await ctx.supervisor.ghUpdatePrBranch({
            projectLocation,
            prNumber,
            rebase: rebase ?? false,
          });
          break;
      }
      return { projectId, prNumber, action, done: true };
    },
  },
};

/** Fail fast with a clear message when the `gh` CLI is not available for this runtime. */
async function requireGh(
  ctx: AppControlsToolContext,
  projectLocation: ProjectLocation,
): Promise<void> {
  const { available } = await ctx.supervisor.ghCheckAvailable({ projectLocation });
  if (!available) {
    throw new Error(
      "The GitHub CLI (gh) is not available or not authenticated for this project's runtime. Install and sign in with `gh auth login` to use GitHub tools.",
    );
  }
}
