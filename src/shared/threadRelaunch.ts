import type { ProjectLocation, TerminalSize, Thread } from "./contracts";
import type { StartRemoteThreadInput } from "./remote/client";

/**
 * Reopening a thread on its host relaunches it with an empty prompt. Only an
 * INACTIVE thread qualifies: every other status means the host session is
 * either alive (`launching`/`idle`/`working`/`finished` — and host-side
 * startThread is close+restart, so firing it at a live session would kill the
 * run) or intentionally stopped (`error` — a prompt-less relaunch would replay
 * the broken turn, and a failed relaunch lands back on `error`, so the thread
 * waits for an explicit prompt instead of an open-driven retry loop).
 *
 * Both clients gate on this one rule before relaunching: the desktop renderer
 * in `reopenStoredThread`, the mobile PWA in `ensureThreadRunning`.
 */
export function shouldRelaunchThreadOnOpen(thread: Pick<Thread, "status">): boolean {
  return thread.status === "inactive";
}

/**
 * The empty-prompt relaunch payload both clients send for an inactive thread.
 * The desktop renderer produces this same object in
 * `performInitialThreadLaunch` (its reopen case carries an empty prompt and no
 * segments/userMessageItemId); the mobile PWA builds it here directly. The
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
