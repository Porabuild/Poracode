import { Notification, type BrowserWindow } from "electron";
import { IPC_EVENT_CHANNELS } from "@/shared/ipc";
import type { ShowNotificationPayload } from "@/shared/ipc/schemas";
import { showAndFocusWindow } from "./window/showAndFocusWindow";

// Electron's Notification is a thin JS wrapper over a native object. If the
// wrapper is garbage-collected before the user interacts, its "click" listener
// is lost and the click never routes back to the renderer. Retain each shown
// notification until it is closed, fails, or is clicked.
const liveNotifications = new Set<Notification>();

/**
 * Show an OS notification from the main process. This uses Electron's native
 * Notification API, which — unlike the renderer's Web Notification API — is not
 * gated by Chromium's per-session permission handler, so it works regardless of
 * the app's `setPermissionCheckHandler` policy. Clicking the notification
 * focuses the main window and asks the renderer to open the originating thread.
 */
export function showOsNotification(
  payload: ShowNotificationPayload,
  getMainWindow: () => BrowserWindow | null,
): boolean {
  if (!Notification.isSupported()) return false;

  let notification: Notification;
  try {
    notification = new Notification({
      title: payload.title,
      body: payload.body,
      // The renderer plays its own notification sound; keep the OS notification
      // silent so the two don't double up.
      silent: true,
    });
  } catch {
    return false;
  }
  liveNotifications.add(notification);

  const release = (): void => {
    liveNotifications.delete(notification);
  };
  notification.on("close", release);
  notification.on("failed", release);
  notification.on("click", () => {
    release();
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;
    showAndFocusWindow(win);
    win.webContents.send(IPC_EVENT_CHANNELS.threadOpenRequested, {
      threadId: payload.threadId,
      source: "notification",
    });
  });

  try {
    notification.show();
  } catch {
    release();
    return false;
  }
  return true;
}
