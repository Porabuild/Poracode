import { z } from "zod";
import { gitRemoveWorktreePayloadSchema } from "@/shared/contracts";
import { projectLocationKey } from "@/shared/projectIdentity";
import { resolveProjectLocation } from "@/shared/worktree";
import { defineAppControlTool } from "../defineTools";
import { requireProject, resolveWorktreeInfo } from "./types";

const removal = gitRemoveWorktreePayloadSchema.shape;

export const removeWorktreeTool = defineAppControlTool({
  name: "remove_worktree",
  description:
    "Remove a registered linked worktree. Confirm the exact checkout, branch, and any deletion of local changes with the user first. Pass expectedBranch to reject a changed checkout. force and deleteBranch default to false. Open threads block removal. Use delete_worktree_group when the user wants to remove the checkout and its linked conversations together. When a branch deletion is requested, branchDeleted reports the observed result or null if it could not be checked.",
  input: z.strictObject({
    projectId: z.string().min(1),
    worktreePath: removal.path,
    force: removal.force,
    deleteBranch: removal.deleteBranch,
    expectedBranch: removal.expectedBranch,
  }),
  run: async ({ projectId, worktreePath, expectedBranch, force, deleteBranch }, ctx) => {
    const { location } = requireProject(ctx, projectId);
    const worktree = await resolveWorktreeInfo(ctx, location, worktreePath);
    if (worktree.isMain) throw new Error("Cannot remove the main worktree.");
    if (expectedBranch !== undefined && worktree.branch !== expectedBranch) {
      throw new Error(`Expected worktree branch "${expectedBranch}", found "${worktree.branch}".`);
    }
    const targetKey = projectLocationKey(resolveProjectLocation(location, worktree.path));
    const projects = new Map(ctx.getProjects().map((project) => [project.id, project.location]));
    const blocking = ctx.getThreads().filter((thread) => {
      if (thread.archived) return false;
      const threadProjectLocation = projects.get(thread.projectId);
      return (
        threadProjectLocation !== undefined &&
        projectLocationKey(resolveProjectLocation(threadProjectLocation, thread.worktreePath)) ===
          targetKey
      );
    });
    if (blocking.length > 0) {
      throw new Error(
        `Cannot remove this worktree: it is still referenced by open thread(s): ${blocking.map((thread) => thread.id).join(", ")}.`,
      );
    }

    const branch = worktree.branch;
    await ctx.supervisor.gitRemoveWorktree({
      projectLocation: location,
      path: worktree.path,
      force,
      deleteBranch,
      ...(branch ? { expectedBranch: branch } : {}),
    });

    const result = { projectId, worktreePath: worktree.path, removed: true };
    if (!deleteBranch) return result;
    if (!branch || branch === "detached") return { ...result, branchDeleted: false };
    try {
      const { branches } = await ctx.supervisor.gitListBranches({
        projectLocation: location,
        includeRemote: false,
      });
      return { ...result, branch, branchDeleted: !branches.some((entry) => entry.name === branch) };
    } catch {
      return { ...result, branch, branchDeleted: null };
    }
  },
});
