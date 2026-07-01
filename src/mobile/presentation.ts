import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { Thread, ThreadStatus } from "@/shared/contracts";

export type StatusTone = "working" | "attention" | "danger" | "moonlight" | "active" | "inactive";

/**
 * Thread status → dot color, replicating the desktop provider-icon palette
 * (see src/renderer/components/providers/statusTone.ts + its CSS): working is
 * green (desktop `--working-tone` resolves to `--success`), finished is the
 * moonlight blue-violet, an idle-but-ready thread is white, and a dormant one
 * is grey. Attention (needs approval/reply) is yellow; errors are red.
 */
export function threadStatusTone(status: ThreadStatus): StatusTone {
  if (status === "working" || status === "launching") return "working";
  if (status === "needs_approval" || status === "needs_reply") return "attention";
  if (status === "error") return "danger";
  if (status === "finished") return "moonlight";
  if (status === "idle") return "active";
  return "inactive";
}

export const THREAD_STATUS_LABELS: Record<ThreadStatus, MessageDescriptor> = {
  inactive: msg`Inactive`,
  launching: msg`Launching`,
  working: msg`Working`,
  idle: msg`Idle`,
  finished: msg`Finished`,
  needs_approval: msg`Needs approval`,
  needs_reply: msg`Needs reply`,
  error: msg`Error`,
};

export function sortThreadsByRecency(threads: readonly Thread[]): Thread[] {
  return threads
    .filter((thread) => !thread.archived)
    .slice()
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}
