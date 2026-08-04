// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RemotePushRegistration } from "@/shared/remote";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import { syncWebPushRegistration, unregisterWebPush } from "./webPushRegistration";

vi.mock("../pwaInstall", () => ({ isStandaloneDisplay: () => true }));

function subscription(applicationServerKey = new Uint8Array([1, 2, 3]).buffer) {
  return {
    options: { applicationServerKey },
    toJSON: () => ({
      endpoint: "https://web.push.apple.com/subscription-1",
      expirationTime: null,
      keys: { p256dh: "p256dh-key", auth: "auth-key" },
    }),
    unsubscribe: vi.fn<() => Promise<boolean>>(async () => true),
  } as unknown as PushSubscription;
}

describe("web Push API registration", () => {
  let currentSubscription: PushSubscription | null;
  let subscribe: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("PushManager", class {});
    vi.stubGlobal("Notification", { permission: "granted" });
    currentSubscription = subscription();
    subscribe = vi.fn<(options?: PushSubscriptionOptionsInit) => Promise<PushSubscription>>(
      async () => subscription(),
    );
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: vi.fn<() => Promise<PushSubscription | null>>(
              async () => currentSubscription,
            ),
            subscribe,
          },
        }),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "serviceWorker");
  });

  it("reuses the browser subscription and registers it with the desktop", async () => {
    const client = {
      webPushConfig: vi.fn<() => Promise<{ publicKey: string }>>(async () => ({
        publicKey: "AQID",
      })),
      registerPush: vi.fn<(registration: RemotePushRegistration) => Promise<void>>(async () => {}),
    } as unknown as RemoteDesktopClient;

    await expect(syncWebPushRegistration(client, { deviceId: "browser-1234" })).resolves.toBe(true);

    expect(subscribe).not.toHaveBeenCalled();
    expect(client.registerPush).toHaveBeenCalledWith({
      deviceId: "browser-1234",
      platform: "web",
      webPushSubscription: {
        endpoint: "https://web.push.apple.com/subscription-1",
        expirationTime: null,
        keys: { p256dh: "p256dh-key", auth: "auth-key" },
      },
      webAppBasePath: "/",
    });
    expect(localStorage.getItem("poracode.webPushRegistrationActive")).toBe("1");
  });

  it("replaces a subscription created with an old VAPID key", async () => {
    const old = subscription(new Uint8Array([9]).buffer);
    currentSubscription = old;
    const client = {
      webPushConfig: vi.fn<() => Promise<{ publicKey: string }>>(async () => ({
        publicKey: "AQID",
      })),
      registerPush: vi.fn<(registration: RemotePushRegistration) => Promise<void>>(async () => {}),
    } as unknown as RemoteDesktopClient;

    await syncWebPushRegistration(client, { deviceId: "browser-1234" });

    expect(old.unsubscribe).toHaveBeenCalledOnce();
    expect(subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: new Uint8Array([1, 2, 3]),
    });
  });

  it("retries the transient iOS permission propagation failure", async () => {
    vi.useFakeTimers();
    try {
      currentSubscription = null;
      subscribe
        .mockRejectedValueOnce(new DOMException("Permission has not propagated", "NotAllowedError"))
        .mockResolvedValueOnce(subscription());
      const client = {
        webPushConfig: vi.fn<() => Promise<{ publicKey: string }>>(async () => ({
          publicKey: "AQID",
        })),
        registerPush: vi.fn<(registration: RemotePushRegistration) => Promise<void>>(
          async () => {},
        ),
      } as unknown as RemoteDesktopClient;

      const registration = syncWebPushRegistration(client, { deviceId: "browser-1234" });
      await vi.waitFor(() => expect(subscribe).toHaveBeenCalledOnce());
      await vi.advanceTimersByTimeAsync(250);

      await expect(registration).resolves.toBe(true);
      expect(subscribe).toHaveBeenCalledTimes(2);
      expect(client.registerPush).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not retry a permanent subscription error", async () => {
    currentSubscription = null;
    const error = new DOMException("Invalid application server key", "InvalidAccessError");
    subscribe.mockRejectedValueOnce(error);
    const client = {
      webPushConfig: vi.fn<() => Promise<{ publicKey: string }>>(async () => ({
        publicKey: "AQID",
      })),
    } as unknown as RemoteDesktopClient;

    await expect(syncWebPushRegistration(client, { deviceId: "browser-1234" })).rejects.toBe(error);
    expect(subscribe).toHaveBeenCalledOnce();
  });

  it("unregisters both the desktop record and browser subscription", async () => {
    const client = {
      unregisterPush: vi.fn<(deviceId: string) => Promise<void>>(async () => {}),
    } as unknown as RemoteDesktopClient;
    localStorage.setItem("poracode.webPushRegistrationActive", "1");

    await unregisterWebPush(client, "browser-1234");

    expect(client.unregisterPush).toHaveBeenCalledWith("browser-1234");
    expect(currentSubscription?.unsubscribe).toHaveBeenCalledOnce();
    expect(localStorage.getItem("poracode.webPushRegistrationActive")).toBeNull();
  });
});
