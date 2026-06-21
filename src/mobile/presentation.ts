import type { Thread, ThreadStatus } from "@/shared/contracts";

export type StatusTone = "working" | "attention" | "danger" | "success" | "idle";

export function threadStatusTone(status: ThreadStatus): StatusTone {
  if (status === "working" || status === "launching") return "working";
  if (status === "needs_approval" || status === "needs_reply") return "attention";
  if (status === "error") return "danger";
  if (status === "finished") return "success";
  return "idle";
}

export const THREAD_STATUS_LABELS: Record<ThreadStatus, string> = {
  inactive: "Inactive",
  launching: "Launching",
  working: "Working",
  idle: "Idle",
  finished: "Finished",
  needs_approval: "Needs approval",
  needs_reply: "Needs reply",
  error: "Error",
};

export function sortThreadsByRecency(threads: readonly Thread[]): Thread[] {
  return threads
    .filter((thread) => !thread.archived)
    .slice()
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}
