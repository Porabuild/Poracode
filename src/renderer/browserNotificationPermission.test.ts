import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BROWSER_NOTIFICATION_PERMISSION_CHANGED_EVENT,
  requestBrowserNotificationPermission,
} from "./browserNotificationPermission";

function installNotification(
  permission: NotificationPermission,
  requestPermission: () => Promise<NotificationPermission>,
): void {
  class FakeNotification {
    static permission = permission;
    static requestPermission = vi.fn<() => Promise<NotificationPermission>>(requestPermission);
  }
  vi.stubGlobal("Notification", FakeNotification);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestBrowserNotificationPermission", () => {
  it("resolves the granted permission and dispatches the change event", async () => {
    const dispatch = vi.spyOn(window, "dispatchEvent");
    installNotification("default", () => Promise.resolve("granted"));

    await expect(requestBrowserNotificationPermission()).resolves.toBe("granted");

    expect(
      dispatch.mock.calls.some(
        ([event]) => (event as Event).type === BROWSER_NOTIFICATION_PERMISSION_CHANGED_EVENT,
      ),
    ).toBe(true);
  });

  it("treats a rejected request as undecided instead of rejecting", async () => {
    installNotification("default", () =>
      Promise.reject(new DOMException("denied", "NotAllowedError")),
    );

    await expect(requestBrowserNotificationPermission()).resolves.toBe("default");
  });

  it("treats a synchronous throw as undecided", async () => {
    installNotification("default", () => {
      throw new DOMException("denied", "NotAllowedError");
    });

    await expect(requestBrowserNotificationPermission()).resolves.toBe("default");
  });
});
