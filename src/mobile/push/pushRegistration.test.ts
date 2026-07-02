import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Handle = { remove: () => Promise<void> };
type RegistrationHandler = (token: { value: string }) => void;

/** Captured "registration" listeners, so a test can deliver a token to them. */
const registrationHandlers: RegistrationHandler[] = [];

vi.mock("@capacitor/push-notifications", () => ({
  PushNotifications: {
    requestPermissions: vi.fn<() => Promise<{ receive: string }>>(async () => ({
      receive: "granted",
    })),
    register: vi.fn<() => Promise<void>>(async () => {}),
    addListener: vi.fn<(event: string, handler: RegistrationHandler) => Promise<Handle>>(
      async (event, handler) => {
        if (event === "registration") registrationHandlers.push(handler);
        return { remove: async () => {} };
      },
    ),
  },
}));
vi.mock("@lightcode/activity-bridge", () => ({
  ActivityBridge: {
    isSupported: vi.fn<() => Promise<{ liveActivities: boolean; pushToStart: boolean }>>(
      async () => ({ liveActivities: false, pushToStart: false }),
    ),
    getPushToStartToken: vi.fn<() => Promise<{ token: string | null }>>(async () => ({
      token: null,
    })),
    addListener: vi.fn<() => Promise<Handle>>(async () => ({ remove: async () => {} })),
    removeAllListeners: vi.fn<() => Promise<void>>(async () => {}),
  },
}));

import { ActivityBridge } from "@lightcode/activity-bridge";
import type { RemotePushRegistration } from "@/shared/remote";
import type { RemoteDesktopClient } from "../remoteClient";
import {
  __resetPushRegistrationForTests,
  registerIfChanged,
  syncPushRegistration,
} from "./pushRegistration";

function setPlatform(platform: string): void {
  (globalThis as { Capacitor?: { getPlatform: () => string } }).Capacitor = {
    getPlatform: () => platform,
  };
}

const DEVICE_ID = "device-abcdef12";

function fakeClient() {
  return {
    registerPush: vi.fn<(reg: RemotePushRegistration) => Promise<void>>(async () => {}),
  } as unknown as RemoteDesktopClient & {
    registerPush: ReturnType<typeof vi.fn<(reg: RemotePushRegistration) => Promise<void>>>;
  };
}

function reg(partial: Partial<RemotePushRegistration>): RemotePushRegistration {
  return { deviceId: DEVICE_ID, platform: "ios", ...partial };
}

describe("registerIfChanged (fingerprint guard)", () => {
  beforeEach(() => {
    __resetPushRegistrationForTests();
  });

  it("sends the first registration and suppresses an identical repeat", async () => {
    const client = fakeClient();
    expect(await registerIfChanged(client, reg({ deviceToken: "tok" }))).toBe(true);
    expect(await registerIfChanged(client, reg({ deviceToken: "tok" }))).toBe(false);
    expect(client.registerPush).toHaveBeenCalledTimes(1);
  });

  it("sends again when a new token field appears", async () => {
    const client = fakeClient();
    await registerIfChanged(client, reg({ deviceToken: "tok" }));
    expect(await registerIfChanged(client, reg({ pushToStartToken: "pts" }))).toBe(true);
    // A re-send of the device token still dedupes against the merged state.
    expect(await registerIfChanged(client, reg({ deviceToken: "tok" }))).toBe(false);
    expect(client.registerPush).toHaveBeenCalledTimes(2);
  });

  it("treats a rotated activity token as a change", async () => {
    const client = fakeClient();
    await registerIfChanged(client, reg({ activityTokens: { a1: "t1" } }));
    expect(await registerIfChanged(client, reg({ activityTokens: { a1: "t1" } }))).toBe(false);
    expect(await registerIfChanged(client, reg({ activityTokens: { a1: "t2" } }))).toBe(true);
    expect(await registerIfChanged(client, reg({ activityTokens: { a2: "t3" } }))).toBe(true);
    expect(client.registerPush).toHaveBeenCalledTimes(3);
  });

  it("rolls back the fingerprint on failure so a retry re-sends", async () => {
    const client = fakeClient();
    client.registerPush.mockRejectedValueOnce(new Error("503"));
    expect(await registerIfChanged(client, reg({ deviceToken: "tok" }))).toBe(false);
    // The failed send left no cached state, so the same payload sends again.
    expect(await registerIfChanged(client, reg({ deviceToken: "tok" }))).toBe(true);
    expect(client.registerPush).toHaveBeenCalledTimes(2);
  });
});

describe("syncPushRegistration (platform-aware)", () => {
  beforeEach(() => {
    __resetPushRegistrationForTests();
    registrationHandlers.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete (globalThis as { Capacitor?: unknown }).Capacitor;
  });

  it("registers the FCM token as platform 'android' and skips ActivityBridge", async () => {
    setPlatform("android");
    const client = fakeClient();

    await syncPushRegistration(client, { deviceId: DEVICE_ID });
    // Deliver the FCM registration token via the captured "registration" listener.
    for (const handler of registrationHandlers) handler({ value: "fcm-token" });
    await Promise.resolve();

    expect(client.registerPush).toHaveBeenCalledWith(
      expect.objectContaining({ platform: "android", deviceToken: "fcm-token" }),
    );
    // No Live Activity work on Android.
    expect(ActivityBridge.getPushToStartToken).not.toHaveBeenCalled();
    expect(ActivityBridge.addListener).not.toHaveBeenCalled();
  });

  it("uses ActivityBridge on iOS", async () => {
    setPlatform("ios");
    const client = fakeClient();

    await syncPushRegistration(client, { deviceId: DEVICE_ID });
    for (const handler of registrationHandlers) handler({ value: "apns-token" });
    await Promise.resolve();

    expect(client.registerPush).toHaveBeenCalledWith(
      expect.objectContaining({ platform: "ios", deviceToken: "apns-token" }),
    );
    // iOS wires the per-activity token listener.
    expect(ActivityBridge.addListener).toHaveBeenCalledWith(
      "activityTokenUpdate",
      expect.any(Function),
    );
  });
});
