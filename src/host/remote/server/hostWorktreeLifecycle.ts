import { randomUUID } from "node:crypto";
import type { ProjectLocation } from "@/shared/contracts";
import type { GitStateSnapshot } from "@/shared/gitState";
import { createShellPromptGate } from "@/shared/shellPromptReady";
import { worktreeScriptShellId } from "@/shared/worktreeScriptShell";
import { buildWorktreeLocation } from "@/shared/worktree";
import { dbGetProjects, dbGetThreads } from "@/host/db";
import { RemoteHttpError } from "../auth";
import type { RemoteBroadcastEvent, RemoteServerContext } from "./context";

const HOST_SCRIPT_TIMEOUT_MS = 30_000;
const HOST_PROMPT_WAIT_MS = 20_000;

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

function isHostShellSignal(event: RemoteBroadcastEvent, shellId: string): boolean {
  if (!("threadId" in event) || event.threadId !== shellId) return false;
  return (
    event.type === "thread-output" ||
    event.type === "thread-exited" ||
    event.type === "thread-reset"
  );
}

/**
 * Writes the script only after the login shell reaches a prompt. The first
 * PTY bytes are often a device-attribute query; injecting the command there
 * runs it before PATH is ready and leaves a cleared, empty terminal that
 * never exits.
 *
 * Setup does not await this: the desktop tab has to attach and answer those
 * queries. Cleanup does await it, then waits for the shell to exit.
 */
type HostScriptWrite = "written" | "exited" | "stopped";

/**
 * The spawn `thread-reset` is published only after its durable rebase, so it
 * can arrive after the prompt. Re-seed from the live scrollback or that late
 * reset would discard the prompt and wait out the whole deadline.
 */
async function seedPromptFromScrollback(
  ctx: RemoteServerContext,
  shellId: string,
  prompt: ReturnType<typeof createShellPromptGate>,
): Promise<"ready" | "pending" | "empty"> {
  let scrollback = "";
  try {
    const value = await ctx.options.callSupervisor("readTerminalScrollback", {
      threadId: shellId,
    });
    if (typeof value === "string") scrollback = value.slice(-2048);
  } catch {
    return "empty";
  }
  if (!scrollback) return "empty";
  return prompt.push(scrollback) === "ready" ? "ready" : "pending";
}

async function writeHostScriptWhenReady(
  ctx: RemoteServerContext,
  shellId: string,
  data: string,
): Promise<HostScriptWrite> {
  const prompt = createShellPromptGate();
  const deadline = Date.now() + HOST_PROMPT_WAIT_MS;
  let seenOutput = false;
  while (!ctx.stopping && Date.now() < deadline) {
    const remaining = Math.max(1, deadline - Date.now());
    let event: RemoteBroadcastEvent;
    try {
      event = await ctx.waitForSupervisorEvent(
        (candidate) => isHostShellSignal(candidate, shellId),
        seenOutput ? Math.min(prompt.delayMs(), remaining) : remaining,
      );
    } catch {
      if (seenOutput || Date.now() >= deadline) break;
      continue;
    }
    if (event.type === "thread-exited") return "exited";
    if (event.type === "thread-reset") {
      prompt.reset();
      seenOutput = false;
      const seeded = await seedPromptFromScrollback(ctx, shellId, prompt);
      if (seeded === "ready") break;
      if (seeded === "pending") seenOutput = true;
      continue;
    }
    if (event.type !== "thread-output") continue;
    seenOutput = true;
    if (prompt.push(event.data) === "ready") break;
  }
  if (ctx.stopping) return "stopped";
  await ctx.options.callSupervisor("writeTerminal", { threadId: shellId, data });
  return "written";
}

async function runHostWorktreeScript(
  ctx: RemoteServerContext,
  projectLocation: ProjectLocation,
  worktreePath: string,
  script: string,
  options: { readonly waitForExit: boolean; readonly shellId: string },
): Promise<void> {
  const command = normalizeHostShellScript(script);
  if (!command) return;
  const { shellId } = options;
  const worktreeLocation = buildWorktreeLocation(projectLocation, worktreePath);
  await ctx.options.callSupervisor("startShell", {
    shellId,
    projectLocation: worktreeLocation,
    worktreePath,
  });
  const data = `${buildHostScriptWithExitOnSuccess(script, projectLocation.kind)}\r`;
  if (!options.waitForExit) {
    void writeHostScriptWhenReady(ctx, shellId, data).catch((error) => {
      console.warn(`[remote] setup script failed for ${worktreePath}:`, error);
    });
    return;
  }
  const outcome = await writeHostScriptWhenReady(ctx, shellId, data);
  if (outcome !== "written") return;
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
  const watches = ctx.options.projectWatches;
  if (watches) {
    // A host-owned pin joins the union of every client's worktree set, so it
    // no longer restates all thread worktrees to avoid clobbering them.
    await watches.pinWorktree(input.projectId, input.worktreePath).catch(() => undefined);
  } else {
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
  }
  const setupScript = project.scripts?.setupScript;
  if (!setupScript) return;
  await runHostWorktreeScript(ctx, project.location, input.worktreePath, setupScript, {
    waitForExit: false,
    shellId: worktreeScriptShellId(
      input.projectId,
      input.worktreePath,
      project.location.kind === "windows",
    ),
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
      shellId: `shell:host-worktree-${randomUUID()}`,
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
  await ctx.options.projectWatches
    ?.unpinWorktree(input.projectId, input.worktreePath)
    .catch(() => undefined);
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
