import type { IPty } from "node-pty";
import type { ProjectLocation, RuntimeEvent } from "@/shared/contracts";
import type { SessionRuntime } from "../sessionTypes";

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
