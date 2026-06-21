import type { Thread } from "@/shared/contracts";

export type StatusTone =
  | "inactive"
  | "active"
  | "working"
  | "finished"
  | "error"
  | "attention"
  | "done";

export function getStatusTone(
  thread: Pick<Thread, "status" | "done">,
  opts?: { hasLiveWorkflow?: boolean },
): StatusTone {
  if (thread.done) {
    return "done";
  }

  if (thread.status === "error") {
    return "error";
  }

  if (thread.status === "needs_approval" || thread.status === "needs_reply") {
    return "attention";
  }

  if (thread.status === "working") {
    return "working";
  }

  // A live background workflow keeps a settled thread visually working without
  // changing `thread.status`. Keep it below error/attention and do not mask an
  // explicitly inactive thread.
  if (opts?.hasLiveWorkflow && (thread.status === "idle" || thread.status === "finished")) {
    return "working";
  }

  if (thread.status === "finished") {
    return "finished";
  }

  if (thread.status === "idle") {
    return "active";
  }

  return "inactive";
}
