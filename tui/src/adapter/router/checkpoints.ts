import { isHomeProjectId } from "@/shared/homeScope";
import { resolveProjectLocation } from "@/shared/worktree";
import { logAdapterDebug } from "../diagnostics";
import { record } from "./helpers";
import type { RouterContext } from "./context";

/** File-checkpoint capture + post-turn reconcile/finalize bookkeeping. */
export function createCheckpoints(ctx: RouterContext) {
  const captureFileCheckpoint = async (
    rawThreadId: string,
    checkpointItemId: string | undefined,
    projectLocation: unknown,
  ) => {
    if (!checkpointItemId) return;
    const currentProject = await ctx.resolveProject();
    if (isHomeProjectId(currentProject.id)) return;
    try {
      await ctx.input.client.callRemoteProcedure("createFileCheckpoint", {
        threadId: rawThreadId,
        checkpointItemId,
        projectLocation,
      });
      let captured = ctx.capturedCheckpoints.get(rawThreadId);
      if (!captured) {
        captured = new Set();
        ctx.capturedCheckpoints.set(rawThreadId, captured);
      }
      captured.add(checkpointItemId);
      if (ctx.debug)
        void logAdapterDebug(ctx.input.bootstrap.home, {
          source: "checkpoint.create",
          threadId: rawThreadId,
          checkpointItemId,
        });
    } catch (error) {
      if (ctx.debug)
        void logAdapterDebug(ctx.input.bootstrap.home, {
          source: "file-checkpoint.create",
          threadId: rawThreadId,
          checkpointItemId,
          error: error instanceof Error ? error.message : String(error),
        });
    }
  };
  // Desktop parity: after any turn completes, finalize every completed turn
  // whose anchor lacks a checkpoint — hydrating from the host's checkpoint
  // list, not just what this adapter captured in-session.
  const reconcileCheckpoints = async (rawThreadId: string): Promise<number> => {
    if (ctx.reconciling.has(rawThreadId)) return 0;
    ctx.reconciling.add(rawThreadId);
    try {
      const currentProject = await ctx.resolveProject();
      if (isHomeProjectId(currentProject.id)) return 0;
      const remoteThread = await ctx.cachedThreadById(rawThreadId);
      const projectLocation = resolveProjectLocation(
        currentProject.location,
        remoteThread?.worktreePath,
      );
      const [listed, completedTurns] = await Promise.all([
        ctx.input.client.callRemoteProcedure("listFileCheckpoints", {
          threadId: rawThreadId,
          projectLocation,
        }),
        ctx.input.client.threadCompletedTurns(rawThreadId),
      ]);
      const listedRecords = record(listed);
      const checkpointRows = Array.isArray(listedRecords.checkpoints)
        ? listedRecords.checkpoints
        : [];
      const turnRows = Array.isArray(listedRecords.turns) ? listedRecords.turns : [];
      const capturedBases = new Set(
        checkpointRows.map((value) => String(record(value).checkpointItemId ?? "")),
      );
      const finalizedAnchorsHost = new Set(
        turnRows.map((value) => String(record(value).checkpointItemId ?? "")),
      );
      // Completed turns whose anchor is not yet finalized locally or on the
      // host. When nothing is pending the item listing never runs — turns are
      // frequent and pages are the expensive part.
      const candidates = completedTurns
        .map((turn) => (turn as { anchorItemId?: string | null }).anchorItemId)
        .filter(
          (anchor): anchor is string =>
            typeof anchor === "string" &&
            !ctx.finalizedAnchors.has(`${rawThreadId}${anchor}`) &&
            !finalizedAnchorsHost.has(anchor) &&
            !ctx.uncapturableAnchors.has(`${rawThreadId}${anchor}`),
        );
      if (candidates.length === 0) return 0;
      // Page newest-first only until every candidate anchor and the preceding
      // user_message (its checkpoint base) is seen — anchors sit near the
      // tail, so the latest page almost always suffices.
      const unresolved = new Set(candidates);
      const awaitingBase = new Set<string>();
      const bases = new Map<string, string>();
      let beforePosition: number | undefined;
      for (
        let pageIndex = 0;
        pageIndex < 200 && (unresolved.size > 0 || awaitingBase.size > 0);
        pageIndex += 1
      ) {
        const page = await ctx.input.client.threadRuntimeItemsPage({
          threadId: rawThreadId,
          ...(beforePosition !== undefined ? { beforePosition } : {}),
          limit: 500,
        });
        for (let index = page.items.length - 1; index >= 0; index -= 1) {
          const item = page.items[index]!;
          if (unresolved.delete(item.id)) awaitingBase.add(item.id);
          if (item.type === "user_message" && awaitingBase.size > 0) {
            for (const anchor of awaitingBase) bases.set(anchor, item.id);
            awaitingBase.clear();
          }
        }
        if (page.nextCursor == null) break;
        beforePosition = page.nextCursor;
      }
      let finalized = 0;
      for (const anchor of candidates) {
        const key = `${rawThreadId}${anchor}`;
        const base = bases.get(anchor);
        if (!base) continue;
        if (!capturedBases.has(base)) {
          ctx.uncapturableAnchors.add(key);
          continue;
        }
        ctx.finalizedAnchors.add(key);
        try {
          await ctx.input.client.callRemoteProcedure("finalizeFileCheckpoint", {
            threadId: rawThreadId,
            checkpointItemId: anchor,
            baseCheckpointItemId: base,
            projectLocation,
          });
          finalized += 1;
          ctx.capturedCheckpoints.get(rawThreadId)?.delete(base);
          if (ctx.debug)
            void logAdapterDebug(ctx.input.bootstrap.home, {
              source: "checkpoint.finalize",
              threadId: rawThreadId,
              anchorItemId: anchor,
              baseCheckpointItemId: base,
            });
        } catch (error) {
          ctx.finalizedAnchors.delete(key);
          if (ctx.debug)
            void logAdapterDebug(ctx.input.bootstrap.home, {
              source: "checkpoint.finalize",
              threadId: rawThreadId,
              error: error instanceof Error ? error.message : String(error),
            });
        }
      }
      return finalized;
    } catch (error) {
      if (ctx.debug)
        void logAdapterDebug(ctx.input.bootstrap.home, {
          source: "checkpoint.reconcile",
          threadId: rawThreadId,
          error: error instanceof Error ? error.message : String(error),
        });
      return 0;
    } finally {
      ctx.reconciling.delete(rawThreadId);
    }
  };
  // completedTurns lags turn.completed — retry briefly until the new anchor
  // shows up. Retries only run while this adapter still has a captured
  // checkpoint awaiting its finalize; nothing pending means a single pass.
  const scheduleCheckpointReconcile = (rawThreadId: string) => {
    void (async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await reconcileCheckpoints(rawThreadId);
        if ((ctx.capturedCheckpoints.get(rawThreadId)?.size ?? 0) === 0) return;
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    })();
  };
  return { captureFileCheckpoint, reconcileCheckpoints, scheduleCheckpointReconcile };
}
