import type { IPty } from "node-pty";
import type { ProjectLocation, RuntimeEvent } from "@/shared/contracts";
import type { SessionRuntime } from "../sessionTypes";
import { isCompletedWithoutTurn, type StructuredTurnResult } from "../../agents/base";
import type { ThreadOutputPipeline } from "../threadOutputPipeline";

/** Settle an explicitly turnless command whose idle sync was held during startup. */
export function settleStructuredStartupWithoutTurn(
  session: SessionRuntime,
  result: void | StructuredTurnResult,
  outputPipeline: Pick<ThreadOutputPipeline, "updateState">,
): void {
  if (
    !session.ignoreExit &&
    isCompletedWithoutTurn(result) &&
    session.suppressInitialStructuredIdle === true
  ) {
    session.suppressInitialStructuredIdle = undefined;
    outputPipeline.updateState(session, "idle", "none");
  }
}

export function shouldPrimeNativeProjectShellEnv(
  location: ProjectLocation,
): location is Extract<ProjectLocation, { kind: "windows" | "posix" }> {
  return location.kind === "posix" || (process.platform === "win32" && location.kind === "windows");
}

export function hookDebugProjectLabel(loc: ProjectLocation): string {
  switch (loc.kind) {
    case "wsl":
      return `wsl:${loc.distro}`;
    case "windows":
      return `windows:${loc.path}`;
    case "posix":
      return `posix:${loc.path}`;
  }
}

/**
 * Startup idle suppression is only for empty sync blips; visible runtime output
 * or turn completion means a follow-up idle should close the optimistic working
 * window.
 */
export function shouldReleaseInitialStructuredIdleSuppression(event: RuntimeEvent): boolean {
  if (event.type === "item.started") {
    return event.itemType !== "user_message";
  }
  if (event.type === "turn.completed") {
    return true;
  }
  return (
    event.type === "content.delta" || event.type === "request.opened" || event.type === "error"
  );
}

export function stopSessionRefWatcher(
  session: Pick<SessionRuntime, "stopSessionRefWatcher">,
): void {
  session.stopSessionRefWatcher?.();
  session.stopSessionRefWatcher = undefined;
}

/**
 * Detach any live structured handle and clear negotiated config inventory when
 * the backing structured transport has closed or is being retired.
 */
export function retireStructuredSessionState(
  session: Pick<SessionRuntime, "structuredSession" | "sessionConfigOptions">,
): boolean {
  const inventoryRetired = session.sessionConfigOptions !== null;
  session.structuredSession = undefined;
  session.sessionConfigOptions = null;
  return inventoryRetired;
}

/** Fence late callbacks/timers/ref-watchers before tearing down or replacing a session. */
export function fenceSessionForRetirement(
  session: SessionRuntime,
  outputPipeline: Pick<ThreadOutputPipeline, "clearSessionTimers">,
): void {
  session.ignoreExit = true;
  outputPipeline.clearSessionTimers(session);
  stopSessionRefWatcher(session);
}

export function requireSessionPty(session: SessionRuntime): IPty {
  if (!session.pty) {
    throw new Error(`Thread ${session.threadId} does not have a terminal PTY.`);
  }
  return session.pty;
}

export function subAgentKey(threadId: string, parentItemId: string): string {
  return `${threadId}\0${parentItemId}`;
}

export function childKey(threadId: string, itemId: string): string {
  return `${threadId}\0${itemId}`;
}
