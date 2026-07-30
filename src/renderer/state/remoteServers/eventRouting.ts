import { collectRuntimeEventsFromSupervisoryMessage } from "@/renderer/state/remote";

export function shouldRefreshRemoteServerAfterEvent(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const type = (value as { type?: unknown }).type;
  return (
    type === "thread-state" ||
    type === "thread-exited" ||
    type === "thread-reset" ||
    type === "windows-agent-statuses" ||
    type === "wsl-agent-statuses" ||
    type === "remote-projects-changed" ||
    type === "remote-threads-changed"
  );
}

export function shouldRefreshRemoteAgentStatusesAfterEvent(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const type = (value as { type?: unknown }).type;
  return type === "windows-agent-statuses" || type === "wsl-agent-statuses";
}

export function filterRemoteThreadEvents(value: unknown, threadIds: ReadonlySet<string>): unknown {
  if (!value || typeof value !== "object") return null;
  const type = (value as { type?: unknown }).type;

  if (
    type === "thread-runtime-event" ||
    type === "thread-runtime-events" ||
    type === "thread-runtime-events-multi"
  ) {
    const batches = collectRuntimeEventsFromSupervisoryMessage(value).filter((batch) =>
      threadIds.has(batch.threadId),
    );
    if (batches.length === 0) return null;
    return {
      type: "thread-runtime-events-multi",
      batches: batches.map((batch) => ({ threadId: batch.threadId, events: [...batch.events] })),
    };
  }

  if (
    type === "thread-state" ||
    type === "thread-reset" ||
    type === "thread-exited" ||
    type === "thread-pending-steer" ||
    type === "thread-output" ||
    type === "thread-osc-notification" ||
    type === "thread-osc-shell"
  ) {
    const threadId = (value as { threadId?: unknown }).threadId;
    return typeof threadId === "string" && threadIds.has(threadId) ? value : null;
  }

  return null;
}

export function filterRemoteThreadEvent(value: unknown, openThreadId: string): unknown {
  return filterRemoteThreadEvents(value, new Set([openThreadId]));
}
