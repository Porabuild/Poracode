import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { RemotePushRegistration } from "@/shared/remote";
import { PushCoordinator } from "./PushCoordinator";
import { PushRegistrationStore, pushRegistrationsFilePath } from "./PushRegistrationStore";
import type { SendPush, SendPushResult } from "./pushGateway";

const ok: SendPushResult = { ok: true, status: 200, unregistered: false };
const gone: SendPushResult = { ok: false, status: 410, unregistered: true };
const route = {
  version: 1 as const,
  clientConnectionId: "00000000-0000-4000-8000-000000000001",
  desktopId: "synthetic-host",
};
const webSubscription = {
  endpoint: "https://fixture.test/subscription",
  expirationTime: null,
  keys: { auth: "synthetic-auth", p256dh: "synthetic-key" },
};

const cases: Array<{
  name: string;
  initial: RemotePushRegistration;
  replacement: RemotePushRegistration;
  endingActivity?: boolean;
  removeFirst?: boolean;
}> = [
  {
    name: "Android device",
    initial: { deviceId: "synthetic-android", platform: "android", deviceToken: "old" },
    replacement: { deviceId: "synthetic-android", platform: "android", deviceToken: "new" },
  },
  {
    name: "iOS device",
    initial: { deviceId: "synthetic-ios", platform: "ios", deviceToken: "old" },
    replacement: { deviceId: "synthetic-ios", platform: "ios", deviceToken: "new" },
  },
  {
    name: "iOS push-to-start",
    initial: { deviceId: "synthetic-ios", platform: "ios", pushToStartToken: "old" },
    replacement: { deviceId: "synthetic-ios", platform: "ios", pushToStartToken: "new" },
  },
  {
    name: "iOS activity update",
    initial: { deviceId: "synthetic-ios", platform: "ios", activityTokens: { activity: "old" } },
    replacement: {
      deviceId: "synthetic-ios",
      platform: "ios",
      activityTokens: { activity: "new" },
    },
  },
  {
    name: "iOS activity end",
    initial: { deviceId: "synthetic-ios", platform: "ios", activityTokens: { activity: "old" } },
    replacement: {
      deviceId: "synthetic-ios",
      platform: "ios",
      activityTokens: { activity: "new" },
    },
    endingActivity: true,
  },
  ...[
    { endpoint: "https://fixture.test/new-subscription" },
    { keys: { ...webSubscription.keys, auth: "new-auth" } },
    { keys: { ...webSubscription.keys, p256dh: "new-key" } },
  ].map((changed, index) => ({
    name: `web subscription field ${index}`,
    initial: {
      deviceId: "synthetic-web",
      platform: "web" as const,
      webPushSubscription: webSubscription,
      webAppBasePath: "/app",
    },
    replacement: {
      deviceId: "synthetic-web",
      platform: "web" as const,
      webPushSubscription: { ...webSubscription, ...changed },
      webAppBasePath: "/app",
    },
  })),
  {
    name: "legacy to routed identity",
    initial: { deviceId: "synthetic-android", platform: "android", deviceToken: "same-token" },
    replacement: {
      deviceId: "synthetic-android",
      platform: "android",
      deviceToken: "same-token",
      routing: route,
    },
    removeFirst: true,
  },
  {
    name: "routed host replacement",
    initial: {
      deviceId: "synthetic-android",
      platform: "android",
      deviceToken: "same-token",
      routing: route,
    },
    replacement: {
      deviceId: "synthetic-android",
      platform: "android",
      deviceToken: "same-token",
      routing: { ...route, desktopId: "new-host" },
    },
  },
  {
    name: "routed device replacement",
    initial: {
      deviceId: "synthetic-android",
      platform: "android",
      deviceToken: "same-token",
      routing: route,
    },
    replacement: {
      deviceId: "synthetic-new-device",
      platform: "android",
      deviceToken: "same-token",
      routing: route,
    },
  },
];

describe("late push registration rejection", () => {
  it.each(cases)(
    "preserves a replacement $name after the old request reports unregistered",
    async ({ initial, replacement, endingActivity, removeFirst }) => {
      const root = mkdtempSync(join(tmpdir(), "poracode-push-token-refresh-"));
      const store = new PushRegistrationStore(root);
      const held = Promise.withResolvers<SendPushResult>();
      const sendPush = vi.fn<SendPush>(() => held.promise);
      const coordinator = new PushCoordinator({
        store,
        sendPush,
        getThreads: () => [],
        getProjects: () => [],
        getSettings: () => ({ enabled: true, redactContent: true }),
      });
      const event = (status: "working" | "finished") =>
        coordinator.handleSupervisorEvent({
          type: "thread-state",
          threadId: "synthetic-thread",
          status,
          attention: "none",
          canResumeWithConfig: false,
        });
      try {
        store.upsert(initial);
        if (endingActivity) {
          sendPush.mockResolvedValueOnce(ok);
          event("working");
          await new Promise<void>((resolve) => setImmediate(resolve));
          sendPush.mockClear();
        }
        event(
          initial.pushToStartToken || (initial.activityTokens && !endingActivity)
            ? "working"
            : "finished",
        );
        expect(sendPush).toHaveBeenCalledOnce();
        if (removeFirst) store.remove(initial.deviceId, initial.routing);
        store.upsert(replacement);
        const file = pushRegistrationsFilePath(root);
        const before = readFileSync(file, "utf8");
        held.resolve(gone);
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(readFileSync(file, "utf8")).toBe(before);
        expect(store.list()).toHaveLength(1);
      } finally {
        held.resolve(ok);
        await coordinator.dispose();
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
