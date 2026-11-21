export const BROWSER_NOTIFICATION_PERMISSION_CHANGED_EVENT =
  "poracode:browser-notification-permission-changed";

const WEB_PUSH_ACTIVE_KEY = "poracode.webPushRegistrationActive";

/**
 * Request permission from a user gesture and notify the PWA lifecycle.
 *
 * WebKit rejects (and can throw synchronously) when the request happens
 * outside a user gesture — for example a host event while the installed PWA
 * is in the background. This promise never rejects: callers that fire it from
 * event handlers would otherwise produce an unhandled rejection, which the
 * renderer treats as a crash.
 */
export function requestBrowserNotificationPermission(): Promise<NotificationPermission> {
  try {
    return Notification.requestPermission().then(
      (permission) => {
        window.dispatchEvent(new Event(BROWSER_NOTIFICATION_PERMISSION_CHANGED_EVENT));
        return permission;
      },
      () => Notification.permission,
    );
  } catch {
    return Promise.resolve(Notification.permission);
  }
}

export function setBrowserWebPushActive(active: boolean): void {
  try {
    if (active) {
      localStorage.setItem(WEB_PUSH_ACTIVE_KEY, "1");
    } else {
      localStorage.removeItem(WEB_PUSH_ACTIVE_KEY);
    }
  } catch {
    // Storage may be unavailable; page notifications remain a safe fallback.
  }
}

/** True after this PWA successfully registered a Push API subscription. */
export function isBrowserWebPushActive(): boolean {
  try {
    return localStorage.getItem(WEB_PUSH_ACTIVE_KEY) === "1";
  } catch {
    return false;
  }
}
