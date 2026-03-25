import type { Thread } from "../../../shared/contracts";

export type StatusTone = "inactive" | "active" | "working" | "error" | "attention";

export function getStatusTone(thread: Pick<Thread, "status">): StatusTone {
  if (thread.status === "error") {
    return "error";
  }

  if (thread.status === "needs_approval" || thread.status === "needs_reply") {
    return "attention";
  }

  if (thread.status === "working") {
    return "working";
  }

  if (thread.status === "idle") {
    return "active";
  }

  return "inactive";
}
