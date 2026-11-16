import { z } from "zod";
import { threadStatusSchema, type ThreadAttention, type ThreadStatus } from "./contracts";
import { threadAttentionStatus } from "./threadAttention";

export const userNotificationCategorySchema = z.enum(["done", "needsAttention", "error"]);
export type UserNotificationCategory = z.infer<typeof userNotificationCategorySchema>;

export const userNotificationSchema = z.object({
  threadId: z.string().min(1),
  category: userNotificationCategorySchema,
  projectName: z.string(),
  threadTitle: z.string(),
  status: threadStatusSchema,
});
export type UserNotification = z.infer<typeof userNotificationSchema>;

const ACTIVE_STATUSES: ReadonlySet<ThreadStatus> = new Set([
  "working",
  "needs_approval",
  "needs_reply",
  "launching",
]);

export function classifyThreadNotification(
  oldStatus: ThreadStatus,
  newStatus: ThreadStatus,
  newAttention: ThreadAttention,
  oldAttention: ThreadAttention = "none",
): UserNotificationCategory | null {
  const previous = threadAttentionStatus(oldStatus, oldAttention);
  const next = threadAttentionStatus(newStatus, newAttention);
  if (next === "error") return previous === next ? null : "error";
  if (next === "needs_approval" || next === "needs_reply") {
    return previous === next ? null : "needsAttention";
  }
  if (
    oldStatus !== newStatus &&
    ACTIVE_STATUSES.has(oldStatus) &&
    (newStatus === "idle" || newStatus === "finished")
  ) {
    return "done";
  }
  return null;
}

export function shouldPublishThreadNotification(input: {
  readonly category: UserNotificationCategory;
  readonly forceCloseActiveTurn?: boolean;
  readonly notificationsEnabled: boolean;
  readonly notificationStatuses: {
    readonly done: boolean;
    readonly needsAttention: boolean;
    readonly error: boolean;
  };
  readonly notifyL2Cli: boolean;
  readonly threadStatusSource?: string;
}): boolean {
  if (input.forceCloseActiveTurn) return false;
  if (!input.notificationsEnabled) return false;
  if (!input.notificationStatuses[input.category]) return false;
  if (!input.notifyL2Cli && input.threadStatusSource === "terminal_parse") return false;
  return true;
}
