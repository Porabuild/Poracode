import { randomUUID } from "node:crypto";
import type { ProjectLocation } from "@/shared/contracts";
import type { GitStateSnapshot } from "@/shared/gitState";
import { buildWorktreeLocation } from "@/shared/worktree";
import { dbGetProjects, dbGetThreads } from "../../db";
import { RemoteHttpError } from "../auth";
import type { RemoteBroadcastEvent, RemoteServerContext } from "./context";

const HOST_SCRIPT_TIMEOUT_MS = 30_000;

export function normalizeHostShellScript(script: string): string {
  return script
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .join(" && ");
}

export function buildHostScriptWithExitOnSuccess(
  script: string,
  locationKind: ProjectLocation["kind"],
): string {
  const lines = script
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
  if (lines.length === 0) return "";
  if (locationKind === "windows") {
    return lines.reduceRight((tail, line) => `${line}; if ($?) { ${tail} }`, "exit");
  }
  return `${lines.join(" && ")} && exit`;
}

export function worktreeHasUnmergedPullRequest(
  snapshot: GitStateSnapshot | undefined,
  projectId: string,
  worktreePath: string,
): boolean {
  if (!snapshot) return false;
  const target = Object.values(snapshot.targets).find(
    (entry) => entry.ref.projectId === projectId && entry.ref.worktreePath === worktreePath,
  );
  const prKey = target?.pullRequestKey;
  if (!prKey) return false;
  const pullRequest = snapshot.pullRequests[prKey];
  return pullRequest !== undefined && pullRequest.data.state !== "merged";
}

function requireProject(projectId: string) {
  const project = dbGetProjects().find((entry) => entry.id === projectId);
  if (!project) {
    throw new RemoteHttpError("project_not_found", "Project not found.", 404);
  }
  return project;
}

async function runHostWorktreeScript(
  ctx: RemoteServerContext,
  projectLocation: ProjectLocation,
  worktreePath: string,
  script: string,
  options: { readonly waitForExit: boolean },
): Promise<void> {
  const command = normalizeHostShellScript(script);
  if (!command) return;
  const shellId = `shell:host-worktree-${randomUUID()}`;
  const worktreeLocation = buildWorktreeLocation(projectLocation, worktreePath);
  await ctx.options.callSupervisor("startShell", {
    shellId,
    projectLocation: worktreeLocation,
    worktreePath,
  });
  await ctx.options.callSupervisor("writeTerminal", {
    threadId: shellId,
    data: `${buildHostScriptWithExitOnSuccess(script, projectLocation.kind)}\r`,
  });
  if (!options.waitForExit) return;
  try {
    await ctx.waitForSupervisorEvent(
      (event: RemoteBroadcastEvent) => event.type === "thread-exited" && event.threadId === shellId,
      HOST_SCRIPT_TIMEOUT_MS,
    );
  } catch (error) {
    await ctx.options.callSupervisor("closeThread", { threadId: shellId }).catch(() => undefined);
    throw error;
  }
}

export async function prepareHostWorktree(
  ctx: RemoteServerContext,
  input: { readonly projectId: string; readonly worktreePath: string },
): Promise<void> {
  const project = requireProject(input.projectId);
  const worktreePaths = [
    ...new Set([
      ...dbGetThreads()
        .filter((thread) => thread.projectId === input.projectId && thread.worktreePath)
        .map((thread) => thread.worktreePath!),
      input.worktreePath,
    ]),
  ].sort();
  await ctx.options
    .callSupervisor("gitWatchWorktrees", {
      projectId: input.projectId,
      worktreePaths,
    })
    .catch(() => undefined);
  const setupScript = project.scripts?.setupScript;
  if (!setupScript) return;
  await runHostWorktreeScript(ctx, project.location, input.worktreePath, setupScript, {
    waitForExit: false,
  }).catch((error) => {
    console.warn(`[remote] setup script failed for ${input.worktreePath}:`, error);
  });
}

export async function removeHostWorktree(
  ctx: RemoteServerContext,
  input: {
    readonly projectId: string;
    readonly worktreePath: string;
    readonly worktreeBranch?: string;
  },
): Promise<void> {
  const project = requireProject(input.projectId);
  const cleanupScript = project.scripts?.cleanupScript;
  if (cleanupScript) {
    await runHostWorktreeScript(ctx, project.location, input.worktreePath, cleanupScript, {
      waitForExit: true,
    }).catch((error) => {
      console.warn(`[remote] cleanup script failed for ${input.worktreePath}:`, error);
    });
  }
  try {
    await ctx.options.callSupervisor("gitRemoveWorktree", {
      projectLocation: project.location,
      path: input.worktreePath,
      force: true,
      deleteBranch: false,
      ...(input.worktreeBranch ? { expectedBranch: input.worktreeBranch } : {}),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (!detail.toLowerCase().includes("not found")) {
      throw new RemoteHttpError(
        "worktree_remove_failed",
        detail || "Unable to remove worktree.",
        500,
      );
    }
  }
  if (!input.worktreeBranch) return;
  const force = !worktreeHasUnmergedPullRequest(
    ctx.options.gitState?.getSnapshot(),
    input.projectId,
    input.worktreePath,
  );
  try {
    await ctx.options.callSupervisor("gitDeleteBranch", {
      projectLocation: project.location,
      branch: input.worktreeBranch,
      force,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (detail.includes("not fully merged")) return;
    if (!detail.toLowerCase().includes("not found")) {
      throw new RemoteHttpError(
        "worktree_branch_delete_failed",
        detail || "Unable to delete worktree branch.",
        500,
      );
    }
  }
}
