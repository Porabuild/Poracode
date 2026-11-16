import type { ThreadAttention, ThreadStatus } from "./contracts/common";

/** Display/alert state; execution and turn accounting keep the original status. */
export function threadAttentionStatus(
  status: ThreadStatus,
  attention: ThreadAttention | undefined,
): ThreadStatus {
  if (status === "error" || status === "inactive" || status === "launching") return status;
  if (status === "needs_approval" || attention === "needs_approval") return "needs_approval";
  if (status === "needs_reply" || attention === "needs_reply") return "needs_reply";
  return status;
}
