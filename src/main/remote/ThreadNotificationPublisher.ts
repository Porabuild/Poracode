import type { Thread, ThreadStatus } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import {
  classifyThreadNotification,
  shouldPublishThreadNotification,
  type UserNotification,
} from "@/shared/threadNotification";

export interface ThreadNotificationPublisherOptions {
  getThread(threadId: string): Thread | null;
  getProjectName(projectId: string): string;
  getSettings(): {
    readonly notificationsEnabled: boolean;
    readonly notificationStatuses: {
      readonly done: boolean;
      readonly needsAttention: boolean;
      readonly error: boolean;
    };
    readonly notifyL2Cli: boolean;
  };
  publish(notification: UserNotification): void;
}

/**
 * Host-owned thread notification decisions. Clients only display what this
 * publisher emits; they must not re-classify supervisor `thread-state`.
 */
export class ThreadNotificationPublisher {
  private readonly lastStatusByThread = new Map<string, ThreadStatus>();

  constructor(private readonly options: ThreadNotificationPublisherOptions) {}

  handleSupervisorEvent(event: SupervisorEvent): void {
    if (event.type !== "thread-state") return;
    const previousStatus = this.lastStatusByThread.get(event.threadId);
    this.lastStatusByThread.set(event.threadId, event.status);
    if (previousStatus === undefined) return;

    const category = classifyThreadNotification(previousStatus, event.status, event.attention);
    if (!category) return;

    const thread = this.options.getThread(event.threadId);
    if (!thread) return;
    const settings = this.options.getSettings();
    if (
      !shouldPublishThreadNotification({
        category,
        notificationsEnabled: settings.notificationsEnabled,
        notificationStatuses: settings.notificationStatuses,
        notifyL2Cli: settings.notifyL2Cli,
        ...(event.forceCloseActiveTurn ? { forceCloseActiveTurn: true } : {}),
        ...(thread.threadStatusSource ? { threadStatusSource: thread.threadStatusSource } : {}),
      })
    ) {
      return;
    }

    this.options.publish({
      threadId: event.threadId,
      category,
      projectName: this.options.getProjectName(thread.projectId),
      threadTitle: thread.title,
      status: event.status,
    });
  }
}
