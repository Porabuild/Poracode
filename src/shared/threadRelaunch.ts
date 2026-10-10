import type { ProjectLocation, TerminalSize, Thread } from "./contracts";
import type { StartRemoteThreadInput } from "./remote/client";

/**
 * True when a supervisor call was rejected because the thread has no live
 * session. Every caller that can revive a thread (the renderer composer, the
 * `send_to_thread` MCP tool) branches on this to resume instead of failing.
 */
export function isUnknownThreadSessionError(error: unknown): boolean {
  return error instanceof Error && /unknown thread session/i.test(error.message);
}

/**
 * Status eligibility for an open-driven, empty-prompt relaunch. Only an
 * INACTIVE thread qualifies: every other status means the host session is
 * either alive (`launching`/`idle`/`working`/`finished` — and host-side
 * startThread is close+restart, so firing it at a live session would kill the
 * run) or stopped by a failure (`error` — an open-driven relaunch would hide
 * the failure, and a failed relaunch lands back on `error`, so the thread
 * waits for an explicit prompt instead of an open-driven retry loop).
 *
 * Callers must also apply their presentation's recovery safeguards. Desktop
 * GUI reopen requires a session reference or config-based resumability; an
 * identity-less, non-resumable saved thread stays read-only rather than silently
 * starting a fresh session under its old transcript. Explicit native mobile
 * Relaunch actions are separate from this open-driven status check.
 */
export function shouldRelaunchThreadOnOpen(thread: Pick<Thread, "status">): boolean {
  return thread.status === "inactive";
}

/**
 * The empty-prompt relaunch payload both clients send for an inactive thread.
 * The desktop renderer produces this same object in
 * `performInitialThreadLaunch` (its reopen case carries an empty prompt and no
 * segments/userMessageItemId); remote clients build it here directly. The
 * host resolves the MCP launch snapshot itself, so no client snapshot is
 * included.
 */
export function buildThreadRelaunchStartInput(input: {
  readonly thread: Pick<
    Thread,
    "id" | "agentKind" | "agentInstanceId" | "config" | "sessionRef" | "presentationMode"
  >;
  readonly projectLocation: ProjectLocation;
  readonly initialSize: TerminalSize;
}): StartRemoteThreadInput {
  const { thread } = input;
  return {
    threadId: thread.id,
    projectLocation: input.projectLocation,
    agentKind: thread.agentKind,
    ...(thread.agentInstanceId ? { agentInstanceId: thread.agentInstanceId } : {}),
    config: thread.config,
    prompt: "",
    initialSize: input.initialSize,
    ...(thread.sessionRef ? { sessionRef: thread.sessionRef } : {}),
    ...(thread.presentationMode ? { presentationMode: thread.presentationMode } : {}),
  };
}
