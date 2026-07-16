import { toast } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import type { Thread, ThreadAttention, ThreadStatus } from "@/shared/contracts";
import { openThread } from "@/renderer/actions/threadActions";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { isRemoteSession, readBridge } from "@/renderer/bridge";
import { i18n } from "@/renderer/i18n/i18n";

type NotificationCategory = "done" | "needsAttention" | "error";

const TOAST_VARIANT_BY_CATEGORY: Record<NotificationCategory, "success" | "warning" | "danger"> = {
  done: "success",
  needsAttention: "warning",
  error: "danger",
};

const ACTIVE_STATUSES: ReadonlySet<ThreadStatus> = new Set([
  "working",
  "needs_approval",
  "needs_reply",
  "launching",
]);

type SupervisorThreadStateEvent = {
  type: "thread-state";
  threadId: string;
  status: ThreadStatus;
  attention: ThreadAttention;
};

const NOTIFICATION_SOUND_URL = "./notification.mp3";

let audio: HTMLAudioElement | null = null;

function getNotificationAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio(NOTIFICATION_SOUND_URL);
    audio.volume = 0.4;
  }
  return audio;
}

function classifyTransition(
  oldStatus: ThreadStatus,
  newStatus: ThreadStatus,
  newAttention: ThreadAttention,
): NotificationCategory | null {
  if (newStatus === "error") return "error";

  if (
    newStatus === "needs_approval" ||
    newStatus === "needs_reply" ||
    newAttention === "needs_approval" ||
    newAttention === "needs_reply"
  ) {
    return "needsAttention";
  }

  if (ACTIVE_STATUSES.has(oldStatus) && (newStatus === "idle" || newStatus === "finished")) {
    return "done";
  }

  return null;
}

function isThreadInActivePanes(threadId: string): boolean {
  const view = useAppStore.getState().view;
  return view.kind === "thread" && view.panes.includes(threadId);
}

function getProjectName(projectId: string): string {
  const project = useAppStore.getState().projects.find((p) => p.id === projectId);
  return project?.name ?? i18n._(msg`Unknown project`);
}

function getStatusDetail(category: NotificationCategory, status: ThreadStatus): string {
  switch (category) {
    case "done":
      return status === "finished"
        ? i18n._(msg`Finished · Waiting for your input`)
        : i18n._(msg`Done · Waiting for your input`);
    case "needsAttention":
      return status === "needs_approval"
        ? i18n._(msg`Needs Attention · Approval required`)
        : i18n._(msg`Needs Attention · Reply required`);
    case "error":
      return i18n._(msg`Error · Agent encountered an error`);
  }
}

function playSound(): void {
  const settings = useSharedSettings.getState();
  if (!settings.notificationSound) return;

  try {
    void getNotificationAudio().play();
  } catch {
    /* requires user gesture */
  }
}

function showToastNotification(
  threadId: string,
  projectName: string,
  threadTitle: string,
  category: NotificationCategory,
  status: ThreadStatus,
): void {
  const variant = TOAST_VARIANT_BY_CATEGORY[category];
  const detail = getStatusDetail(category, status);

  const open = () => {
    openThread(threadId, { focusComposer: true });
    toast.close(toastId);
  };

  const toastId = toast[variant](projectName, {
    actionProps: {
      children: i18n._(msg`Open`),
      onPress: open,
      variant: "secondary",
    },
    description: `${threadTitle}\n${detail}`,
    onPress: open,
    timeout: 6000,
  } as any);
  playSound();
}

function canUseBrowserNotifications(): boolean {
  if (typeof Notification === "undefined") return false;
  return Notification.permission !== "denied";
}

let permissionRequest: Promise<NotificationPermission> | null = null;

function ensureBrowserNotificationPermission(): Promise<NotificationPermission> {
  if (Notification.permission !== "default") {
    return Promise.resolve(Notification.permission);
  }
  if (!permissionRequest) {
    permissionRequest = Notification.requestPermission();
  }
  return permissionRequest;
}

function showBrowserNotification(
  threadId: string,
  projectName: string,
  threadTitle: string,
  category: NotificationCategory,
  status: ThreadStatus,
): void {
  if (!canUseBrowserNotifications()) return;

  const detail = getStatusDetail(category, status);
  const body = `${threadTitle}\n${detail}`;

  const show = () => {
    try {
      const native = new Notification(projectName, {
        body,
        silent: true,
      });
      native.onclick = () => {
        void readBridge().focusWindow();
        openThread(threadId, { focusComposer: true });
        native.close();
      };
    } catch {
      /* unsupported in some browsers */
    }
  };

  if (Notification.permission === "granted") {
    show();
  } else {
    void ensureBrowserNotificationPermission().then((perm) => {
      if (perm === "granted") show();
    });
  }

  playSound();
}

// Native (OS) notifications are created in the main process via Electron's
// Notification API rather than the renderer's Web Notification API. The Web API
// is gated by Chromium's per-session permission handler (see
// src/main/browser/permissions.ts), which denies "notifications" and would force
// Notification.permission to "denied"; the main-process API bypasses that layer
// entirely. The renderer still owns the decision and the localized strings, and
// reacts to clicks through the source-neutral thread-open request event.
function showElectronNotification(
  threadId: string,
  projectName: string,
  threadTitle: string,
  category: NotificationCategory,
  status: ThreadStatus,
): void {
  const detail = getStatusDetail(category, status);
  const body = `${threadTitle}\n${detail}`;

  void readBridge()
    .showNotification({ title: projectName, body, threadId })
    .then((shown) => {
      if (shown) playSound();
    })
    .catch(() => undefined);
}

function showNativeNotification(
  threadId: string,
  projectName: string,
  threadTitle: string,
  category: NotificationCategory,
  status: ThreadStatus,
): void {
  if (isRemoteSession()) {
    showBrowserNotification(threadId, projectName, threadTitle, category, status);
    return;
  }
  showElectronNotification(threadId, projectName, threadTitle, category, status);
}

export function handleThreadStateNotification(
  event: SupervisorThreadStateEvent,
  oldThread: Thread | undefined,
  newThread?: Pick<Thread, "status" | "attention">,
): void {
  const settings = useSharedSettings.getState();

  if (!settings.notificationsEnabled) return;
  if (!oldThread) return;

  const newStatus = newThread?.status ?? event.status;
  const newAttention = newThread?.attention ?? event.attention;

  if (oldThread.status === newStatus) return;

  const category = classifyTransition(oldThread.status, newStatus, newAttention);
  if (!category) return;

  if (!settings.notificationStatuses[category]) return;

  if (!settings.notifyL2Cli && oldThread.threadStatusSource === "terminal_parse") return;

  const projectName = getProjectName(oldThread.projectId);
  const threadId = oldThread.id;
  const threadTitle = oldThread.title;

  if (!document.hasFocus()) {
    showNativeNotification(threadId, projectName, threadTitle, category, newStatus);
    return;
  }

  if (settings.notificationFilter === "all") {
    if (isThreadInActivePanes(threadId)) return;
    showToastNotification(threadId, projectName, threadTitle, category, newStatus);
  }
}

export function shouldInspectThreadStateForNotification(): boolean {
  const settings = useSharedSettings.getState();

  if (!settings.notificationsEnabled) return false;
  if (
    !settings.notificationStatuses.done &&
    !settings.notificationStatuses.needsAttention &&
    !settings.notificationStatuses.error
  ) {
    return false;
  }

  const focused = typeof document !== "undefined" && document.hasFocus();
  if (focused && settings.notificationFilter !== "all") return false;

  return true;
}
