import {
  DEFAULT_TERMINAL_SIZE,
  type Project,
  type RemoteThreadCommand,
  type Thread,
} from "@/shared/contracts";
import type {
  MoveThreadToWorktreeInput,
  MoveThreadToWorktreeResult,
} from "@/shared/contracts/threadWorktreeMove";
import { isHomeProjectId } from "@/shared/homeScope";
import { generateWorktreeBranch } from "@/shared/worktreeBranch";
import { dbAssertNoRunningCheckpointRevert, dbGetProject, dbGetThread } from "@/host/db";
import { dbAssignMainThreadWorktree } from "@/host/db/projectsThreads";
import { dbGetUnresolvedThreadWorkspaceGrantOperation } from "@/host/db/threadWorkspaceGrants";
import { hasSameProjectExecutionScope } from "@/host/threads/projectExecutionScope";
import { assertRemoteThreadStartExperimentSafe } from "../experimentOwnership";
import type { RemoteServerContext } from "./context";
import { prepareHostWorktree } from "./hostWorktreeLifecycle";
import { commandOutcomeUncertainAfterEffect, runRemoteCommand } from "./remoteCommandIdempotency";
import { ensureRemoteThreadRunning } from "./threadCommands";

function requireMoveSource(threadId: string): { thread: Thread; project: Project } {
  const thread = dbGetThread(threadId);
  if (!thread || thread.archived || thread.worktreePath || isHomeProjectId(thread.projectId)) {
    throw new Error("Choose a non-archived thread in a Git project's main checkout.");
  }
  if (thread.status === "launching") throw new Error("Wait for the thread to finish starting.");
  const project = dbGetProject(thread.projectId);
  if (!project) throw new Error("The thread's project no longer exists.");
  assertRemoteThreadStartExperimentSafe(threadId);
  dbAssertNoRunningCheckpointRevert([threadId]);
  if (dbGetUnresolvedThreadWorkspaceGrantOperation(threadId)) {
    throw new Error("Reconcile the thread's pending workspace access change before moving it.");
  }
  return { thread, project };
}

async function reopenAtCurrentCheckout(
  ctx: RemoteServerContext,
  threadId: string,
  assertLaunchCurrent: () => void,
): Promise<boolean> {
  try {
    assertLaunchCurrent();
    await ensureRemoteThreadRunning(ctx, threadId, DEFAULT_TERMINAL_SIZE, {
      skipThreadMutation: true,
      assertLaunchCurrent,
    });
    return true;
  } catch (error) {
    console.warn("[app-controls] thread could not be reopened after a worktree move:", error);
    return false;
  }
}

export function moveHostThreadToWorktree(
  ctx: RemoteServerContext,
  input: MoveThreadToWorktreeInput,
): Promise<MoveThreadToWorktreeResult> {
  const { threadId, withChanges, operationKey } = input;
  const { runThreadMutation, captureThreadControlState } = ctx.options;
  if (!runThreadMutation || !captureThreadControlState) {
    throw new Error("The owning host cannot coordinate thread moves.");
  }

  return runRemoteCommand({
    commandId: `app-controls:move-thread:${operationKey}`,
    route: "app-controls:move_thread_to_worktree",
    principalId: "app-controls",
    requestPayload: input,
    operation: (markDispatched) =>
      runThreadMutation(threadId, async () => {
        const source = requireMoveSource(threadId);
        const { project } = source;
        // Our confirmed close advances the control epoch once. Any additional
        // advance since admission cancels the move's automatic reopen.
        const controlIsCurrent = captureThreadControlState(threadId, 1);
        const assertSourceCurrent = () => {
          const current = requireMoveSource(threadId);
          if (
            current.project.id !== project.id ||
            current.thread.createdAt !== source.thread.createdAt ||
            !hasSameProjectExecutionScope(current.project, project)
          ) {
            throw new Error("The thread's source project changed during the move.");
          }
        };
        const placement = ctx.options.resolveWorktreePlacement?.(project.location);
        const copyIgnoredPatterns = project.scripts?.worktreeCopyPatterns;
        const branch = generateWorktreeBranch();
        const wantsReopen = source.thread.status !== "inactive";
        const git = await ctx.options.callSupervisor("getGitStatus", {
          projectLocation: project.location,
        });
        if (!git.isRepo) throw new Error("The thread's project is outside a Git repository.");
        assertSourceCurrent();
        markDispatched();
        const { confirmed } = await ctx.options.callSupervisor("closeThreadConfirmed", {
          threadId,
        });
        const assertReopenAllowed = () => {
          if (!controlIsCurrent()) throw new Error("A newer thread control cancelled reopening.");
        };
        if (!confirmed) throw new Error("The original runtime's exit could not be confirmed.");
        assertSourceCurrent();
        const created = await ctx.options
          .callSupervisor("gitAddWorktree", {
            projectLocation: project.location,
            branch,
            createBranch: true,
            transferUncommitted: withChanges,
            keepChangesInSource: false,
            ...(placement?.root ? { worktreeRoot: placement.root } : {}),
            ...(placement?.omitRepoDir ? { worktreeOmitRepoDir: true } : {}),
            ...(copyIgnoredPatterns?.length ? { copyIgnoredPatterns } : {}),
          })
          .catch(async (error: unknown) => {
            // Creating a clean checkout leaves the original working files intact.
            // With transfer, an uncertain Git outcome can leave them in the stash.
            const recovered =
              !withChanges &&
              wantsReopen &&
              controlIsCurrent() &&
              (await reopenAtCurrentCheckout(ctx, threadId, () => {
                assertReopenAllowed();
                assertSourceCurrent();
              }));
            console.warn("[app-controls] worktree creation was not confirmed:", error);
            const recovery = recovered
              ? "The thread was reopened in its source checkout."
              : "Check the original thread and any stashed changes before reopening.";
            throw commandOutcomeUncertainAfterEffect(
              new Error(`Could not confirm creation of worktree for branch ${branch}. ${recovery}`),
            );
          });
        const worktreePath = created.path;
        const checkout = {
          threadId,
          worktreePath,
          branch,
          ...(created.changesTransferred !== undefined
            ? { changesTransferred: created.changesTransferred }
            : {}),
        };
        try {
          assertSourceCurrent();
          if (
            !dbAssignMainThreadWorktree({
              threadId,
              projectId: project.id,
              worktreePath,
              worktreeBranch: branch,
            })
          ) {
            throw new Error("The thread is no longer in its original checkout.");
          }
        } catch (error) {
          console.warn("[app-controls] worktree created but failed to assign thread:", error);
          return {
            ...checkout,
            outcome: "checkout_created",
            runtime: "not_reopened",
            note: "The checkout was created and kept. The thread assignment did not complete.",
          };
        }
        try {
          ctx.publishThreadsChanged([threadId]);
        } catch (error) {
          console.warn("[app-controls] moved thread catalog publication failed:", error);
        }
        const command = {
          kind: "prepare-worktree",
          threadId,
          projectId: project.id,
          worktreePath,
        } satisfies RemoteThreadCommand;
        try {
          await prepareHostWorktree(ctx, { projectId: project.id, worktreePath });
          await ctx.options.dispatchThreadCommand?.(command);
        } catch (error) {
          console.warn("[app-controls] moved thread worktree setup or projection failed:", error);
        }
        let runtime: MoveThreadToWorktreeResult["runtime"] = "not_reopened";
        if (wantsReopen && controlIsCurrent()) {
          const reopened = await reopenAtCurrentCheckout(ctx, threadId, () => {
            assertReopenAllowed();
            assertRemoteThreadStartExperimentSafe(threadId);
            const latest = dbGetThread(threadId);
            const latestProject =
              latest?.projectId === project.id ? dbGetProject(project.id) : null;
            if (
              !latestProject ||
              !hasSameProjectExecutionScope(latestProject, project) ||
              latest?.createdAt !== source.thread.createdAt ||
              latest?.worktreePath !== worktreePath ||
              latest.archived
            ) {
              throw new Error("The thread's checkout changed before it could be reopened.");
            }
          });
          runtime = reopened ? "reopened" : "reopen_unconfirmed";
        }
        return { ...checkout, outcome: "moved", runtime };
      }),
  });
}
