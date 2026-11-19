import { posix, win32 } from "node:path";
import { z } from "zod";
import {
  gitAddRemotePayloadSchema,
  gitAddWorktreePayloadSchema,
  gitDeleteBranchPayloadSchema,
  getGitBranchesPayloadSchema,
  gitSwitchBranchPayloadSchema,
} from "@/shared/contracts";
import { isHomeProject } from "@/shared/homeScope";
import { resolveWorktreePlacement } from "@/shared/worktree";
import { defineAppControlTool } from "../defineTools";
import { requireProject, resolveLocation } from "./types";

const projectTarget = z.strictObject({
  projectId: z.string().min(1),
  worktreePath: z.string().min(1).optional(),
});
// Git receives these values as positional arguments.
const gitArgument = z.string().min(1).regex(/^[^-]/u);

export const gitRepositoryTool = defineAppControlTool({
  name: "git_repository",
  description:
    "Initialize Git in an existing Poracode project or add a named remote to its repository. Supply remote and url for add_remote. Use create_project_directory or clone_project to register new project folders.",
  input: z.discriminatedUnion("action", [
    projectTarget.extend({ action: z.literal("init") }),
    projectTarget.extend({
      action: z.literal("add_remote"),
      remote: gitAddRemotePayloadSchema.shape.remote.regex(/^[^-]/u),
      url: gitAddRemotePayloadSchema.shape.url.regex(/^[^-]/u),
    }),
  ]),
  run: async (input, ctx) => {
    const { projectId, worktreePath, action } = input;
    const projectLocation = await resolveLocation(ctx, projectId, worktreePath);
    if (action === "init") {
      await ctx.supervisor.gitInit({ projectLocation });
      return { projectId, action, initialized: true };
    }
    await ctx.supervisor.gitAddRemote({ projectLocation, remote: input.remote, url: input.url });
    return { projectId, action, remote: input.remote, added: true };
  },
});

const branchTarget = projectTarget.extend({
  includeRemote: getGitBranchesPayloadSchema.shape.includeRemote,
});

export const gitBranchTool = defineAppControlTool({
  name: "git_branch",
  description:
    "List branches (includeRemote defaults to true), switch to an existing branch, create and switch to a new branch, or delete a local or remote branch. Use branch for switch, create or delete. Delete defaults to a non-forcing local delete. Pass remote to delete on that remote and confirm the exact intended branch with the user before deleting. Use delete_worktree_group for a worktree with linked threads.",
  input: z.discriminatedUnion("action", [
    branchTarget.extend({ action: z.literal("list"), branch: z.string().min(1).optional() }),
    branchTarget.extend({
      action: z.enum(["switch", "create"]),
      branch: gitSwitchBranchPayloadSchema.shape.branch.regex(/^[^-]/u),
    }),
    projectTarget.extend({
      action: z.literal("delete"),
      branch: gitDeleteBranchPayloadSchema.shape.branch.regex(/^[^-]/u),
      force: gitDeleteBranchPayloadSchema.shape.force,
      remote: gitArgument.optional(),
    }),
  ]),
  run: async (input, ctx) => {
    const { projectId, worktreePath, action } = input;
    const projectLocation = await resolveLocation(ctx, projectId, worktreePath);
    if (action === "list") {
      const result = await ctx.supervisor.gitListBranches({
        projectLocation,
        includeRemote: input.includeRemote,
      });
      return { projectId, ...result };
    }
    if (action === "delete") {
      await ctx.supervisor.gitDeleteBranch({
        projectLocation,
        branch: input.branch,
        force: input.force,
        ...(input.remote === undefined ? {} : { remote: input.remote }),
      });
      return { projectId, action, branch: input.branch, deleted: true };
    }
    const result = await ctx.supervisor.gitSwitchBranch({
      projectLocation,
      branch: input.branch,
      createNew: action === "create",
    });
    return { projectId, switched: true, ...result };
  },
});

const worktree = gitAddWorktreePayloadSchema.shape;

export const createWorktreeTool = defineAppControlTool({
  name: "create_worktree",
  description:
    "Create a linked Git checkout without launching a thread. Pass branch to check out an existing branch or set createBranch:true with branch and an optional startPoint. Explicit path is resolved on the host. Otherwise the checkout follows the project's worktree placement settings. Set transferUncommitted:true to move local changes from the project checkout, or also set keepChangesInSource:true to copy them. Confirm before moving changes. The result reports the exact path and whether changes transferred. Use that path as existingWorktreePath in create_thread.",
  input: z.strictObject({
    projectId: projectTarget.shape.projectId,
    path: worktree.path,
    branch: gitArgument.optional(),
    createBranch: worktree.createBranch,
    startPoint: gitArgument.optional(),
    copyIgnoredPatterns: worktree.copyIgnoredPatterns,
    transferUncommitted: worktree.transferUncommitted,
    keepChangesInSource: worktree.keepChangesInSource,
  }),
  run: async ({ projectId, path, copyIgnoredPatterns, ...input }, ctx) => {
    const project = requireProject(ctx, projectId);
    if (isHomeProject(project)) throw new Error("Choose a Git project to create a worktree.");
    if (!input.branch && (!path || input.createBranch)) {
      throw new Error(
        "Provide a checkout path or branch. Creating a branch requires a branch name.",
      );
    }
    if (input.startPoint !== undefined && !input.createBranch)
      throw new Error("startPoint requires createBranch:true.");
    if (input.keepChangesInSource && !input.transferUncommitted)
      throw new Error("keepChangesInSource requires transferUncommitted:true.");
    const { location } = project;
    const placement = path
      ? undefined
      : resolveWorktreePlacement(ctx.settings.read(), project.worktreeLocation, location);
    const patterns = copyIgnoredPatterns ?? project.scripts?.worktreeCopyPatterns;
    const pathUtilities = location.kind === "windows" ? win32 : posix;
    const projectPath = location.kind === "wsl" ? location.linuxPath : location.path;
    const result = await ctx.supervisor.gitAddWorktree(
      gitAddWorktreePayloadSchema.parse({
        projectLocation: location,
        ...input,
        ...(path
          ? { path: pathUtilities.resolve(projectPath, path) }
          : {
              ...(placement?.root ? { worktreeRoot: placement.root } : {}),
              ...(placement?.omitRepoDir ? { worktreeOmitRepoDir: true } : {}),
            }),
        ...(patterns === undefined ? {} : { copyIgnoredPatterns: patterns }),
      }),
    );
    return { projectId, ...result };
  },
});
