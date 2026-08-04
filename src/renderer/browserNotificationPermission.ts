export const BROWSER_NOTIFICATION_PERMISSION_CHANGED_EVENT =
  "poracode:browser-notification-permission-changed";

const WEB_PUSH_ACTIVE_KEY = "poracode.webPushRegistrationActive";

/** Request permission from a user gesture and notify the PWA lifecycle. */
export function requestBrowserNotificationPermission(): Promise<NotificationPermission> {
  const request = Notification.requestPermission();
  void request.then(() => {
    window.dispatchEvent(new Event(BROWSER_NOTIFICATION_PERMISSION_CHANGED_EVENT));
  });
  return request;
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
